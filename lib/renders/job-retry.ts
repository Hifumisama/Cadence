import { and, desc, eq, isNotNull, max } from "drizzle-orm";
import { db } from "../../db";
import { jobs, plans } from "../../db/schema";
import { DUREE_GENERATION_MAX, DUREE_GENERATION_MIN } from "../clips/clip-checks";
import type { Tx } from "../clips/clip-order";
import { MEGAPIXELS_VIDEO } from "./video-steps";

/** The clip exceeds the duration a render accepts: no attempt is created. */
export class DureePlanInvalide extends Error {}

/** Core of the re-launch button (F03) and of the night pass (CDC page 4, "queue
 * batch"): creates a NEW job en_attente rather than rewriting the
 * previous one — the history of attempts is the memory of the iteration
 * loop. The worker then applies the healthcheck and the distinction
 * unavailable / real failure (F04). Does not revalidate the cache: the batch wants
 * a single revalidation after N clips, not one per clip. */
export async function creerJobRelance(
  planId: number,
  activerUpscale: boolean,
  nouvelleVariante = false,
  options: { consigne?: string | null; depuisNumero?: number | null; garderPret?: boolean; alertesIteration?: string[]; demandeId?: number; sourceJobId?: number } = {},
  /** An ongoing transaction (« Itérer »: application of the correction + creation of the attempt, all or nothing). */
  exec: typeof db | Tx = db,
) {
  const [plan] = await exec.select().from(plans).where(eq(plans.id, planId));
  if (!plan) throw new Error(`Plan ${planId} introuvable`);
  // The worker would refuse this render; better not to queue it (the console only checks the duration it sends, not the one already recorded).
  const duree = plan.dureeGenerationSecondes;
  if (duree != null && (!Number.isInteger(duree) || duree < DUREE_GENERATION_MIN || duree > DUREE_GENERATION_MAX)) {
    throw new DureePlanInvalide(`Durée de génération ${duree} s : un plan dure ${DUREE_GENERATION_MIN} à ${DUREE_GENERATION_MAX} s. Raccourcir le plan avant de relancer.`);
  }

  // « Relancer » keeps the clip's seed: same prompt + same refs + same duration = same render (F04). A
  // « nouvelle variante » draws another, which becomes the clip's seed.
  const seed = nouvelleVariante || !plan.seed ? tirerSeed() : plan.seed;
  const [rendus] = await exec.select({ dernier: max(jobs.numeroRendu) }).from(jobs).where(eq(jobs.planId, plan.id));

  // A final render restarts from the latent of a preview: the one explicitly chosen, otherwise the clip's KEPT preview, otherwise its
  // last finished preview that kept its latent. The worker checks at execution time that it is still valid (the sheet has not changed);
  // without a valid source, it regenerates the clip before the upscale.
  let sourceJobId = options.sourceJobId ?? null;
  if (activerUpscale && sourceJobId == null) {
    const preview = and(eq(jobs.planId, plan.id), eq(jobs.statut, "termine"), eq(jobs.activerUpscale, false), isNotNull(jobs.latentDossier));
    const [retenu] = plan.renduRetenuId != null ? await exec.select({ id: jobs.id }).from(jobs).where(and(preview, eq(jobs.id, plan.renduRetenuId))) : [];
    const [dernier] = retenu ? [] : await exec.select({ id: jobs.id }).from(jobs).where(preview).orderBy(desc(jobs.id)).limit(1);
    sourceJobId = (retenu ?? dernier)?.id ?? null;
  }

  await exec.insert(jobs).values({
    planId: plan.id,
    statut: "en_attente",
    tentative: 1,
    numeroRendu: (rendus?.dernier ?? 0) + 1,
    // Video in three steps (docs/PLAN_INTEGRATION_WORKER.md): a preview is the generation at 0.4 MP; a final render is the upscale then the
    // finishing, preceded by the generation if the kept preview (`jobSourceId`) is no longer valid (decided by the worker at execution time).
    workflowFichier: activerUpscale ? "video-generation/VID_UPSCALE.json + VID_Finition.json" : "video-generation/VID_Generation.json",
    seedUtilisee: seed,
    activerUpscale,
    megapixels: MEGAPIXELS_VIDEO,
    jobSourceId: activerUpscale ? sourceJobId : null,
    consigne: options.consigne?.trim() || null,
    depuisNumeroRendu: options.depuisNumero ?? null,
    alertesIteration: options.alertesIteration?.length ? options.alertesIteration : null,
    demandeId: options.demandeId ?? null,
  });

  // A new attempt puts a « ready to upscale » clip back into iteration (clip sheet 2026-10-12); only the upscale of the kept attempt
  // (`garderPret`) leaves the marker in place.
  await exec
    .update(plans)
    .set({
      statut: "en_attente",
      seed,
      ...(options.garderPret ? {} : { pretUpscaleAt: null, renduRetenuId: null }),
      updatedAt: new Date(),
    })
    .where(eq(plans.id, plan.id));
}

/** A clip seed: an integer of 15 digits at most (safe as a JavaScript number, accepted by the seed nodes). */
function tirerSeed(): string {
  return String(Math.floor(Math.random() * 1_000_000_000_000_000));
}

