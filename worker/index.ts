import "dotenv/config";
import { LIBELLE_SOURCE_INVALIDE, MEGAPIXELS_VIDEO, continuiteEffective, etapesDuRendu, raccordImageARejouer, raisonSourceInvalide, type Continuite, type EtapeVideo } from "../lib/renders/video-steps";
import { essaiSourceDuLatent, planPrecedent, precedentEnRendu } from "../lib/clips/queries-continuity";
import { doitAttendreLePrecedent } from "../lib/clips/chains";
import { ficheChangeeDepuis } from "../lib/clips/stale-clips";
import { BudgetContexte, contexteTotalDepuisEnv, estimerContexte } from "../lib/llm/budget-context";
import { chargerSkill } from "../lib/llm/skills";
import { join, resolve } from "node:path";
import { mkdir, readFile } from "node:fs/promises";
import { and, eq, sql } from "drizzle-orm";
import { db } from "../db";
import { assets, jobs, planPromptSections, planRefs, plans } from "../db/schema";
import { finaliserLotsOrphelins } from "../lib/agents/batches";
import { annulationDemandeeVideo, finirAnnulationVideo } from "../lib/tasks/cancellation-db";
import { domaineDe } from "../lib/renders/gpu";
import { configLlm } from "../lib/llm/config";
import { cheminAssetMedia, cheminVoixMedia } from "../lib/media";
import { assemblerPrompt } from "../lib/clips/prompt";
import { raccordSansPlace, sectionsAvecRaccord } from "../lib/clips/clip-continuity";
import { getAllParams } from "../lib/params";
import { annulerCoteComfyUI, surveillerAnnulation } from "./cancellation";
import { attendreResultat, type IssueAttente } from "./waiting";
import { creerClientComfyUI } from "./comfyui";
import { ErreurEntreeInvalide, nomDistantDepuisChemin, verifierEntree, type WorkflowJson } from "./comfyui/mapping";
import {
  NODE_IDS_FINITION,
  NODE_IDS_GENERATION,
  dossierLatents,
  injecterFinition,
  injecterGeneration,
  injecterUpscale,
} from "./comfyui/mappingThreeSteps";
import type { Suivi, SubmissionInput } from "./comfyui/types";
import { creerRelaisJob } from "./progress";
import { libererAvant } from "./gpu";
import { VerrouGpu } from "./gpu-lock";
import { demarrerSondeVram, journaliserTache, noterEvenement } from "./log";
import { prochaineGenerationEnAttente, traiterGenerationImage } from "./images";
import { preparerRaccord } from "./continuity";
import { decharger, llmJoignable } from "./llamaSwap";
import { echouerAppelsEnAttente, prochaineTacheLlmEnAttente, traiterTacheLlm } from "./llm";
import { SKILL_H3IR, SKILL_TRADUCTION } from "./h3ir";
import { JETONS_COMPILATEUR_H3IR } from "../lib/llm/budget-context";
import { attenteDepassee, effacerSonde, noterSonde } from "./availability";
import { piloterCreations } from "../lib/agents/creation-db";
import { projetEnCreation } from "./creation";
import { piloterDemandes } from "../lib/tasks/requests-db";
import { choisirProchaineTache, type TacheEnAttente } from "./scheduler";
import { INTERVALLE_PURGE_MS, purgerEchecs } from "./purge";
import { reprendreExports, traiterProchainExport } from "./montage-export";
import { reprendreOrphelines } from "./resume";

const MEDIA_ROOT = resolve(process.env.MEDIA_ROOT ?? "./data");
const INTERVALLE_MS = Number(process.env.WORKER_INTERVAL_MS ?? 10_000);
/** LLM calls at the same time (default 1): to be set to the `--parallel` of the llama.cpp server. */
const LLM_PARALLELE = Math.max(1, Math.floor(Number(process.env.LLM_PARALLELE ?? 1)) || 1);
const budgetContexte = new BudgetContexte(contexteTotalDepuisEnv(), LLM_PARALLELE);
const PAUSE_ENTRE_TACHES_MS = 1_000; // a task has just finished: we chain quickly onto the next
const INTERVALLE_POLL_MS = 5_000;
const INTERVALLE_DEMANDES_MS = 2_000; // a request is in progress: we check often whether its step has finished
const DUREE_MAX_POLL_MS = 30 * 60_000; // a H3 clip should never exceed 30 min

