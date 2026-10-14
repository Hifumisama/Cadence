import { and, desc, eq, isNotNull, lt } from "drizzle-orm";
import { db } from "../db";
import { jobs, plans } from "../db/schema";

/** Accès base du raccord (lib/plan-raccord.ts), partagé par le worker (qui extrait l'image) et la page du plan (qui dit si elle est périmée). */

export type PlanPrecedent = { id: number; titre: string; renduRetenuId: number | null };

/** Le plan qui précède celui-ci dans l'épisode (par `ordre`), ou null pour le premier. */
export async function planPrecedent(plan: { episodeId: number; ordre: number }): Promise<PlanPrecedent | null> {
  const [p] = await db
    .select({ id: plans.id, titre: plans.titre, renduRetenuId: plans.renduRetenuId })
    .from(plans)
    .where(and(eq(plans.episodeId, plan.episodeId), lt(plans.ordre, plan.ordre)))
    .orderBy(desc(plans.ordre))
    .limit(1);
  return p ?? null;
}

/** L'essai du plan précédent dont on prend la dernière image : son rendu retenu s'il en a un (terminé, avec un fichier), sinon son dernier essai
 * terminé qui a un fichier. Null s'il n'y en a pas. */
export async function essaiSourceDuRaccord(precedent: { id: number; renduRetenuId: number | null }): Promise<{ id: number; numeroRendu: number; cheminSortie: string } | null> {
  const lignes = await db
    .select({ id: jobs.id, numeroRendu: jobs.numeroRendu, cheminSortie: jobs.cheminSortie })
    .from(jobs)
    .where(and(eq(jobs.planId, precedent.id), eq(jobs.statut, "termine"), isNotNull(jobs.cheminSortie)))
    .orderBy(desc(jobs.id));
  const choisi = (precedent.renduRetenuId != null ? lignes.find((l) => l.id === precedent.renduRetenuId) : undefined) ?? lignes[0];
  return choisi?.cheminSortie ? { id: choisi.id, numeroRendu: choisi.numeroRendu, cheminSortie: choisi.cheminSortie } : null;
}

/** Ce que la page d'un plan dit de son raccord : le plan précédent et l'essai dont l'image serait prise MAINTENANT. */
export async function raccordActuel(plan: { episodeId: number; ordre: number; liaison: string }): Promise<{ precedent: PlanPrecedent; source: { id: number; numeroRendu: number } | null } | null> {
  if (plan.liaison !== "suite") return null;
  const precedent = await planPrecedent(plan);
  if (!precedent) return null;
  const source = await essaiSourceDuRaccord(precedent);
  return { precedent, source: source ? { id: source.id, numeroRendu: source.numeroRendu } : null };
}
