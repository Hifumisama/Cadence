import "dotenv/config";
import { join, resolve } from "node:path";
import { mkdir } from "node:fs/promises";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { assets, jobs, planPromptSections, planRefs, plans } from "../db/schema";
import { assemblerPrompt } from "../lib/prompt";
import { getAllParams } from "../lib/params";
import { creerClientComfyUI } from "./comfyui";
import type { SubmissionInput } from "./comfyui/types";
import { prochaineGenerationEnAttente, traiterGenerationImage } from "./images";
import { choisirProchaineTache, type TacheEnAttente } from "./ordonnanceur";
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

  await db.update(jobs).set({ statut: "en_cours", startedAt: new Date() }).where(eq(jobs.id, job.id));
  await db.update(plans).set({ statut: "en_cours" }).where(eq(plans.id, job.planId));

  try {
    const input = await construireSubmissionInput(job.planId, job.activerUpscale);

    for (const ref of [...input.refsImage, ...input.refsAudio, ...input.refsVideo]) {
      if (ref.cheminLocal) {
        await client.uploadRef(ref.cheminLocal, ref.cheminLocal.split(/[\\/]/).pop()!);
      }
    }

    const promptId = await client.submit(input);
    await db.update(jobs).set({ comfyuiPromptId: promptId }).where(eq(jobs.id, job.id));

    const debut = Date.now();
    while (Date.now() - debut < DUREE_MAX_POLL_MS) {
      const resultat = await client.poll(promptId);

      if (resultat.statut === "en_cours") {
        await new Promise((r) => setTimeout(r, INTERVALLE_POLL_MS));
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
    console.warn(`[worker] Job ${job.id} interrompu (probable indisponibilité) :`, err);
    await db
      .update(jobs)
      .set({ statut: "en_attente", startedAt: null })
      .where(eq(jobs.id, job.id));
    return false;
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

/** Une tâche par appel : la carte graphique ne fait qu'une chose à la fois. Le
 * choix (images avant vidéo, FIFO, sans préemption) vit dans ordonnanceur.ts.
 * Renvoie `true` si une tâche a été traitée. */
async function traiterProchaineTache(): Promise<boolean> {
  const [gen, job] = await Promise.all([prochaineGenerationEnAttente(), prochainJobEnAttente()]);
  const candidates: TacheEnAttente[] = [];
  if (gen) candidates.push({ genre: "image", id: gen.id, createdAt: gen.createdAt });
  if (job) candidates.push({ genre: "video", id: job.id, createdAt: job.createdAt });

  const choix = choisirProchaineTache(candidates);
  if (!choix) return false;
  return choix.genre === "image" ? traiterGenerationImage(client, gen!, MEDIA_ROOT) : traiterJob(job!);
}

async function boucle() {
  console.log(`[worker] Cadence worker démarré (mode ComfyUI : ${process.env.COMFYUI_MODE ?? "stub"})`);
  // Une seule fois, avant la première prise : ce qui était « en cours » appartenait
  // à un worker mort (voir worker/reprise.ts).
  try {
    const { images, videos } = await reprendreOrphelines(MEDIA_ROOT);
    if (images || videos) {
      console.log(`[worker] Reprise : ${images} image(s) interrompue(s), ${videos} vidéo(s) remise(s) en file`);
    }
  } catch (err) {
    console.error("[worker] Reprise des tâches interrompues impossible :", err);
  }

  while (true) {
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