const client = creerClientComfyUI();

/** The three video workflows (contract: workflows/README.md). Paths can be overridden; re-read at each step (a re-exported file is taken right away). */
const CHEMINS_WORKFLOWS: Record<EtapeVideo, { normal: string; suite?: string }> = {
  generation: {
    normal: process.env.COMFYUI_WORKFLOW_GENERATION_PATH ?? "./workflows/video-generation/VID_Generation.json",
    suite: process.env.COMFYUI_WORKFLOW_GENERATION_SUITE_PATH ?? "./workflows/video-generation/VID_Generation_suite.json",
  },
  upscale: { normal: process.env.COMFYUI_WORKFLOW_UPSCALE_PATH ?? "./workflows/video-generation/VID_UPSCALE.json" },
  finition: {
    normal: process.env.COMFYUI_WORKFLOW_FINITION_PATH ?? "./workflows/video-generation/VID_Finition.json",
    suite: process.env.COMFYUI_WORKFLOW_FINITION_SUITE_PATH ?? "./workflows/video-generation/VID_Finition_suite.json",
  },
};
/** `suite`: the clip extends the previous one through the latent (Motion Context): the generation loads its context, the finishing removes the context prefix. */
const chargerWorkflow = async (etape: EtapeVideo, suite: boolean): Promise<WorkflowJson> => {
  const chemins = CHEMINS_WORKFLOWS[etape];
  return JSON.parse(await readFile(resolve((suite ? chemins.suite : undefined) ?? chemins.normal), "utf-8"));
};

async function prochainJobEnAttente() {
  const enAttente = await db
    .select()
    .from(jobs)
    .where(eq(jobs.statut, "en_attente"))
    // The render of a request (iteration) goes before the other videos: see worker/scheduler.ts.
    .orderBy(sql`(${jobs.demandeId} is null)`, jobs.createdAt)
    .limit(50);
  // A clip in « suite » restarts from the render of its previous one: as long as that one has a render queued or in progress, it waits (even if queued before it). The oldest
  // render that is not waiting for anyone goes through. Never a deadlock: we go up `ordre` from clip to clip, the chain is finite.
  for (const job of enAttente) {
    const [plan] = await db.select({ episodeId: plans.episodeId, ordre: plans.ordre, liaison: plans.liaison }).from(plans).where(eq(plans.id, job.planId));
    if (plan && doitAttendreLePrecedent(plan.liaison, await precedentEnRendu(plan))) continue;
    return job;
  }
  return null;
}

/** What the worker submits, and what it keeps of the attempt: `promptFiche` is the prompt of the SHEET (without the declaration of the continuity image, which the
 * code adds to the submitted prompt only); `raccordJobId` is the attempt of the previous clip whose last image serves as first image. */
