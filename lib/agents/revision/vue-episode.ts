import { and, asc, eq, inArray } from "drizzle-orm";
import { assets, briefs, episodes, jobs, planDialogues, planPromptSections, plans, repliques, scenes, seasons } from "../../../db/schema";
import { extraireBalisesD } from "../../plan-checks";
import { getPlansPerimes } from "../../plans-perimes";
import type { Db } from "../applicateurs/commun";

/** La vue d'un épisode que lit le réalisateur : ses plans et ses répliques, chacun avec une POIGNÉE (« P07 », « R12 ») bâtie sur
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
  /** Les répliques du plan (uuid), dans l'ordre de leurs emplacements audio. */
  repliques: string[];
};

export type RepliqueVue = {
  uuid: string;
  handle: string;
  texte: string;
  locuteur: string;
  /** Les plans qui citent la réplique (uuid). */
  plans: string[];
  /** Parmi eux, ceux dont la fiche cite la réplique mot pour mot (la fiche peut alors être mise à jour sans modèle). */
  plansVerbatim: string[];
};

export type VueEpisode = {
  episodeId: number;
  numero: number;
  titre: string;
  /** La durée visée par le brief, en secondes ; null sans brief ni durée. */
  objectifSecondes: number | null;
  plans: PlanVue[];
  repliques: RepliqueVue[];
};

export const handle = (prefixe: "P" | "R", n: number): string => `${prefixe}${String(n).padStart(2, "0")}`;

/** « P7 », « p07 », « P 07 » → 7 ; null si ce n'est pas une poignée du préfixe demandé. */
export function numeroDePoignee(brut: string | null | undefined, prefixe: "P" | "R"): number | null {
  const m = new RegExp(`^\\s*${prefixe}\\s*0*(\\d+)\\s*$`, "i").exec(brut ?? "");
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
  repliques: { uuid: string; ordre: number; texte: string; locuteur: string; liaisons: { planUuid: string; slot: number }[]; verbatim?: string[] }[];
};

export function construireVue(l: LignesEpisode): VueEpisode {
  const titreScene = new Map(l.scenes.map((s) => [s.id, s.titre]));
  const liaisonsParPlan = new Map<string, { repliqueUuid: string; slot: number }[]>();
  for (const r of l.repliques) for (const li of r.liaisons) liaisonsParPlan.set(li.planUuid, [...(liaisonsParPlan.get(li.planUuid) ?? []), { repliqueUuid: r.uuid, slot: li.slot }]);

  const planVues: PlanVue[] = l.plans.map((p, i) => ({
    uuid: p.uuid,
    handle: handle("P", i + 1),
    position: i + 1,
    sceneId: p.sceneId,
    sceneTitre: p.sceneId != null ? (titreScene.get(p.sceneId) ?? null) : null,
    titre: p.titre,
    description: p.description,
    duree: p.duree,
    etat: etatDuPlan(p.statut, p.aFiche),
    perime: p.perime,
    repliques: (liaisonsParPlan.get(p.uuid) ?? []).sort((a, b) => a.slot - b.slot).map((x) => x.repliqueUuid),
  }));

  // Les répliques dans l'ordre de lecture : celles d'un plan suivent l'ordre des plans, les répliques sans plan viennent à la fin (`ordre`).
  const rangPlan = new Map(planVues.map((p) => [p.uuid, p.position]));
  const premierRang = (r: LignesEpisode["repliques"][number]): number => Math.min(...r.liaisons.map((li) => rangPlan.get(li.planUuid) ?? Infinity), Infinity);
  const triees = [...l.repliques].sort((a, b) => {
    const ra = premierRang(a);
    const rb = premierRang(b);
    if (ra !== rb) return ra - rb;
    return a.ordre - b.ordre;
  });
  const repliqueVues: RepliqueVue[] = triees.map((r, i) => ({
    uuid: r.uuid,
    handle: handle("R", i + 1),
    texte: r.texte,
    locuteur: r.locuteur,
    plans: r.liaisons.map((li) => li.planUuid),
    plansVerbatim: r.verbatim ?? [],
  }));

  return { episodeId: l.episode.id, numero: l.episode.numero, titre: l.episode.titre, objectifSecondes: l.objectifSecondes, plans: planVues, repliques: repliqueVues };
}

export const planParPoignee = (vue: VueEpisode, brut: string | null | undefined): PlanVue | null => {
  const n = numeroDePoignee(brut, "P");
  return n != null ? (vue.plans[n - 1] ?? null) : null;
};
export const repliqueParPoignee = (vue: VueEpisode, brut: string | null | undefined): RepliqueVue | null => {
  const n = numeroDePoignee(brut, "R");
  return n != null ? (vue.repliques[n - 1] ?? null) : null;
};
export const planParUuid = (vue: VueEpisode, uuid: string): PlanVue | undefined => vue.plans.find((p) => p.uuid === uuid);
export const repliqueParUuid = (vue: VueEpisode, uuid: string): RepliqueVue | undefined => vue.repliques.find((r) => r.uuid === uuid);

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

  const lesRepliques = await db
    .select({
      id: repliques.id,
      uuid: repliques.uuid,
      ordre: repliques.ordre,
      texte: repliques.texte,
      locuteurId: repliques.locuteurId,
      locuteurTexte: repliques.locuteurTexte,
    })
    .from(repliques)
    .where(eq(repliques.episodeId, episodeId))
    .orderBy(asc(repliques.ordre), asc(repliques.id));
  const idsRepliques = lesRepliques.map((r) => r.id);
  const liaisons = idsRepliques.length
    ? await db
        .select({ repliqueId: planDialogues.repliqueId, planId: planDialogues.planId, slot: planDialogues.slot })
        .from(planDialogues)
        .where(inArray(planDialogues.repliqueId, idsRepliques))
    : [];
  const idsAssets = [...new Set(lesRepliques.flatMap((r) => [r.locuteurId]).filter((x): x is number => x != null))];
  const codes = idsAssets.length ? await db.select({ id: assets.id, code: assets.code }).from(assets).where(inArray(assets.id, idsAssets)) : [];
  const codeDe = new Map(codes.map((a) => [a.id, a.code]));
  const uuidDePlan = new Map(lesPlans.map((p) => [p.id, p.uuid]));
  const citeMotPourMot = (planId: number, t: string) => sections.some((s) => s.planId === planId && extraireBalisesD([{ section: "", contenu: s.contenu }]).some((b) => b.texte === t.trim()));

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
    repliques: lesRepliques.map((r) => ({
      uuid: r.uuid,
      ordre: r.ordre,
      texte: r.texte,
      locuteur: (r.locuteurId != null ? codeDe.get(r.locuteurId) : undefined) ?? (r.locuteurTexte || "Inconnu"),
      liaisons: liaisons.filter((li) => li.repliqueId === r.id).flatMap((li) => (uuidDePlan.has(li.planId) ? [{ planUuid: uuidDePlan.get(li.planId)!, slot: li.slot }] : [])),
      verbatim: liaisons.filter((li) => li.repliqueId === r.id).flatMap((li) => (citeMotPourMot(li.planId, r.texte) ? [uuidDePlan.get(li.planId)!] : [])),
    })),
  });
}
