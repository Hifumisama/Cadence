import { and, asc, eq, inArray } from "drizzle-orm";
import { briefs, episodes, jobs, planPromptSections, plans, scenes, seasons } from "../../../db/schema";
import { getPlansPerimes } from "../../plans-perimes";
import type { Db } from "../applicateurs/commun";

/** La vue d'un épisode que lit le réalisateur : ses plans, chacun avec une POIGNÉE (« P07 ») bâtie sur
 * l'ordre réel à cet instant. Le modèle cite les poignées ; le code les traduit en uuid (une poignée est un rang : elle n'est jamais
 * stockée, F03). `construireVue` est pur, `lireVueEpisode` lit la base. */

export type EtatPlan = "brouillon" | "fiche" | "en_file" | "rendu";

export type PlanVue = {
  uuid: string;
  handle: string;
  /** Rang dans l'épisode (base 1). */
  position: number;
  sceneId: number | null;
  sceneTitre: string | null;
  titre: string;
  description: string;
  /** Durée de génération, en secondes entières. */
  duree: number;
  etat: EtatPlan;
  /** Le rendu est dépassé (référence changée, prompt ou durée modifiés depuis). */
  perime: boolean;
};

export type VueEpisode = {
  episodeId: number;
  numero: number;
  titre: string;
  /** La durée visée par le brief, en secondes ; null sans brief ni durée. */
  objectifSecondes: number | null;
  plans: PlanVue[];
};

export const handle = (n: number): string => `P${String(n).padStart(2, "0")}`;

/** « P7 », « p07 », « P 07 » → 7 ; null si ce n'est pas une poignée de plan. */
export function numeroDePoignee(brut: string | null | undefined): number | null {
  const m = /^\s*P\s*0*(\d+)\s*$/i.exec(brut ?? "");
  const n = m ? Number(m[1]) : NaN;
  return Number.isInteger(n) && n > 0 ? n : null;
}

export function etatDuPlan(statut: string, aFiche: boolean): EtatPlan {
  if (statut === "en_attente" || statut === "en_cours") return "en_file";
  if (statut === "previsualise" || statut === "termine") return "rendu";
  return aFiche ? "fiche" : "brouillon";
}

export type LignesEpisode = {
  episode: { id: number; numero: number; titre: string };
  objectifSecondes: number | null;
  /** Dans l'ordre de lecture (`plans.ordre`). */
  plans: { uuid: string; titre: string; description: string; duree: number; sceneId: number | null; statut: string; aFiche: boolean; perime: boolean }[];
  scenes: { id: number; titre: string }[];
};

export function construireVue(l: LignesEpisode): VueEpisode {
  const titreScene = new Map(l.scenes.map((s) => [s.id, s.titre]));

  const planVues: PlanVue[] = l.plans.map((p, i) => ({
    uuid: p.uuid,
    handle: handle(i + 1),
    position: i + 1,
    sceneId: p.sceneId,
    sceneTitre: p.sceneId != null ? (titreScene.get(p.sceneId) ?? null) : null,
    titre: p.titre,
    description: p.description,
    duree: p.duree,
    etat: etatDuPlan(p.statut, p.aFiche),
    perime: p.perime,
  }));

  return { episodeId: l.episode.id, numero: l.episode.numero, titre: l.episode.titre, objectifSecondes: l.objectifSecondes, plans: planVues };
}

export const planParPoignee = (vue: VueEpisode, brut: string | null | undefined): PlanVue | null => {
  const n = numeroDePoignee(brut);
  return n != null ? (vue.plans[n - 1] ?? null) : null;
};
export const planParUuid = (vue: VueEpisode, uuid: string): PlanVue | undefined => vue.plans.find((p) => p.uuid === uuid);

export function dureeTotale(vue: VueEpisode): number {
  return vue.plans.reduce((a, p) => a + p.duree, 0);
}

/** Lit l'épisode en base. Null si l'épisode n'est pas du projet. */
export async function lireVueEpisode(db: Db, projectId: number, episodeId: number): Promise<VueEpisode | null> {
  const [ep] = await db
    .select({ id: episodes.id, numero: episodes.numero, titre: episodes.titre })
    .from(episodes)
    .innerJoin(seasons, eq(seasons.id, episodes.seasonId))
    .where(and(eq(episodes.id, episodeId), eq(seasons.projectId, projectId)));
  if (!ep) return null;

  const lesPlans = await db
    .select({ id: plans.id, uuid: plans.uuid, titre: plans.titre, description: plans.description, duree: plans.dureeGenerationSecondes, sceneId: plans.sceneId, statut: plans.statut })
    .from(plans)
    .where(eq(plans.episodeId, episodeId))
    .orderBy(asc(plans.ordre), asc(plans.id));
  const lesScenes = await db.select({ id: scenes.id, titre: scenes.titre }).from(scenes).where(eq(scenes.episodeId, episodeId)).orderBy(asc(scenes.ordre));
  const idsPlans = lesPlans.map((p) => p.id);

  const sections = idsPlans.length
    ? await db.select({ planId: planPromptSections.planId, contenu: planPromptSections.contenu }).from(planPromptSections).where(inArray(planPromptSections.planId, idsPlans))
    : [];
  // `plans.statut` vaut « en_attente » pour un plan simplement prêt à rendre : seul un job actif est un rendu en file ou en cours.
  const rendusActifs = new Set(
    idsPlans.length ? (await db.select({ planId: jobs.planId }).from(jobs).where(and(inArray(jobs.planId, idsPlans), inArray(jobs.statut, ["en_attente", "en_cours"])))).map((j) => j.planId) : [],
  );
  const avecFiche = new Set(sections.filter((s) => s.contenu.trim() !== "").map((s) => s.planId));
  const perimes = idsPlans.length ? await getPlansPerimes({ planIds: idsPlans }) : new Map();

  const [brief] = await db.select({ contenu: briefs.contenu }).from(briefs).where(eq(briefs.projectId, projectId));
  const d = (brief?.contenu as { dureeEpisodeSecondes?: unknown } | undefined)?.dureeEpisodeSecondes;

  return construireVue({
    episode: ep,
    objectifSecondes: typeof d === "number" && d > 0 ? d : null,
    scenes: lesScenes,
    plans: lesPlans.map((p) => ({
      uuid: p.uuid,
      titre: p.titre,
      description: p.description ?? "",
      duree: p.duree,
      sceneId: p.sceneId,
      statut: (p.statut === "en_attente" || p.statut === "en_cours") && !rendusActifs.has(p.id) ? "brouillon" : p.statut,
      aFiche: avecFiche.has(p.id),
      perime: perimes.has(p.id),
    })),
  });
}
