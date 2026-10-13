import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { jobs, plans, scenes } from "@/db/schema";
import { etatPlan, type EtatPlan } from "@/lib/fiche-plan";

export type PlanPellicule = {
  uuid: string;
  /** Rang dans l'épisode (« 04 ») : ce qu'on affiche, JAMAIS un identifiant (F03). */
  position: number;
  titre: string;
  sceneTitre: string | null;
  etat: EtatPlan;
  /** Fichier vidéo dont on tire la vignette (l'essai retenu s'il est lisible, sinon le dernier essai terminé), chemin relatif au stockage. */
  vignette: string | null;
  /** `plans.statut` : « brouillon » = fiche pas encore développée. */
  statutFiche: string;
  nbTermines: number;
  nbEnFile: number;
};

/** Les plans d'un épisode pour la pellicule du bas de la fiche : dans l'ordre `plans.ordre` (jamais un autre tri), avec leur état dérivé
 * (lib/fiche-plan.ts) et la vignette de leur essai retenu ou, à défaut, du dernier essai terminé. Deux requêtes pour tout l'épisode. */
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
