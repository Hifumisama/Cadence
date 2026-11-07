import { desc, eq, inArray } from "drizzle-orm";
import { db } from "../db";
import { jobs, montageExports, plans, scenes } from "../db/schema";
import { WORKFLOW_IMPORT_MANUEL } from "./plan-checks";
import { getPlansPerimes } from "./plans-perimes";
import { estPerime, resumerPerime } from "./rendus";
import { assurerMontage, entreesEpisode } from "./montage-db";
import type { EntreeMontage, GenreRendu, PlanMontage, RenduMontage, SceneMontage } from "./montage";

export type ExportMontage = {
  id: number;
  statut: string;
  /** URL de lecture et de téléchargement du fichier produit (versionnée par la date de fin). */
  src: string | null;
  dureeSecondes: number | null;
  nbSegments: number;
  nbIgnores: number;
  erreur: string | null;
  creeLe: string;
  finiLe: string | null;
};

/** Tout ce que la page Montage affiche : les plans dans l'ordre du SCÉNARIO (`plans.ordre`), avec leurs rendus lisibles ; les scènes ;
 * les entrées du MONTAGE FINAL dans l'ordre de leur rang ; le dernier export. Un épisode sans montage reçoit le sien d'abord
 * (`assurerMontage`). Les brouillons sont des plans comme les autres : sans rendu, ils occupent leur durée prévue. */
export async function getMontage(episodeId: number): Promise<{ plans: PlanMontage[]; scenes: SceneMontage[]; entrees: EntreeMontage[]; dernierExport: ExportMontage | null }> {
  await assurerMontage(episodeId);
  const [lesPlans, lesScenes, lesEntrees, [exp]] = await Promise.all([
    db.select().from(plans).where(eq(plans.episodeId, episodeId)).orderBy(plans.ordre, plans.id),
    db.select({ id: scenes.id, titre: scenes.titre }).from(scenes).where(eq(scenes.episodeId, episodeId)).orderBy(scenes.ordre, scenes.id),
    entreesEpisode(db, episodeId),
    db.select().from(montageExports).where(eq(montageExports.episodeId, episodeId)).orderBy(desc(montageExports.id)).limit(1),
  ]);
  const ids = lesPlans.map((p) => p.id);
  const [lesJobs, perimes] = await Promise.all([
    ids.length ? db.select().from(jobs).where(inArray(jobs.planId, ids)).orderBy(desc(jobs.createdAt), desc(jobs.id)) : Promise.resolve([]),
    getPlansPerimes({ planIds: ids }),
  ]);
  const jobsParPlan = new Map<number, (typeof lesJobs)[number][]>();
  for (const j of lesJobs) jobsParPlan.set(j.planId, [...(jobsParPlan.get(j.planId) ?? []), j]);

  const plansMontage: PlanMontage[] = lesPlans.map((p, i) => {
    const sesJobs = jobsParPlan.get(p.id) ?? [];
    const dureePrevue = p.dureeGenerationSecondes > 0 ? p.dureeGenerationSecondes : p.dureeMontageSecondes;
    const rendus: RenduMontage[] = sesJobs
      .filter((j) => j.statut === "termine" && !!j.cheminSortie)
      .map((j) => ({
        id: j.id,
        numeroRendu: j.numeroRendu,
        genre: (j.workflowFichier === WORKFLOW_IMPORT_MANUEL ? "import" : j.activerUpscale ? "final" : "aperçu") satisfies GenreRendu,
        chemin: j.cheminSortie!,
        src: `/api/media/${j.cheminSortie}`,
        dureeSecondes: j.dureeUtilisee && j.dureeUtilisee > 0 ? j.dureeUtilisee : dureePrevue,
        creeLe: (j.finishedAt ?? j.createdAt).toISOString(),
      }));
    const dernier = sesJobs[0];
    const perime = perimes.get(p.id);
    const p2 = perime ? { codes: perime.codes, raisons: perime.raisons } : null;
    return {
      id: p.id,
      uuid: p.uuid,
      titre: p.titre,
      statut: p.statut,
      sceneId: p.sceneId,
      position: i + 1,
      dureePrevue,
      perime: p2 && estPerime(p2) ? resumerPerime(p2) : null,
      erreur: dernier?.statut === "echoue" && dernier.erreur ? `Rendu n°${dernier.numeroRendu} : ${dernier.erreur}` : null,
      rendus,
      renduParDefautId: rendus.find((r) => r.id === p.renduRetenuId)?.id ?? rendus[0]?.id ?? null,
    };
  });

  return {
    plans: plansMontage,
    scenes: lesScenes,
    entrees: lesEntrees.map((e) => ({ id: e.id, planId: e.planId, renduRetenuId: e.renduRetenuId, debut: e.debutSecondes, fin: e.finSecondes })),
    dernierExport: exp
      ? {
          id: exp.id,
          statut: exp.statut,
          src: exp.statut === "termine" && exp.fichier ? `/api/media/${exp.fichier}?v=${(exp.finishedAt ?? exp.createdAt).getTime()}` : null,
          dureeSecondes: exp.dureeSecondes,
          nbSegments: Array.isArray(exp.segments) ? exp.segments.length : 0,
          nbIgnores: exp.nbIgnores,
          erreur: exp.erreur,
          creeLe: exp.createdAt.toISOString(),
          finiLe: exp.finishedAt?.toISOString() ?? null,
        }
      : null,
  };
}