async function construireSubmissionInput(
  planId: number,
  activerUpscale: boolean,
  /** A final render that resumes the latent of a preview replays the continuity of that preview (`undefined`: today's one; `null`: none). */
  raccordImpose?: number | null,
): Promise<{ input: SubmissionInput; promptFiche: string; raccordJobId: number | null; plan: typeof plans.$inferSelect }> {
  const [plan] = await db.select().from(plans).where(eq(plans.id, planId));
  if (!plan) throw new Error(`Plan ${planId} introuvable`);

  const [sections, refs] = await Promise.all([
    db.select().from(planPromptSections).where(eq(planPromptSections.planId, planId)),
    db
      .select({ type: planRefs.type, slot: planRefs.slot, fichier: assets.fichier, assetId: assets.id, assetType: assets.type, voixMaster: assets.voixMaster })
      .from(planRefs)
      .leftJoin(assets, eq(planRefs.assetId, assets.id))
      .where(eq(planRefs.planId, planId)),
  ]);

  const promptFiche = assemblerPrompt(sections);

  // A MEDIA_ROOT file -> local path + unique name on the ComfyUI side (no collision between two clips,
  // two takes with the same name, nor with the user's files in the input folder).
  const ref = (cheminRelatif: string) => ({
    cheminLocal: join(MEDIA_ROOT, cheminRelatif),
    nomDistant: nomDistantDepuisChemin(cheminRelatif),
  });
  const refAsset = (fichier: string | null) => ref(cheminAssetMedia(fichier ?? ""));

  // Audio: the characters' voices. The prompt is the source
  // of the lines (2026-10-14): the voice of a speaking character is an audio reference of the sheet whose asset is the CHARACTER
  // (its master); without a master, the video model invents the voice (never blocking).
  const audioVoix = refs
    .filter((r) => r.type === "audio" && r.assetType === "personnage")
    .flatMap((r) => (r.voixMaster && r.assetId != null ? [{ slot: r.slot, ...ref(cheminVoixMedia(r.assetId, r.voixMaster)), dureeSecondes: null as number | null }] : []));

  const refsImage = refs
    .filter((r) => r.type === "picture" && r.fichier)
    .map((r) => ({ slot: r.slot, ...refAsset(r.fichier) }));
  const refsVideo = refs
    .filter((r) => r.type === "video" && r.fichier)
    .map((r) => ({ slot: r.slot, ...refAsset(r.fichier) }));

  // « suite » link: the last image of the render of the previous clip becomes the first image of the first shot (ephemeral, lib/clips/clip-continuity.ts).
  const raccord = await preparerRaccord(plan, refsImage.map((r) => r.slot), refsVideo.length, raccordImpose);

  return {
    promptFiche,
    plan,
    raccordJobId: raccord?.sourceJobId ?? null,
    input: {
      promptAssemble: raccord ? assemblerPrompt(sectionsAvecRaccord(sections, raccord.slot)) : promptFiche,
      seed: plan.seed ?? undefined,
      dureeSecondes: plan.dureeGenerationSecondes,
      fps: plan.fps,
      refsImage: raccord ? [...refsImage, raccord.ref] : refsImage,
      refsAudio: audioVoix,
      refsVideo,
      activerUpscale,
      megapixels: MEGAPIXELS_VIDEO,
    },
  };
}

/** The job and its clip change state TOGETHER: never a finished job whose clip stays « en cours ». */
async function cloreJob(job: typeof jobs.$inferSelect, jobSet: Partial<typeof jobs.$inferInsert>, statutPlan: typeof plans.$inferSelect["statut"]) {
  await db.transaction(async (tx) => {
    await tx.update(jobs).set(jobSet).where(eq(jobs.id, job.id));
    await tx.update(plans).set({ statut: statutPlan }).where(eq(plans.id, job.planId));
  });
}

/** Strict distinction (F04): an unreachable ComfyUI API never consumes
 * an attempt — only a real render failure counts. Returns `true` if
 * the job went all the way (render, render failure, replay), `false` if it stayed
 * or went back to waiting for lack of ComfyUI: the worker then waits. */
