import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { jobs, plans, scenes } from "@/db/schema";
import { etatPlan, type EtatPlan } from "@/lib/clips/clip-sheet";

export type PlanPellicule = {
  uuid: string;
  /** Rank in the episode (« 04 »): what is displayed, NEVER an identifier (F03). */
  position: number;
  titre: string;
  sceneTitre: string | null;
  etat: EtatPlan;
  /** Video file from which the thumbnail is taken (the kept attempt if it is readable, otherwise the last finished attempt), path relative to storage. */
  vignette: string | null;
  /** `plans.statut`: « brouillon » = sheet not yet developed. */
  statutFiche: string;
  nbTermines: number;
  nbEnFile: number;
};

/** The clips of an episode for the film strip at the bottom of the sheet: in `plans.ordre` order (never another sort), with their derived state
 * (lib/clips/clip-sheet.ts) and the thumbnail of their kept attempt or, failing that, of the last finished attempt. Two queries for the whole episode. */
export async function getPelliculePlans(episodeId: number): Promise<PlanPellicule[]> {
  const lignes = await db
    .select({
      id: plans.id,
      uuid: plans.uuid,
      titre: plans.titre,
      statut: plans.statut,
      pretUpscaleAt: plans.pretUpscaleAt,
      renduRetenuId: plans.renduRetenuId,
      sceneTitre: scenes.titre,
    })
    .from(plans)
    .leftJoin(scenes, eq(scenes.id, plans.sceneId))
    .where(eq(plans.episodeId, episodeId))
    .orderBy(plans.ordre, plans.id);
  if (lignes.length === 0) return [];

  const essais = await db
    .select({ id: jobs.id, planId: jobs.planId, statut: jobs.statut, numeroRendu: jobs.numeroRendu, cheminSortie: jobs.cheminSortie })
    .from(jobs)
    .where(and(inArray(jobs.planId, lignes.map((l) => l.id))));

  return lignes.map((l, i) => {
    const siens = essais.filter((e) => e.planId === l.id);
    const lisibles = siens.filter((e) => e.statut === "termine" && !!e.cheminSortie).sort((a, b) => b.numeroRendu - a.numeroRendu);
    const retenu = lisibles.find((e) => e.id === l.renduRetenuId);
    return {
      uuid: l.uuid,
      position: i + 1,
      titre: l.titre,
      sceneTitre: l.sceneTitre ?? null,
      etat: etatPlan({ nbEssais: siens.length, pretUpscaleAt: l.pretUpscaleAt }),
      vignette: (retenu ?? lisibles[0])?.cheminSortie ?? null,
      statutFiche: l.statut,
      nbTermines: siens.filter((e) => e.statut === "termine").length,
      nbEnFile: siens.filter((e) => e.statut === "en_attente" || e.statut === "en_cours").length,
    };
  });
}
