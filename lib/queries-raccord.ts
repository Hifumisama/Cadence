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

/** Le latent de première passe du plan précédent, de quoi alimenter Motion Context (2026-10-30, docs/PLAN_INTEGRATION_WORKER.md) : celui de son rendu retenu s'il
 * en a un, sinon de son dernier rendu terminé qui en a un. Un rendu final n'a pas de première passe à lui s'il est parti d'une prévisualisation : on prend celle de
 * cette prévisualisation. `id` est l'essai du plan précédent qui sert de référence (comme pour le raccord par image) ; null si aucun latent n'est disponible,
 * et le plan retombe alors sur l'image de raccord. */
export async function essaiSourceDuLatent(precedent: { id: number; renduRetenuId: number | null }): Promise<{ id: number; numeroRendu: number; latentDossier: string } | null> {
  const lignes = await db
    .select({ id: jobs.id, numeroRendu: jobs.numeroRendu, final: jobs.activerUpscale, latentDossier: jobs.latentDossier, jobSourceId: jobs.jobSourceId })
    .from(jobs)
    .where(and(eq(jobs.planId, precedent.id), eq(jobs.statut, "termine"), isNotNull(jobs.latentDossier)))
    .orderBy(desc(jobs.id));
  const retenu = precedent.renduRetenuId != null ? lignes.filter((l) => l.id === precedent.renduRetenuId) : [];
  for (const l of [...retenu, ...lignes.filter((l) => !retenu.includes(l))]) {
    if (!l.final || l.jobSourceId == null) return { id: l.id, numeroRendu: l.numeroRendu, latentDossier: l.latentDossier! };
    const [source] = await db.select({ latentDossier: jobs.latentDossier }).from(jobs).where(eq(jobs.id, l.jobSourceId));
    if (source?.latentDossier) return { id: l.id, numeroRendu: l.numeroRendu, latentDossier: source.latentDossier };
  }
  return null;
}
