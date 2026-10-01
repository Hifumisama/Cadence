import "dotenv/config";
import { join, resolve } from "node:path";
import { mkdir } from "node:fs/promises";
import { and, eq } from "drizzle-orm";
import { db } from "../db";
import { assets, jobs, planPromptSections, planRefs, plans } from "../db/schema";
import { annulationDemandeeVideo, finirAnnulationVideo } from "../lib/annulation-db";
import { domaineDe, type DomaineGpu } from "../lib/gpu";
import { configLlm } from "../lib/llm/config";
import { assemblerPrompt } from "../lib/prompt";
import { getAllParams } from "../lib/params";
import { annulerCoteComfyUI, surveillerAnnulation } from "./annulation";
import { creerClientComfyUI } from "./comfyui";
import type { SubmissionInput } from "./comfyui/types";
import { libererAvant } from "./gpu";
import { prochaineGenerationEnAttente, traiterGenerationImage } from "./images";
import { decharger, llmJoignable } from "./llamaSwap";
import { prochaineTacheLlmEnAttente, traiterTacheLlm } from "./llm";
import { choisirProchaineTache, type TacheEnAttente } from "./ordonnanceur";
import { INTERVALLE_PURGE_MS, purgerEchecs } from "./purge";
import { reprendreOrphelines } from "./reprise";

const MEDIA_ROOT = resolve(process.env.MEDIA_ROOT ?? "./data");
const INTERVALLE_MS = Number(process.env.WORKER_INTERVAL_MS ?? 10_000);
const PAUSE_ENTRE_TACHES_MS = 1_000; // une tâche vient de finir : on enchaîne vite sur la suivante
const INTERVALLE_POLL_MS = 5_000;
const DUREE_MAX_POLL_MS = 30 * 60_000; // un plan H3 ne devrait jamais dépasser 30 min

const client = creerClientComfyUI();

async function prochainJobEnAttente() {
  const [job] = await db
    .select()
    .from(jobs)
    .where(eq(jobs.statut, "en_attente"))
    .orderBy(jobs.createdAt)
    .limit(1);
  return job ?? null;
}

async function construireSubmissionInput(
  planId: number,
  activerUpscale: boolean,
): Promise<SubmissionInput> {
  const [plan] = await db.select().from(plans).where(eq(plans.id, planId));
  if (!plan) throw new Error(`Plan ${planId} introuvable`);

  const [sections, refs] = await Promise.all([
    db.select().from(planPromptSections).where(eq(planPromptSections.planId, planId)),
    db
      .select({ type: planRefs.type, slot: planRefs.slot, fichier: assets.fichier })
      .from(planRefs)
      .leftJoin(assets, eq(planRefs.assetId, assets.id))
      .where(eq(planRefs.planId, planId)),
  ]);

  const promptAssemble = assemblerPrompt(sections);

  const cheminAsset = (fichier: string | null) =>
    fichier ? join(MEDIA_ROOT, "assets", fichier) : "";

  return {
    promptAssemble,
    seed: plan.seed ?? undefined,
    dureeSecondes: plan.dureeGenerationSecondes,
    fps: plan.fps,
    refsImage: refs
      .filter((r) => r.type === "picture" && r.fichier)
      .map((r) => ({ slot: r.slot, cheminLocal: cheminAsset(r.fichier) })),
    refsAudio: refs
      .filter((r) => r.type === "audio" && r.fichier)
      .map((r) => ({ slot: r.slot, cheminLocal: cheminAsset(r.fichier) })),
    refsVideo: refs
      .filter((r) => r.type === "video" && r.fichier)
      .map((r) => ({ slot: r.slot, cheminLocal: cheminAsset(r.fichier) })),
    activerUpscale,
  };
}

/** Distinction stricte (F04) : une API ComfyUI injoignable ne consomme
 * jamais une tentative — seul un vrai échec de rendu compte. Renvoie `true` si
 * le job est allé au bout (rendu, échec de rendu, rejeu), `false` s'il est resté
 * ou reparti en attente faute de ComfyUI : le worker patiente alors. */
