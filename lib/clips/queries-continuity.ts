import { and, desc, eq, inArray, isNotNull, lt } from "drizzle-orm";
import { db } from "../../db";
import { jobs, plans } from "../../db/schema";

/** Database access for the continuity (lib/clips/clip-continuity.ts), shared by the worker (which extracts the image) and the clip page (which says whether it is stale). */

export type PlanPrecedent = { id: number; titre: string; renduRetenuId: number | null };

/** The clip that precedes this one in the episode (by `ordre`), or null for the first. */
export async function planPrecedent(plan: { episodeId: number; ordre: number }): Promise<PlanPrecedent | null> {
  const [p] = await db
    .select({ id: plans.id, titre: plans.titre, renduRetenuId: plans.renduRetenuId })
    .from(plans)
    .where(and(eq(plans.episodeId, plan.episodeId), lt(plans.ordre, plan.ordre)))
    .orderBy(desc(plans.ordre))
    .limit(1);
  return p ?? null;
}

/** The attempt of the previous clip whose last image we take: its kept render if it has one (finished, with a file), otherwise its last
 * finished attempt that has a file. Null if there is none. */
export async function essaiSourceDuRaccord(precedent: { id: number; renduRetenuId: number | null }): Promise<{ id: number; numeroRendu: number; cheminSortie: string } | null> {
  const lignes = await db
    .select({ id: jobs.id, numeroRendu: jobs.numeroRendu, cheminSortie: jobs.cheminSortie })
    .from(jobs)
    .where(and(eq(jobs.planId, precedent.id), eq(jobs.statut, "termine"), isNotNull(jobs.cheminSortie)))
    .orderBy(desc(jobs.id));
  const choisi = (precedent.renduRetenuId != null ? lignes.find((l) => l.id === precedent.renduRetenuId) : undefined) ?? lignes[0];
  return choisi?.cheminSortie ? { id: choisi.id, numeroRendu: choisi.numeroRendu, cheminSortie: choisi.cheminSortie } : null;
}

/** What a clip's page says of its continuity: the previous clip and the attempt whose image would be taken NOW. */
export async function raccordActuel(plan: { episodeId: number; ordre: number; liaison: string }): Promise<{ precedent: PlanPrecedent; source: { id: number; numeroRendu: number } | null } | null> {
  if (plan.liaison !== "suite") return null;
  const precedent = await planPrecedent(plan);
  if (!precedent) return null;
  const source = await essaiSourceDuRaccord(precedent);
  return { precedent, source: source ? { id: source.id, numeroRendu: source.numeroRendu } : null };
}

/** The first-pass latent of the previous clip, to feed Motion Context (2026-10-30, docs/PLAN_INTEGRATION_WORKER.md): that of its kept render if it
 * has one, otherwise of its last finished render that has one. A final render has no first pass of its own if it left from a preview: we take that of
 * this preview. `id` is the attempt of the previous clip that serves as reference (as for the image continuity); null if no latent is available,
 * and the clip then falls back to the continuity image. */
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

/** Does the previous clip (by `ordre`, same episode) have a render queued or running? Used by the worker: a clip in « suite » is not taken as long as it is the case
 * (see `doitAttendreLePrecedent`, lib/clips/chains.ts). */
export async function precedentEnRendu(plan: { episodeId: number; ordre: number }): Promise<boolean> {
  const precedent = await planPrecedent(plan);
  if (!precedent) return false;
  const [actif] = await db.select({ id: jobs.id }).from(jobs).where(and(eq(jobs.planId, precedent.id), inArray(jobs.statut, ["en_attente", "en_cours"]))).limit(1);
  return actif != null;
}
