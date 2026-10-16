import { and, eq, max } from "drizzle-orm";
import { db } from "../db";
import { jobs, plans } from "../db/schema";
import type { Tx } from "./ordre-plans";

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
  options: { consigne?: string | null; depuisNumero?: number | null; garderPret?: boolean; alertesIteration?: string[]; demandeId?: number } = {},
  /** Une transaction en cours (« Itérer » : application de la correction + création de l'essai, tout ou rien). */
  exec: typeof db | Tx = db,
) {
  const [plan] = await exec.select().from(plans).where(eq(plans.id, planId));
  if (!plan) throw new Error(`Plan ${planId} introuvable`);

  // « Relancer » garde la seed du plan : même prompt + mêmes refs + même durée = même rendu (F04). Une
  // « nouvelle variante » en tire une autre, qui devient la seed du plan.
  const seed = nouvelleVariante || !plan.seed ? tirerSeed() : plan.seed;
  const [rendus] = await exec.select({ dernier: max(jobs.numeroRendu) }).from(jobs).where(eq(jobs.planId, plan.id));

  await exec.insert(jobs).values({
    planId: plan.id,
    statut: "en_attente",
    tentative: 1,
    numeroRendu: (rendus?.dernier ?? 0) + 1,
    workflowFichier: "video-generation/VID_REF2VA.json",
    seedUtilisee: seed,
    activerUpscale,
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