async function traiterJob(job: typeof jobs.$inferSelect): Promise<boolean> {
  const disponible = await client.healthcheck();
  if (!disponible) {
    console.log(`[worker] ComfyUI injoignable — job ${job.id} reste en_attente`);
    return false;
  }

  // Prise gardée par le statut : un job annulé entre-temps (annulation directe d'une
  // vidéo en attente) ne doit pas être ressuscité.
  const prise = await db
    .update(jobs)
    .set({ statut: "en_cours", startedAt: new Date() })
    .where(and(eq(jobs.id, job.id), eq(jobs.statut, "en_attente")))
    .returning({ id: jobs.id });
  if (prise.length === 0) return true;
  await db.update(plans).set({ statut: "en_cours" }).where(eq(plans.id, job.planId));

  let promptId: string | null = null;
  let surveillance: ReturnType<typeof surveillerAnnulation> | null = null;

  /** Annulation demandée : on interrompt ComfyUI après avoir vérifié dans /queue que
   * c'est bien notre prompt, on ne récupère rien. Le job finit `echoue` / « Annulée »
   * SANS consommer de tentative ni déclencher le rejeu F04 ; le plan reprend l'état
   * de sa dernière réussite. */
  const annuler = async (): Promise<boolean> => {
    const issue = promptId ? await annulerCoteComfyUI(client, promptId) : "rien";
    console.log(`[worker] Job ${job.id} (plan ${job.planId}) annulé (${issue})`);
    await finirAnnulationVideo(job.id);
    return true;
  };

  try {
    const input = await construireSubmissionInput(job.planId, job.activerUpscale);

    for (const ref of [...input.refsImage, ...input.refsAudio, ...input.refsVideo]) {
      if (ref.cheminLocal) {
        await client.uploadRef(ref.cheminLocal, ref.cheminLocal.split(/[\\/]/).pop()!);
      }
    }

    promptId = await client.submit(input);
    await db.update(jobs).set({ comfyuiPromptId: promptId }).where(eq(jobs.id, job.id));

    // La sonde du drapeau réveille l'attente entre deux interrogations de /history :
    // une annulation n'attend pas les 5 s du rythme normal.
    surveillance = surveillerAnnulation(() => annulationDemandeeVideo(job.id));
    const debut = Date.now();
    while (Date.now() - debut < DUREE_MAX_POLL_MS) {
      if (await annulationDemandeeVideo(job.id)) return await annuler();
      const resultat = await client.poll(promptId);

      if (resultat.statut === "en_cours") {
        await Promise.race([new Promise((r) => setTimeout(r, INTERVALLE_POLL_MS)), surveillance.promesse]);
        continue;
      }

      if (resultat.statut === "erreur") {
        await gererEchecReel(job, resultat.message);
        return true;
      }

      // termine
      const dossierPlan = join(MEDIA_ROOT, "plans", String(job.planId));
      await mkdir(dossierPlan, { recursive: true });
      const nomFichier = resultat.cheminSortieDistant.split("/").pop()!;
      const cheminLocalCible = join(dossierPlan, nomFichier);
      await client.fetchOutput(resultat.cheminSortieDistant, cheminLocalCible);

      const cheminRelatif = `plans/${job.planId}/${nomFichier}`;
      // "previsualise" vs "termine" : le statut du plan reflète si la
      // dernière réussite était une prévisualisation (sans upscale) ou un
      // rendu final — voir db/schema.ts, planStatutEnum.
      const statutPlan = job.activerUpscale ? "termine" : "previsualise";
      await db
        .update(jobs)
        .set({ statut: "termine", cheminSortie: cheminRelatif, finishedAt: new Date() })
        .where(eq(jobs.id, job.id));
      await db.update(plans).set({ statut: statutPlan }).where(eq(plans.id, job.planId));
      console.log(`[worker] Job ${job.id} (plan ${job.planId}) -> ${statutPlan} (${cheminRelatif})`);
      return true;
    }

    await gererEchecReel(job, "Délai de génération dépassé (30 min)");
    return true;
  } catch (err) {
    // Une exception ici (réseau coupé en cours de route, ComfyUI qui plante
    // avant d'avoir répondu) est traitée comme une indisponibilité, pas comme
    // un échec de rendu : le job repart en_attente sans consommer de tentative.
    // Une annulation demandée prime : ce n'est pas une indisponibilité à rejouer.
    if (await annulationDemandeeVideo(job.id).catch(() => false)) return await annuler();
    console.warn(`[worker] Job ${job.id} interrompu (probable indisponibilité) :`, err);
    await db
      .update(jobs)
      .set({ statut: "en_attente", startedAt: null })
      .where(eq(jobs.id, job.id));
    return false;
  } finally {
    surveillance?.arreter();
  }
}

