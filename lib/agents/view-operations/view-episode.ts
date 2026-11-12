import { and, asc, eq, inArray } from "drizzle-orm";
import { briefs, episodes, jobs, planPromptSections, plans, scenes } from "../../../db/schema";
import { getPlansPerimes } from "../../clips/stale-clips";
import type { Db } from "../appliers/common";

/** The view of an episode that the review reads: its clips, each with a HANDLE (« P07 ») built on
 * the real order at this moment. The model cites the handles; the code translates them into uuids (a handle is a rank: it is never
 * stored, F03). `construireVue` is pure, `lireVueEpisode` reads the database. */

type EtatPlan = "brouillon" | "fiche" | "en_file" | "rendu";

export type PlanVue = {
  uuid: string;
  handle: string;
  /** Rank in the episode (base 1). */
  position: number;
  sceneId: number | null;
  sceneTitre: string | null;
  titre: string;
  description: string;
  /** Generation duration, in whole seconds. */
  duree: number;
  etat: EtatPlan;
  /** The render is outdated (reference changed, prompt or duration modified since). */
  perime: boolean;
};

export type VueEpisode = {
  episodeId: number;
  numero: number;
  titre: string;
  /** The target duration set by the brief, in seconds; null without brief nor duration. */
  objectifSecondes: number | null;
  plans: PlanVue[];
};

const handle = (n: number): string => `P${String(n).padStart(2, "0")}`;

/** « P7 », « p07 », « P 07 » → 7; null if it is not a clip handle. */
export function numeroDePoignee(brut: string | null | undefined): number | null {
  const m = /^\s*P\s*0*(\d+)\s*$/i.exec(brut ?? "");
  const n = m ? Number(m[1]) : NaN;
  return Number.isInteger(n) && n > 0 ? n : null;
}

function etatDuPlan(statut: string, aFiche: boolean): EtatPlan {
  if (statut === "en_attente" || statut === "en_cours") return "en_file";
  if (statut === "previsualise" || statut === "termine") return "rendu";
  return aFiche ? "fiche" : "brouillon";
}

export type LignesEpisode = {
  episode: { id: number; numero: number; titre: string };
  objectifSecondes: number | null;
  /** In reading order (`plans.ordre`). */
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

/** Reads the episode from the database. Null if the episode is not in the project. */
export async function lireVueEpisode(db: Db, projectId: number, episodeId: number): Promise<VueEpisode | null> {
  const [ep] = await db
    .select({ id: episodes.id, numero: episodes.numero, titre: episodes.titre })
    .from(episodes)
    .where(and(eq(episodes.id, episodeId), eq(episodes.projectId, projectId)));
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
  // `plans.statut` is « en_attente » for a clip simply ready to render: only an active job is a render queued or running.
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
