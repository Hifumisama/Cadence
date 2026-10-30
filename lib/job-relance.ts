import { and, desc, eq, isNotNull, max } from "drizzle-orm";
import { db } from "../db";
import { jobs, plans } from "../db/schema";
import { DUREE_GENERATION_MAX, DUREE_GENERATION_MIN } from "./plan-checks";
import type { Tx } from "./ordre-plans";
import { MEGAPIXELS_VIDEO } from "./etapes-video";

/** Le plan dépasse la durée qu'un rendu accepte : aucun essai n'est créé. */
export class DureePlanInvalide extends Error {}

/** Cœur du bouton relance (F03) et du passage nuit (CDC page 4, "queue
 * batch") : crée un NOUVEAU job en_attente plutôt que de réécrire le
 * précédent — l'historique des tentatives est la mémoire de la boucle
 * d'itération. Le worker applique ensuite le healthcheck et la distinction
 * indisponible/échec réel (F04). Ne revalide pas le cache : le batch veut
 * une seule revalidation après N plans, pas une par plan. */
export async function creerJobRelance(
  planId: number,
  activerUpscale: boolean,
  nouvelleVariante = false,
  options: { consigne?: string | null; depuisNumero?: number | null; garderPret?: boolean; alertesIteration?: string[]; demandeId?: number; sourceJobId?: number } = {},
  /** Une transaction en cours (« Itérer » : application de la correction + création de l'essai, tout ou rien). */
  exec: typeof db | Tx = db,
) {
  const [plan] = await exec.select().from(plans).where(eq(plans.id, planId));
  if (!plan) throw new Error(`Plan ${planId} introuvable`);
  // Le worker refuserait ce rendu ; autant ne pas le mettre en file (la console ne contrôle que la durée qu'elle envoie, pas celle déjà enregistrée).
  const duree = plan.dureeGenerationSecondes;
  if (duree != null && (!Number.isInteger(duree) || duree < DUREE_GENERATION_MIN || duree > DUREE_GENERATION_MAX)) {
    throw new DureePlanInvalide(`Durée de génération ${duree} s : un plan dure ${DUREE_GENERATION_MIN} à ${DUREE_GENERATION_MAX} s. Raccourcir le plan avant de relancer.`);
  }

  // « Relancer » garde la seed du plan : même prompt + mêmes refs + même durée = même rendu (F04). Une
  // « nouvelle variante » en tire une autre, qui devient la seed du plan.
  const seed = nouvelleVariante || !plan.seed ? tirerSeed() : plan.seed;
  const [rendus] = await exec.select({ dernier: max(jobs.numeroRendu) }).from(jobs).where(eq(jobs.planId, plan.id));

  // Un rendu final repart du latent d'une prévisualisation : celle qu'on a explicitement choisie, sinon la prévisualisation RETENUE du plan, sinon sa
  // dernière prévisualisation terminée qui a gardé son latent. Le worker vérifie à l'exécution qu'elle est encore valable (la fiche n'a pas changé) ;
  // sans source valable, il régénère le plan avant l'upscale.
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
    // Vidéo en trois étapes (docs/PLAN_INTEGRATION_WORKER.md) : une prévisualisation est la génération à 0,4 MP ; un rendu final est l'upscale puis la
    // finition, précédés de la génération si la prévisualisation retenue (`jobSourceId`) n'est plus valable (décidé par le worker à l'exécution).
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

  // Un nouvel essai remet un plan « prêt à upscaler » en itération (fiche de plan 2026-10-12) ; seul l'upscale de l'essai retenu
  // (`garderPret`) laisse le marqueur en place.
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

/** Une seed de plan : un entier de 15 chiffres au plus (sûr en nombre JavaScript, accepté par les nœuds de seed). */
export function tirerSeed(): string {
  return String(Math.floor(Math.random() * 1_000_000_000_000_000));
}