async function gererEchecReel(job: typeof jobs.$inferSelect, message: string) {
  const params = await getAllParams();
  const tentativesMax = Number(params.tentatives_max);

  if (job.tentative < tentativesMax) {
    await db
      .update(jobs)
      .set({ statut: "en_attente", tentative: job.tentative + 1, erreur: message, startedAt: null })
      .where(eq(jobs.id, job.id));
    await db.update(plans).set({ statut: "rejoue" }).where(eq(plans.id, job.planId));
    console.log(`[worker] Job ${job.id} échoué (tentative ${job.tentative}/${tentativesMax}), rejeu : ${message}`);
  } else {
    await db
      .update(jobs)
      .set({ statut: "echoue", erreur: message, finishedAt: new Date() })
      .where(eq(jobs.id, job.id));
    await db.update(plans).set({ statut: "echoue" }).where(eq(plans.id, job.planId));
    console.error(`[worker] Job ${job.id} signalé en échec après ${tentativesMax} tentatives : ${message}`);
  }
}

/** Domaine GPU de la dernière tâche menée au bout (ComfyUI ou LLM) ; null tant que
 * le worker n'en a fait aucune depuis son démarrage : le premier changement de
 * domaine décharge alors l'autre côté par prudence (worker/gpu.ts). */
let dernierDomaine: DomaineGpu | null = null;

const urlLlm = () => configLlm().url;

/** Une tâche par appel : la carte graphique ne fait qu'une chose à la fois,
 * ComfyUI et le LLM local confondus. Le choix (image, puis LLM, puis vidéo ; FIFO ;
 * sans préemption ; même domaine à égalité) vit dans ordonnanceur.ts. Un domaine
 * injoignable ne bloque pas l'autre : ses tâches restent en attente, on prend ce
 * qui peut tourner. Renvoie `true` si une tâche a été traitée. */
async function traiterProchaineTache(): Promise<boolean> {
  const [gen, job, run] = await Promise.all([prochaineGenerationEnAttente(), prochainJobEnAttente(), prochaineTacheLlmEnAttente()]);

  const comfyuiAttend = gen != null || job != null;
  const [comfyuiOk, llmOk] = await Promise.all([
    comfyuiAttend ? client.healthcheck() : Promise.resolve(false),
    run ? llmJoignable(urlLlm()).catch(() => false) : Promise.resolve(false),
  ]);

  const candidates: TacheEnAttente[] = [];
  if (gen && comfyuiOk) candidates.push({ genre: "image", id: gen.id, createdAt: gen.createdAt });
  if (run && llmOk) candidates.push({ genre: "llm", id: run.id, createdAt: run.createdAt });
  if (job && comfyuiOk) candidates.push({ genre: "video", id: job.id, createdAt: job.createdAt });
  if (candidates.length === 0) {
    // Rien de lançable : on garde le message d'indisponibilité de chaque domaine.
    if (comfyuiAttend) console.log("[worker] ComfyUI injoignable — les tâches d'images et de vidéo restent en attente");
    if (run) console.log("[worker] Serveur LLM injoignable — les appels d'agent restent en attente");
    return false;
  }

  const choix = choisirProchaineTache(candidates, dernierDomaine);
  if (!choix) return false;
  const domaine = domaineDe(choix.genre);

  // Même GPU : on décharge l'autre côté avant de commencer (au mieux, jamais bloquant).
  await libererAvant(dernierDomaine, domaine, {
    comfyui: () => client.libererMemoire(),
    llm: () => decharger(urlLlm()),
  });

  const fait =
    choix.genre === "image"
      ? await traiterGenerationImage(client, gen!, MEDIA_ROOT)
      : choix.genre === "llm"
        ? await traiterTacheLlm(run!)
        : await traiterJob(job!);
  if (fait) dernierDomaine = domaine;
  return fait;
}

async function boucle() {
  console.log(`[worker] Cadence worker démarré (mode ComfyUI : ${process.env.COMFYUI_MODE ?? "stub"})`);
  // Une seule fois, avant la première prise : ce qui était « en cours » appartenait
  // à un worker mort (voir worker/reprise.ts).
  try {
    const { images, videos, llm, annulees } = await reprendreOrphelines(MEDIA_ROOT);
    if (images || videos || llm || annulees) {
      console.log(`[worker] Reprise : ${images} image(s) et ${llm} appel(s) LLM interrompu(s), ${videos} vidéo(s) remise(s) en file, ${annulees} annulation(s) terminée(s)`);
    }
  } catch (err) {
    console.error("[worker] Reprise des tâches interrompues impossible :", err);
  }

  // Purge des échecs de plus de 24 h : une fois au démarrage, puis toutes les heures.
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

  while (true) {
    if (Date.now() - dernierePurge >= INTERVALLE_PURGE_MS) await purger();
    let fait = false;
    try {
      fait = await traiterProchaineTache();
    } catch (err) {
      console.error("[worker] Erreur de boucle :", err);
    }
    await new Promise((r) => setTimeout(r, fait ? PAUSE_ENTRE_TACHES_MS : INTERVALLE_MS));
  }
}

boucle();