async function traiterJob(job: typeof jobs.$inferSelect): Promise<boolean> {
  // Taking guarded by the status: a job cancelled in the meantime (direct cancellation of a
  // pending video) must not be revived.
  const prise = await db
    .update(jobs)
    .set({ statut: "en_cours", startedAt: new Date() })
    .where(and(eq(jobs.id, job.id), eq(jobs.statut, "en_attente")))
    .returning({ id: jobs.id });
  if (prise.length === 0) return true;
  await db.update(plans).set({ statut: "en_cours" }).where(eq(plans.id, job.planId));

  let promptId: string | null = null;
  let surveillance: ReturnType<typeof surveillerAnnulation> | null = null;
  let suivi: Suivi | null = null;
  let relais: ReturnType<typeof creerRelaisJob> | null = null;

  /** Cancellation requested: we interrupt ComfyUI after having checked in /queue that
   * it is indeed our prompt, we retrieve nothing. The job ends `echoue` / « Annulée »
   * WITHOUT consuming an attempt nor triggering the F04 replay; the clip takes back the state
   * of its last success. */
  const annuler = async (): Promise<boolean> => {
    const issue = promptId ? await annulerCoteComfyUI(client, promptId) : "rien";
    console.log(`[worker] Job ${job.id} (plan ${job.planId}) annulé (${issue})`);
    await finirAnnulationVideo(job.id);
    return true;
  };

  try {
    // The steps of THIS render (docs/PLAN_INTEGRATION_WORKER.md): a preview is the generation; a final render is the upscale then the finishing, and
    // restarts from the latent of the selected preview as long as the sheet has not changed since (otherwise the clip is regenerated first: that is the choice of
    // whoever put it in the batch).
    const [source] = job.activerUpscale && job.jobSourceId != null ? await db.select().from(jobs).where(eq(jobs.id, job.jobSourceId)) : [];
    const ficheModifiee = source ? await ficheChangeeDepuis(job.planId, source) : false;
    // Only a preview has a first-pass latent to resume (the latents of a final render are those of the upscale).
    const raisonSource = raisonSourceInvalide(source ? { statut: source.statut, latentDossier: source.activerUpscale ? null : source.latentDossier } : null, ficheModifiee);
    const etapes = etapesDuRendu(job.activerUpscale, raisonSource === null);
    if (job.activerUpscale && raisonSource) {
      console.log(`[worker] Job ${job.id} (plan ${job.planId}) : ${LIBELLE_SOURCE_INVALIDE[raisonSource]} : le plan est régénéré avant l'upscale`);
    }
    const depuisSource = etapes[0] !== "generation";
    const dossierPropre = dossierLatents(job.planId, job.numeroRendu, job.tentative);
    const dossierGen = depuisSource ? source!.latentDossier! : dossierPropre;

    // Clip in suite: if the previous clip kept the latent of its first pass, it feeds Motion Context (continuity through the latent); otherwise the continuity
    // image, as before. A render that resumes a preview keeps its continuity (the conditioning of the upscale must be the same).
    const [planAvant] = await db.select().from(plans).where(eq(plans.id, job.planId));
    const precedent = !depuisSource && planAvant?.liaison === "suite" ? await planPrecedent(planAvant) : null;
    const contexte = precedent ? await essaiSourceDuLatent(precedent) : null;

    const { input, promptFiche, raccordJobId, plan: lePlan } = await construireSubmissionInput(
      job.planId,
      job.activerUpscale,
      depuisSource ? raccordImageARejouer(source!) : contexte ? null : undefined,
    );
    const continuite: Continuite | null = depuisSource ? continuiteEffective(source!) : contexte ? "latent" : raccordJobId != null ? "image" : null;
    // A file prefix specific to this render: no more name collisions, nor a cached result served to another render.
    input.prefixeSortie = `cadence_p${job.planId}_r${job.numeroRendu}${job.tentative > 1 ? `_t${job.tentative}` : ""}`;
    verifierEntree(input); // duration outside 4-10 s, too many references: clear failure (see catch)
    // What is kept on the render: the prompt of the SHEET (to compare two renders and see that a modification did not move the prompt;
    // « Repartir de là » restores it) and, if there is one, the attempt the continuity image comes from.
    // A « suite » clip without continuity image for lack of a free slot: nothing blocks (the generation goes as before), but the attempt says so.
    const raccordSansPlaceLibre = lePlan.liaison === "suite" && !depuisSource && continuite == null && raccordSansPlace(input.refsImage.length + input.refsVideo.length);
    const alertes = raccordSansPlaceLibre
      ? [...(job.alertesIteration ?? []), "Pas d'image de raccord : les références du plan occupent tous les emplacements. Retire une référence pour que la dernière image du plan précédent soit reprise."]
      : undefined;
    await db
      .update(jobs)
      .set({
        promptUtilise: promptFiche,
        // The attempt of the previous clip that this render extends through the image or the latent (that of the resumed preview, for a final render that starts from it).
        raccordJobId: depuisSource ? source!.raccordJobId : contexte ? contexte.id : raccordJobId,
        continuite,
        dureeUtilisee: input.dureeSecondes,
        seedUtilisee: input.seed ?? null,
        descriptionUtilisee: lePlan.description ?? null,
        // The folder where this render stores its latents (the first pass of a preview, the upscale of a final render); the resumed preview, if it is one.
        latentDossier: dossierPropre,
        jobSourceId: depuisSource ? job.jobSourceId : null,
        ...(alertes ? { alertesIteration: alertes } : {}),
      })
      .where(eq(jobs.id, job.id));

    for (const ref of [...input.refsImage, ...input.refsAudio, ...input.refsVideo]) {
      if (ref.cheminLocal) {
        await client.uploadRef(ref.cheminLocal, ref.nomDistant ?? ref.cheminLocal.split(/[\\/]/).pop()!);
      }
    }

    relais = creerRelaisJob(job.id);
    const relaisActif = relais;
    // The flag probe wakes the wait between two /history polls:
    // a cancellation does not wait for the 5 s of the normal rhythm.
    surveillance = surveillerAnnulation(() => annulationDemandeeVideo(job.id));

    // One prompt per step. The last one gives the render's file (the draft of a preview, the final video of a final render); the others
    // have no file to retrieve (latent saved on ComfyUI): their end is read in /history.
    const grapheDe = async (etape: EtapeVideo): Promise<WorkflowJson> => {
      const workflow = await chargerWorkflow(etape, continuite === "latent");
      if (etape === "generation") {
        // In a final render that regenerates, the draft is not the result: its prefix distinguishes it from the final video.
        const prefixe = job.activerUpscale ? `brouillon_${input.prefixeSortie}` : input.prefixeSortie;
        return injecterGeneration(workflow, { ...input, prefixeSortie: prefixe }, dossierPropre, continuite === "latent" ? contexte?.latentDossier : undefined);
      }
      if (etape === "upscale") return injecterUpscale(workflow, input, dossierGen, dossierPropre);
      return injecterFinition(workflow, dossierGen, dossierPropre, input.prefixeSortie);
    };
    const nodeSortie = job.activerUpscale ? NODE_IDS_FINITION.sortie : NODE_IDS_GENERATION.apercu;

    let resultat: Extract<IssueAttente, { statut: "termine" }> | null = null;
    for (const [i, etape] of etapes.entries()) {
      const graphe = await grapheDe(etape);
      relaisActif.definirEtape(i + 1, etapes.length);
      // The WebSocket opens BEFORE the submission; it decides nothing (the result comes from /history): it only serves to
      // show the current step. If it drops or does not exist (stub), the render proceeds without progress.
      suivi?.fermer();
      suivi = await client.ouvrirSuivi((e) => relaisActif.surEvenement(e)).catch(() => null);
      promptId = await client.submitGraph(graphe);
      await db.update(jobs).set({ comfyuiPromptId: promptId }).where(eq(jobs.id, job.id));

      const idPrompt = promptId;
      const dernier = i === etapes.length - 1;
      const issue = await attendreResultat({
        suivi,
        promptId: idPrompt,
        delaiMs: DUREE_MAX_POLL_MS,
        intervalleMs: INTERVALLE_POLL_MS,
        lire: () => (dernier ? client.pollImage(idPrompt, nodeSortie) : client.pollFin(idPrompt)),
        surveillance,
      });
      if (issue === "annulee") return await annuler();
      if (issue === "delai") {
        await gererEchecReel(job, `Délai de génération dépassé (30 min, étape ${etape})`);
        return true;
      }
      if (issue.statut === "erreur") {
        await gererEchecReel(job, `Étape ${etape} : ${issue.message}`);
        return true;
      }
      resultat = issue;
    }
    if (!resultat) throw new Error("Rendu sans étape");

    const dossierPlan = join(MEDIA_ROOT, "plans", String(job.planId));
    await mkdir(dossierPlan, { recursive: true });
    const nomFichier = resultat.cheminSortieDistant.split("/").pop()!;
    const cheminLocalCible = join(dossierPlan, nomFichier);
    await client.fetchOutput(resultat.cheminSortieDistant, cheminLocalCible);

    const cheminRelatif = `plans/${job.planId}/${nomFichier}`;
    // "previsualise" vs "termine": the clip's status reflects whether the
    // last success was a preview (without upscale) or a
    // final render — see db/schema.ts, planStatutEnum.
    const statutPlan = job.activerUpscale ? "termine" : "previsualise";
    await cloreJob(job, { statut: "termine", cheminSortie: cheminRelatif, finishedAt: new Date() }, statutPlan);
    console.log(`[worker] Job ${job.id} (plan ${job.planId}) -> ${statutPlan} (${cheminRelatif})`);
    return true;
  } catch (err) {
    // Input that nothing will make valid by retrying: final failure, without replay or wait.
    if (err instanceof ErreurEntreeInvalide) {
      await cloreJob(job, { statut: "echoue", erreur: err.message, finishedAt: new Date() }, "echoue");
      console.error(`[worker] Job ${job.id} (plan ${job.planId}) refusé avant soumission : ${err.message}`);
      return true;
    }
    // An exception here (network cut midway, ComfyUI crashing
    // before answering) is treated as an unavailability, not as
    // a render failure: the job goes back to en_attente without consuming an attempt.
    // A cancellation requested takes precedence: it is not an unavailability to replay.
    if (await annulationDemandeeVideo(job.id).catch(() => false)) return await annuler();
    // ComfyUI still answers: this is not an unavailability but a real error (rejected graph, missing asset file, unreadable workflow…).
    // Replaying it forever would block every later job (the queue always takes the oldest first): it goes through the bounded failure path.
    if (await client.healthcheck().catch(() => false)) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[worker] Job ${job.id} en erreur alors que ComfyUI répond :`, err);
      await gererEchecReel(job, message);
      return true;
    }
    console.warn(`[worker] Job ${job.id} interrompu (probable indisponibilité) :`, err);
    await db
      .update(jobs)
      .set({ statut: "en_attente", startedAt: null })
      .where(eq(jobs.id, job.id));
    return false;
  } finally {
    surveillance?.arreter();
    suivi?.fermer();
    await relais?.nettoyer();
  }
}

async function gererEchecReel(job: typeof jobs.$inferSelect, message: string) {
  const params = await getAllParams();
  const tentativesMax = Number(params.tentatives_max);

  if (job.tentative < tentativesMax) {
    await cloreJob(job, { statut: "en_attente", tentative: job.tentative + 1, erreur: message, startedAt: null }, "rejoue");
    console.log(`[worker] Job ${job.id} échoué (tentative ${job.tentative}/${tentativesMax}), rejeu : ${message}`);
  } else {
    await cloreJob(job, { statut: "echoue", erreur: message, finishedAt: new Date() }, "echoue");
    console.error(`[worker] Job ${job.id} signalé en échec après ${tentativesMax} tentatives : ${message}`);
  }
}

/** ComfyUI may have kept models in memory since the last release (true at startup: unknown). A creation task,
 * which takes the card alone, only releases it in that case. */
let comfyuiPeutEtreCharge = true;

const urlLlm = () => configLlm().url;

/** The tasks that do not fit next to the other lane (the upscale goes up to 13 GB) take the exclusive lock. */
const verrou = new VerrouGpu();

const journalLiberation = (message: string) => {
  console.log(message);
  noterEvenement("liberation", { message });
};

export type Voie = "comfyui" | "llm";

/** One task per call on the given lane: one loop per lane, ComfyUI and LLM work at the same time (the card's VRAM accommodates them together; only the upscale and the creation of a project take the card alone). The choice (image, then LLM, then video; FIFO; no preemption; same domain on a
 * tie) lives in scheduler.ts. An unreachable domain does not block the other: its tasks stay pending,
 * we take what can run. Returns `true` if a task was processed. */
async function traiterProchaineTache(voie: Voie): Promise<boolean> {
  const avecComfyui = voie === "comfyui";
  const avecLlm = voie === "llm";
  const [gen, job, runBrut] = await Promise.all([
    avecComfyui ? prochaineGenerationEnAttente() : null,
    avecComfyui ? prochainJobEnAttente() : null,
    avecLlm ? prochaineTacheLlmEnAttente() : null,
  ]);
  // Parallel calls share the server's context: it is only taken if it fits next to those in flight (lib/llm/budget-context.ts).
  // The room is reserved right away (no `await` between the test and the reservation) and returned at the end of the turn, whatever it is.
  // `plan-h3ir` (Open H3 IR) has no skill folder: we count that of its translation (the Python compiler adds its own calls, see JETONS_COMPILATEUR_H3IR).
  const run = runBrut && budgetContexte.reserver(runBrut.id, estimerContexte(runBrut.skill, chargerSkill(runBrut.skill === SKILL_H3IR ? SKILL_TRADUCTION : runBrut.skill).jetonsEstimes + (runBrut.skill === SKILL_H3IR ? JETONS_COMPILATEUR_H3IR : 0), runBrut.entree)) ? runBrut : null;
  let parti = false; // the call was actually sent: its context stays in the server's cache
  try {

  const comfyuiAttend = gen != null || job != null;
  const [comfyuiOk, llmOk] = await Promise.all([
    comfyuiAttend ? client.healthcheck() : Promise.resolve(false),
    run ? llmJoignable(urlLlm(), fetch, configLlm().routeSante).catch(() => false) : Promise.resolve(false),
  ]);

  // Availability recorded for the header (« injoignable » badge); with nothing pending, nothing to report.
  const [, depuisLlm] = await Promise.all([
    avecComfyui ? (comfyuiAttend ? noterSonde("comfyui", comfyuiOk) : effacerSonde("comfyui")) : null,
    avecLlm ? (run ? noterSonde("llm", llmOk) : effacerSonde("llm")) : null,
  ]);
  // An LLM server silent for too long: the pending calls fail (restartable), they no longer block
  // the conversation. ComfyUI keeps its wait (a video or an image is put back in the queue by hand).
  const { injoignableMaxMs } = configLlm();
  if (run && !llmOk && attenteDepassee(depuisLlm, Date.now(), injoignableMaxMs)) {
    const n = await echouerAppelsEnAttente(
      `Serveur LLM injoignable depuis plus de ${Math.round(injoignableMaxMs / 60_000)} min (${urlLlm()}) : relance quand il répond.`,
    );
    console.log(`[worker] Serveur LLM injoignable depuis trop longtemps — ${n} appel(s) en attente passé(s) en échec`);
  }

  const candidates: TacheEnAttente[] = [];
  if (gen && comfyuiOk) candidates.push({ genre: "image", id: gen.id, createdAt: gen.createdAt });
  if (run && llmOk) candidates.push({ genre: "llm", id: run.id, createdAt: run.createdAt, demande: run.demandeId != null });
  if (job && comfyuiOk) candidates.push({ genre: "video", id: job.id, createdAt: job.createdAt, demande: job.demandeId != null });
  if (candidates.length === 0) {
    // Nothing runnable: we keep the unavailability message of each domain.
    if (comfyuiAttend) console.log("[worker] ComfyUI injoignable — les tâches d'images et de vidéo restent en attente");
    if (run) console.log("[worker] Serveur LLM injoignable — les appels d'agent restent en attente");
    return false;
  }

  const choix = choisirProchaineTache(candidates);
  if (!choix) return false;
  const domaine = domaineDe(choix.genre);
  const upscale = choix.genre === "video" && job!.activerUpscale;
  // Project creation (2026-10-19): the installer's large model fits in VRAM, ComfyUI must not be loaded. Its calls
  // take the card alone (running tasks finish, nothing starts next to them) and ComfyUI is released before the first one.
  const creation = choix.genre === "llm" && (await projetEnCreation(run!.projectId));

  noterEvenement("choix", { genre: choix.genre, id: choix.id, voie, enAttente: candidates.map((c) => `${c.genre}:${c.id}`) });
  return await verrou.avec(upscale || creation, async () => {
    // Same GPU: only the upscale unloads the LLM (it does not fit next to it), and the creation unloads ComfyUI. Best effort, never blocking.
    const debutLiberation = Date.now();
    const liberateurs = { comfyui: () => client.libererMemoire(), llm: () => decharger(urlLlm()) };
    const liberee = upscale
      ? await libererAvant(null, "comfyui", liberateurs, journalLiberation)
      : creation && comfyuiPeutEtreCharge
        ? await libererAvant(null, "llm", liberateurs, journalLiberation)
        : null;
    if (liberee === "comfyui") comfyuiPeutEtreCharge = false;
    if (liberee) noterEvenement("liberation_duree", { liberee, dureeMs: Date.now() - debutLiberation });

    const fait = await journaliserTache(choix.genre, choix.id, domaine, async () =>
      choix.genre === "image"
        ? await traiterGenerationImage(client, gen!, MEDIA_ROOT)
        : choix.genre === "llm"
          ? ((parti = true), await traiterTacheLlm(run!))
          : await traiterJob(job!),
    );
    if (domaine === "comfyui") comfyuiPeutEtreCharge = true;
    return fait;
    // The calls of a creation share the LLM server's slots: exclusive against the rest, not among themselves.
  }, creation && !upscale ? "creation" : null);
  } finally {
    if (runBrut) budgetContexte.liberer(runBrut.id, parti);
  }
}

async function boucle() {
  console.log(`[worker] Cadence worker démarré (mode ComfyUI : ${process.env.COMFYUI_MODE ?? "stub"})`);
  demarrerSondeVram(process.env.COMFYUI_URL, urlLlm());
  noterEvenement("demarrage");
  // Only once, before the first take: what was « en cours » belonged
  // to a dead worker (see worker/resume.ts).
  try {
    const { images, videos, llm, annulees } = await reprendreOrphelines(MEDIA_ROOT);
    if (images || videos || llm || annulees) {
      console.log(`[worker] Reprise : ${images} image(s) et ${llm} appel(s) LLM interrompu(s), ${videos} vidéo(s) remise(s) en file, ${annulees} annulation(s) terminée(s)`);
    }
    // A batch whose running task has just been interrupted no longer waits for it: its status
    // (ready with a failure to restart, or failed) is caught up here.
    const lots = await finaliserLotsOrphelins();
    if (lots) console.log(`[worker] Reprise : ${lots} lot(s) d'agent rattrapé(s)`);
    const exports = await reprendreExports();
    if (exports) console.log(`[worker] Reprise : ${exports} export(s) d'épisode remis en file`);
  } catch (err) {
    console.error("[worker] Reprise des tâches interrompues impossible :", err);
  }

  // Purge of failures older than 24 h: once at startup, then every hour.
  let dernierePurge = 0;
  const purger = async () => {
    dernierePurge = Date.now();
    try {
      const { images, videos, llm } = await purgerEchecs(MEDIA_ROOT);
      if (images || videos || llm) console.log(`[worker] Purge : ${images} génération(s), ${videos} job(s) annulé(s) et ${llm} appel(s) LLM de plus de 24 h supprimés`);
    } catch (err) {
      console.error("[worker] Purge des échecs impossible :", err);
    }
  };
  await purger();

  // The loops: one per lane (ComfyUI, LLM). The installer and the purge never touch the GPU: they have their own loop and do not
  // delay any task.
  // Several LLM loops = several calls at the same time: as many as there are slots (`--parallel`) on the llama.cpp server.
  const voies: Voie[] = ["comfyui", ...Array.from({ length: LLM_PARALLELE }, (): Voie => "llm")];
  await Promise.all([
    ...voies.map(async (v) => {
      while (true) {
        let fait = false;
        try {
          fait = await traiterProchaineTache(v);
        } catch (err) {
          console.error(`[worker] Erreur de boucle (${v}) :`, err);
        }
        await new Promise((r) => setTimeout(r, fait ? PAUSE_ENTRE_TACHES_MS : INTERVALLE_MS));
      }
    }),
    (async () => {
      while (true) {
        if (Date.now() - dernierePurge >= INTERVALLE_PURGE_MS) await purger();
        let fait = false;
        // The installer: at most one transition per creation in progress (launch a step, apply, restart the failures).
        try {
          if (await piloterCreations()) fait = true;
        } catch (err) {
          console.error("[worker] Installateur :", err);
        }
        // The requests (iterate a clip…): at most one transition per request in progress. As long as there are some, we come back quickly: each
        // step that finishes must launch the next one without waiting for the long interval (no visible gap between two steps).
        let demandesActives = 0;
        try {
          const r = await piloterDemandes();
          demandesActives = r.actives;
          if (r.touchees > 0) fait = true;
        } catch (err) {
          console.error("[worker] Demandes :", err);
        }
        await new Promise((r) => setTimeout(r, fait ? PAUSE_ENTRE_TACHES_MS : demandesActives > 0 ? INTERVALLE_DEMANDES_MS : INTERVALLE_MS));
      }
    })(),
    // The episode exports (Montage page): ffmpeg on the processor, never the GPU. Their own loop: a long encoding delays
    // neither the installer nor the requests (worker/montage-export.ts).
    (async () => {
      while (true) {
        let fait = false;
        try {
          fait = await traiterProchainExport(MEDIA_ROOT);
        } catch (err) {
          console.error("[worker] Export d'épisode :", err);
        }
        await new Promise((r) => setTimeout(r, fait ? PAUSE_ENTRE_TACHES_MS : INTERVALLE_MS));
      }
    })(),
  ]);
}

boucle();
