import { and, asc, count, desc, eq, gt, inArray, isNotNull, lt } from "drizzle-orm";
import { agentConversations, agentRuns, assets, briefs, episodes, jobs, planPromptSections, planRefs, plans, projects, propositionChangements, propositions, scenes } from "../../db/schema";
import { horsAffiches } from "../assets/assets-visible";
import { variantePromptAsset } from "../llm/variants";
import { WORKFLOW_IMPORT_MANUEL } from "../clips/clip-checks";
import { ORDRE_SECTIONS } from "../clips/prompt";
import type { Db } from "./appliers/common";
import { sansClesAbandonnees } from "./brief";
import { MAX_VIGNETTES_ITERATION, historiqueIteration } from "./iteration-clip";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { cheminAssetMedia, MEDIA_ROOT } from "../media";
import { AIDE_CREATIVITE, CREATIVITES, DETAIL_STYLE_CAMERA, LIBELLE_CREATIVITE, LIBELLE_NIVEAU, MISES_EN_SCENE, RESUME_STYLE_CAMERA, STYLE_AUCUN, resoudreReglages } from "../h3ir/settings";
import { SKILL_H3IR } from "../h3ir/result";
import { detailsDuBrief, libelleDetailsDuBrief } from "./registry";
import { poigneePlan, type EntreeInventaire } from "./inventory";
import { liaisonOuDefaut, type Liaison } from "../clips/clip-link";
import { sansEtatDeFin } from "../clips/intent";
import { nombreDeScenesVise, traitementDeScene } from "./treatment";
import { choisirReferencesPlan, type ChoixReferencesPlan } from "../h3ir/references-clip-db";
import { construireEntreeReferencesPlan, SKILL_REFERENCES_PLAN } from "./references-clip";
import type { BriefContenu, ContexteUtilise, PlaceScene, Position } from "./types";

/** What the agent reads AUTOMATICALLY for a short scope: extracts of the brief and of
 * the current state, never the whole brief by default. Each function returns the skill input
 * AND the "contexte utilisé" list the interface displays (expandable). Server side. */

export type EntreeSkill = {
  skill: string;
  entree: object;
  contexte: ContexteUtilise[];
  /** Skill variant (guides loaded), see lib/llm/skills.ts. */
  variante?: string;
};

export async function lireBriefDuProjet(db: Db, projectId: number): Promise<{ contenu: BriefContenu; statut: string } | null> {
  const [b] = await db.select().from(briefs).where(eq(briefs.projectId, projectId));
  return b ? { contenu: sansClesAbandonnees(b.contenu as BriefContenu), statut: b.statut } : null;
}

/** The brief extracts useful for a short generation, and what was read. */
export function extraitsBrief(brief: BriefContenu | null): { extrait: object | null; contexte: ContexteUtilise[] } {
  if (!brief) return { extrait: null, contexte: [] };
  const extrait = {
    arc: brief.arc,
    genreTon: brief.genreTon,
    style: brief.style,
    langueDialogues: brief.langueDialogues,
    dureeEpisodeSecondes: brief.dureeEpisodeSecondes,
    ...(brief.rythme ? { rythme: brief.rythme } : {}),
    ...(brief.univers?.trim() ? { univers: brief.univers.trim() } : {}),
    // Characters and places with their details (costume, look of the place: optional, with their `statut`; "incertain" = still vague).
    personnages: brief.personnages,
    lieux: brief.lieux,
    // Visual effects and props that matter (colour, scale, behaviour), when the interview noted some.
    ...(brief.elements?.length ? { elements: brief.elements } : {}),
    // The project's free notes (formerly "scenario globals"): what the user wants kept in mind.
    ...(brief.notes?.trim() ? { notes: brief.notes.trim() } : {}),
  };
  const contexte: ContexteUtilise[] = [
    { type: "brief", libelle: "Brief · style et clause de style", ref: "style" },
    { type: "brief", libelle: "Brief · arc et ton", ref: "arc" },
    { type: "brief", libelle: `Brief · ${brief.personnages.length} personnage${brief.personnages.length > 1 ? "s" : ""}, ${brief.lieux.length} lieu${brief.lieux.length > 1 ? "x" : ""}`, ref: "personnages" },
    ...(brief.elements?.length ? [{ type: "brief" as const, libelle: `Brief · ${brief.elements.length} effet${brief.elements.length > 1 ? "s" : ""} ou objet${brief.elements.length > 1 ? "s" : ""}`, ref: "elements" }] : []),
    ...(brief.notes?.trim() ? [{ type: "brief" as const, libelle: "Brief · notes du projet", ref: "notes" }] : []),
  ];
  return { extrait, contexte };
}

async function registreResume(db: Db, projectId: number) {
  const lignes = await db
    .select({ code: assets.code, type: assets.type, description: assets.description })
    .from(assets)
    .where(and(eq(assets.projectId, projectId), horsAffiches))
    .orderBy(asc(assets.code));
  return lignes.map((a) => ({ code: a.code, type: a.type, description: a.description ?? "" }));
}

// --- asset ------------------------------------------------------------------

export async function entreePromptAsset(db: Db, projectId: number, assetId: number, consigne: string, retour?: string): Promise<EntreeSkill | null> {
  const [asset] = await db.select().from(assets).where(and(eq(assets.id, assetId), eq(assets.projectId, projectId)));
  if (!asset) return null;
  const [projet] = await db.select({ clauseStyle: projects.clauseStyle }).from(projects).where(eq(projects.id, projectId));
  const brief = await lireBriefDuProjet(db, projectId);
  const { extrait, contexte } = extraitsBrief(brief?.contenu ?? null);

  const parent = asset.deriveDeId
    ? (await db.select().from(assets).where(eq(assets.id, asset.deriveDeId)))[0] ?? null
    : null;
  const famille = await db
    .select({ code: assets.code, description: assets.description })
    .from(assets)
    .where(and(eq(assets.projectId, projectId), asset.deriveDeId ? eq(assets.deriveDeId, asset.deriveDeId) : eq(assets.deriveDeId, asset.id)));
  const citations = await db
    .select({ role: planRefs.role, titre: plans.titre, description: plans.description })
    .from(planRefs)
    .innerJoin(plans, eq(plans.id, planRefs.planId))
    .where(eq(planRefs.assetId, asset.id))
    .limit(8);
  // The brief entry the asset is derived from (costume, look, element, with their status: "incertain" and "déduit" are not certainties).
  const details = detailsDuBrief(brief?.contenu ?? null, asset);

  const ctx: ContexteUtilise[] = [
    { type: "asset", libelle: `${asset.code} · description canonique`, ref: asset.code },
    ...(details ? [{ type: "brief" as const, libelle: libelleDetailsDuBrief(details), ref: details.section }] : []),
    ...(parent ? [{ type: "asset" as const, libelle: `Parent ${parent.code} · description et prompt`, ref: parent.code }] : []),
    ...(famille.length ? [{ type: "registre" as const, libelle: `${famille.length} asset${famille.length > 1 ? "s" : ""} de la même famille` }] : []),
    ...(citations.length ? [{ type: "plan" as const, libelle: `${citations.length} plan${citations.length > 1 ? "s" : ""} qui le citent` }] : []),
    ...(projet?.clauseStyle ? [{ type: "projet" as const, libelle: "Clause de style du projet (information)" }] : []),
    ...contexte,
  ];
  return {
    skill: "prompt-asset",
    variante: variantePromptAsset({ methodeGeneration: asset.methodeGeneration }),
    contexte: ctx,
    entree: {
      asset: { code: asset.code, type: asset.type, descriptionCanonique: asset.description ?? "", methodeGeneration: asset.methodeGeneration, promptActuel: asset.promptGeneration ?? "" },
      parent: parent ? { code: parent.code, description: parent.description ?? "", promptGeneration: parent.promptGeneration ?? "" } : null,
      plansQuiLeCitent: citations.map((c) => ({ titre: c.titre, role: c.role ?? "", description: c.description ?? "" })),
      clauseStyleDuProjet: projet?.clauseStyle ?? "",
      memeFamille: famille.map((f) => ({ code: f.code, description: f.description ?? "" })),
      ...(details ? { detailsDuBrief: details } : {}),
      briefExtrait: extrait,
      consigne,
      ...(retour ? { retourUtilisateur: retour } : {}),
    },
  };
}

/** The `prompt-asset` input for a REGISTRY asset (step 2): an existing asset goes through
 * `entreePromptAsset` (its description, its parent, its clips); an asset to create gets the same shape,
 * built from the brief's description. A master is always a generation (Krea 2): we only
 * load its guide. */
export async function entreePromptAssetCandidat(
  db: Db,
  projectId: number,
  cand: { code: string; type: string; description: string; existantId: number | null },
  consigne: string,
  retour?: string,
): Promise<EntreeSkill | null> {
  if (cand.existantId != null) {
    const base = await entreePromptAsset(db, projectId, cand.existantId, consigne, retour);
    if (!base) return null;
    const e = base.entree as { asset: { descriptionCanonique: string }; parent: unknown };
    if (!e.asset.descriptionCanonique.trim()) e.asset.descriptionCanonique = cand.description;
    return { ...base, variante: e.parent ? base.variante : "generation" };
  }
  const [projet] = await db.select({ clauseStyle: projects.clauseStyle }).from(projects).where(eq(projects.id, projectId));
  const brief = await lireBriefDuProjet(db, projectId);
  const { extrait, contexte } = extraitsBrief(brief?.contenu ?? null);
  const details = detailsDuBrief(brief?.contenu ?? null, cand);
  return {
    skill: "prompt-asset",
    variante: "generation",
    contexte: [
      { type: "asset", libelle: `${cand.code} · description issue du brief`, ref: cand.code },
      ...(details ? [{ type: "brief" as const, libelle: libelleDetailsDuBrief(details), ref: details.section }] : []),
      ...(projet?.clauseStyle ? [{ type: "projet" as const, libelle: "Clause de style du projet (information)" }] : []),
      ...contexte,
    ],
    entree: {
      asset: { code: cand.code, type: cand.type, descriptionCanonique: cand.description, methodeGeneration: "generation", promptActuel: "" },
      parent: null,
      plansQuiLeCitent: [],
      clauseStyleDuProjet: projet?.clauseStyle ?? "",
      memeFamille: [],
      ...(details ? { detailsDuBrief: details } : {}),
      briefExtrait: extrait,
      consigne,
      ...(retour ? { retourUtilisateur: retour } : {}),
    },
  };
}

// --- episode, clip ---------------------------------------------------------

/** `description`: the clip's intent WITHOUT the old "État en fin de plan" (clips written before 2026-11-08, lib/clips/intent.ts): the skills no longer
 * see it, and so do not copy it back. */
type PlanLu = { uuid: string; titre: string; description: string; dureeGenerationSecondes: number; sceneId: number | null; liaison: Liaison };

async function plansDe(db: Db, episodeId: number): Promise<PlanLu[]> {
  const l = await db
    .select({ uuid: plans.uuid, titre: plans.titre, description: plans.description, duree: plans.dureeGenerationSecondes, sceneId: plans.sceneId, liaison: plans.liaison })
    .from(plans)
    .where(eq(plans.episodeId, episodeId))
    .orderBy(asc(plans.ordre), asc(plans.id));
  return l.map((p) => ({ uuid: p.uuid, titre: p.titre, description: sansEtatDeFin(p.description), dureeGenerationSecondes: p.duree, sceneId: p.sceneId, liaison: liaisonOuDefaut(p.liaison) }));
}

async function contexteEpisode(db: Db, projectId: number, episodeId: number) {
  const [ep] = await db
    .select({ id: episodes.id, titre: episodes.titre, resume: episodes.resume, numero: episodes.numero })
    .from(episodes)
    .where(and(eq(episodes.id, episodeId), eq(episodes.projectId, projectId)));
  if (!ep) return null;
  const precedents = await db
    .select({ titre: episodes.titre, resume: episodes.resume })
    .from(episodes)
    .where(and(eq(episodes.projectId, projectId), lt(episodes.numero, ep.numero)))
    .orderBy(asc(episodes.numero));
  const suivants = await db
    .select({ titre: episodes.titre, resume: episodes.resume })
    .from(episodes)
    .where(and(eq(episodes.projectId, projectId), gt(episodes.numero, ep.numero)))
    .orderBy(asc(episodes.numero));
  const lesScenes = await db.select({ id: scenes.id, titre: scenes.titre, fonction: scenes.fonction, ambiance: scenes.ambiance }).from(scenes).where(eq(scenes.episodeId, ep.id)).orderBy(asc(scenes.ordre));
  const lesPlans = await plansDe(db, ep.id);
  const brief = await lireBriefDuProjet(db, projectId);
  const { extrait, contexte } = extraitsBrief(brief?.contenu ?? null);
  const registre = await registreResume(db, projectId);
  return { ep, precedents, suivants, brief: brief?.contenu ?? null, lesScenes, lesPlans, extrait, contexteBrief: contexte, registre };
}

/** What the AUTHOR wrote themselves during the project design (their messages, in order), so that the screenplay starts from their words and
 * not from the brief's summarized arc alone: a precise pitch (wide opening shot, gesture, line of dialogue, voice-over) was lost in the summary.
 * Capped (light context): the latest messages win; each is cut off sharply beyond `MAX_MESSAGE`. */
export const MAX_PAROLES_AUTEUR = 6000;
const MAX_MESSAGE = 3000;

export function parolesDeLAuteur(messages: unknown): string[] {
  const dits = (Array.isArray(messages) ? messages : [])
    .filter((m): m is { role: string; content: string } => !!m && typeof m === "object" && (m as { role?: unknown }).role === "user" && typeof (m as { content?: unknown }).content === "string")
    .map((m) => m.content.trim().slice(0, MAX_MESSAGE))
    .filter(Boolean);
  const gardes: string[] = [];
  let total = 0;
  for (const t of dits.reverse()) {
    if (total + t.length > MAX_PAROLES_AUTEUR && gardes.length > 0) break;
    gardes.unshift(t);
    total += t.length;
  }
  return gardes;
}

async function parolesDuProjet(db: Db, projectId: number): Promise<string[]> {
  const l = await db.select({ messages: agentConversations.messages }).from(agentConversations).where(and(eq(agentConversations.projectId, projectId), eq(agentConversations.portee, "projet"))).orderBy(asc(agentConversations.id));
  return parolesDeLAuteur(l.flatMap((c) => (Array.isArray(c.messages) ? c.messages : [])));
}

/** The LAST shot of an assembled video prompt (`detailed_description`), readable outside its clip: the timecode and the cut are removed, and
 * the `<Subject N>` labels (specific to THIS clip) are replaced by the asset's code (`codes[N]`). Used for the next clip: its first shot
 * picks up where this one ends (who is where, facing what, state of the fire). Capped: light context. Pure, tested. */
export const MAX_DERNIER_SHOT = 450;

export function dernierShotLisible(detailed: string, codes: Record<number, string>): string | null {
  const reperes = [...(detailed ?? "").matchAll(/\[Shot\s+\d+\]/g)];
  if (reperes.length === 0) return null;
  const dernier = reperes[reperes.length - 1]!;
  const corps = detailed
    .slice((dernier.index ?? 0) + dernier[0].length)
    // The shot's opening cut: "Hard cut to" or "the shot cuts to", "the camera transitions to"… (Open H3 IR, h3ir/prompts/base-en.txt §4.2).
    .replace(/^\s*At\s+\d{1,2}:\d{2}(?:\.\d{1,3})?\s*,?\s*(?:Hard cut to\s*|the\s+(?:shot|camera)\s+(?:cuts|transitions|changes|switches)\s+to\s*)?/i, "")
    .replace(/<\s*(?:Subject|Picture)\s*(\d+)\s*>/g, (_m, n: string) => codes[Number(n)] ?? "the subject")
    .replace(/\s+/g, " ")
    .trim();
  if (!corps) return null;
  return corps.length > MAX_DERNIER_SHOT ? `…${corps.slice(corps.length - MAX_DERNIER_SHOT + 1)}` : corps;
}

/** The FIRST shot of an assembled prompt, readable outside its clip (same treatment as `dernierShotLisible`): the previous clip must
 * end where this one begins (iteration: continuity match cut downstream). The opening preamble (style, light) is discarded. */
export function premierShotLisible(detailed: string, codes: Record<number, string>): string | null {
  const reperes = [...(detailed ?? "").matchAll(/\[Shot\s+\d+\]/g)];
  if (reperes.length === 0) return null;
  const fin = reperes[1]?.index ?? detailed.length;
  const corps = detailed
    .slice((reperes[0]!.index ?? 0) + reperes[0]![0].length, fin)
    .replace(/<\s*(?:Subject|Picture)\s*(\d+)\s*>/g, (_m, n: string) => codes[Number(n)] ?? "the subject")
    .replace(/\s+/g, " ")
    .trim();
  if (!corps) return null;
  return corps.length > MAX_DERNIER_SHOT ? `${corps.slice(0, MAX_DERNIER_SHOT - 1)}…` : corps;
}

/** The extreme shots (first, last) of a clip that has a sheet in the database, readable outside it. */
async function shotsExtremesDuPlan(db: Db, planUuid: string): Promise<{ premier: string | null; dernier: string | null }> {
  const [pl] = await db.select({ id: plans.id }).from(plans).where(eq(plans.uuid, planUuid));
  if (!pl) return { premier: null, dernier: null };
  const [[sec], refs] = await Promise.all([
    db.select({ contenu: planPromptSections.contenu }).from(planPromptSections).where(and(eq(planPromptSections.planId, pl.id), eq(planPromptSections.section, "detailed_description"))),
    db.select({ slot: planRefs.slot, code: assets.code }).from(planRefs).innerJoin(assets, eq(assets.id, planRefs.assetId)).where(and(eq(planRefs.planId, pl.id), eq(planRefs.type, "picture"))),
  ]);
  if (!sec?.contenu) return { premier: null, dernier: null };
  const codes = Object.fromEntries(refs.map((r) => [r.slot, r.code]));
  return { premier: premierShotLisible(sec.contenu, codes), dernier: dernierShotLisible(sec.contenu, codes) };
}

/** The brief entry matching this episode: same title (case-insensitive), otherwise same rank. */
function briefDeEpisode(brief: BriefContenu | null, titre: string, numero: number): { titre: string; resume: string; portee?: string } | null {
  if (!brief?.episodes?.length) return null;
  const n = (s: string) => s.trim().toLowerCase();
  return brief.episodes.find((e) => n(e.titre) === n(titre)) ?? brief.episodes[numero - 1] ?? null;
}

export async function entreeScenarioEpisode(
  db: Db,
  projectId: number,
  episodeId: number,
  consigne: string,
  options: { position?: Position; place?: PlaceScene; retour?: string } = {},
): Promise<(EntreeSkill & { sceneVoisineId: number | null }) | null> {
  const c = await contexteEpisode(db, projectId, episodeId);
  if (!c) return null;
  const paroles = await parolesDuProjet(db, projectId);
  const insertion = options.position != null;
  let voisinAvant: PlanLu | null = null;
  let voisinApres: PlanLu | null = null;
  // A SCENE to insert: its neighbours are the scene before it and the one after it; the last clip of the first and the first clip of the other
  // are the clips to match (the end of one, the start of the other).
  let sceneAvant: (typeof c.lesScenes)[number] | null = null;
  let sceneApres: (typeof c.lesScenes)[number] | null = null;
  if (options.place) {
    const i = "apresSceneId" in options.place ? c.lesScenes.findIndex((s) => s.id === (options.place as { apresSceneId: number }).apresSceneId) : -1;
    sceneAvant = i >= 0 ? (c.lesScenes[i] ?? null) : null;
    sceneApres = c.lesScenes[i + 1] ?? null;
    voisinAvant = sceneAvant ? ([...c.lesPlans].reverse().find((p) => p.sceneId === sceneAvant!.id) ?? null) : null;
    voisinApres = sceneApres ? (c.lesPlans.find((p) => p.sceneId === sceneApres!.id) ?? null) : null;
  } else if (options.position) {
    const i = "apresPlanUuid" in options.position ? c.lesPlans.findIndex((p) => p.uuid === (options.position as { apresPlanUuid: string }).apresPlanUuid) : "debut" in options.position ? -1 : c.lesPlans.length - 1;
    voisinAvant = i >= 0 ? (c.lesPlans[i] ?? null) : null;
    voisinApres = c.lesPlans[i + 1] ?? null;
  }
  const contexte: ContexteUtilise[] = [
    { type: "episode", libelle: `Épisode ${c.ep.numero} · ${c.ep.titre}`, ref: String(c.ep.id) },
    ...(c.precedents.length ? [{ type: "episode" as const, libelle: `Résumé de ${c.precedents.length} épisode${c.precedents.length > 1 ? "s" : ""} précédent${c.precedents.length > 1 ? "s" : ""} (continuité narrative)` }] : []),
    ...(c.suivants.length ? [{ type: "episode" as const, libelle: `Titre et résumé de ${c.suivants.length} épisode${c.suivants.length > 1 ? "s" : ""} suivant${c.suivants.length > 1 ? "s" : ""} (ce que l'épisode doit préparer)` }] : []),
    ...(c.lesPlans.length ? [{ type: "plan" as const, libelle: `${c.lesPlans.length} plan${c.lesPlans.length > 1 ? "s" : ""} existant${c.lesPlans.length > 1 ? "s" : ""}` }] : []),
    ...(voisinAvant ? [{ type: "plan" as const, libelle: `Plan précédent · ${voisinAvant.titre}`, ref: voisinAvant.uuid }] : []),
    ...(voisinApres ? [{ type: "plan" as const, libelle: `Plan suivant · ${voisinApres.titre}`, ref: voisinApres.uuid }] : []),
    ...(sceneAvant ? [{ type: "episode" as const, libelle: `Scène précédente · ${sceneAvant.titre}` }] : []),
    ...(sceneApres ? [{ type: "episode" as const, libelle: `Scène suivante · ${sceneApres.titre}` }] : []),
    { type: "registre", libelle: `Registre : ${c.registre.length} asset${c.registre.length > 1 ? "s" : ""} (noms existants)` },
    ...c.contexteBrief,
    ...(paroles.length ? [{ type: "brief" as const, libelle: `Paroles de l'auteur (${paroles.length} message${paroles.length > 1 ? "s" : ""} de sa conception)` }] : []),
  ];
  const sceneVue = (s: typeof sceneAvant) => (s ? { titre: s.titre, fonction: s.fonction ?? "", ambiance: (s.ambiance ?? "").trim() } : null);
  return {
    skill: "scenario-episode",
    contexte,
    sceneVoisineId: options.place ? null : (voisinAvant?.sceneId ?? voisinApres?.sceneId ?? null),
    entree: {
      portee: options.place
        ? { type: "scene-a-inserer", instruction: "Ne propose QU'UNE SEULE scène neuve (une seule entrée dans `scenes`), de 2 à 5 plans : la scène à insérer entre `scenePrecedente` et `sceneSuivante`." }
        : insertion
          ? { type: "plan-a-inserer", instruction: "Ne propose QU'UN SEUL plan (une seule scène, un seul plan) : le plan à insérer." }
          : { type: "episode" },
      episode: { titre: c.ep.titre, resume: c.ep.resume },
      // The arc of THIS episode as the brief sets it (same title, or same rank otherwise).
      briefEpisode: briefDeEpisode(c.brief, c.ep.titre, c.ep.numero),
      resumesEpisodesPrecedents: c.precedents,
      resumesEpisodesSuivants: c.suivants,
      scenesExistantes: c.lesScenes,
      plansExistants: c.lesPlans.map((p) => ({ titre: p.titre, description: p.description, dureeSecondes: p.dureeGenerationSecondes })),
      ...(insertion || options.place ? { planPrecedent: voisinAvant, planSuivant: voisinApres } : {}),
      ...(options.place ? { scenePrecedente: sceneVue(sceneAvant), sceneSuivante: sceneVue(sceneApres) } : {}),
      registre: c.registre,
      briefExtrait: c.extrait,
      ...(paroles.length ? { parolesDeLAuteur: paroles } : {}),
      consigne,
      ...(options.retour ? { retourUtilisateur: options.retour } : {}),
    },
  };
}

/** The `traitement-episode` input (step E): the episode to split into scenes. The stable keys (episode, brief, registry, the author's words) first,
 * what varies (duration, instruction) at the end: the prompt prefix stays the same from one call to the next, and the server caches it.
 * Null if the episode is not in the project or if the brief gives no duration (nothing to divide). */
export async function entreeTraitement(
  db: Db,
  projectId: number,
  episodeId: number,
  consigne: string,
  options: { retour?: string } = {},
): Promise<EntreeSkill | null> {
  const c = await contexteEpisode(db, projectId, episodeId);
  if (!c) return null;
  const duree = (c.extrait as { dureeEpisodeSecondes?: number } | null)?.dureeEpisodeSecondes;
  if (typeof duree !== "number" || duree <= 0) return null;
  const paroles = await parolesDuProjet(db, projectId);
  const contexte: ContexteUtilise[] = [
    { type: "episode", libelle: `Épisode ${c.ep.numero} · ${c.ep.titre}`, ref: String(c.ep.id) },
    ...(c.precedents.length ? [{ type: "episode" as const, libelle: `Résumé de ${c.precedents.length} épisode${c.precedents.length > 1 ? "s" : ""} précédent${c.precedents.length > 1 ? "s" : ""} (continuité narrative)` }] : []),
    { type: "registre", libelle: `Registre : ${c.registre.length} asset${c.registre.length > 1 ? "s" : ""} (noms existants)` },
    ...c.contexteBrief,
    ...(paroles.length ? [{ type: "brief" as const, libelle: `Paroles de l'auteur (${paroles.length} message${paroles.length > 1 ? "s" : ""} de sa conception)` }] : []),
  ];
  return {
    skill: "traitement-episode",
    contexte,
    entree: {
      episode: { titre: c.ep.titre, resume: c.ep.resume },
      briefEpisode: briefDeEpisode(c.brief, c.ep.titre, c.ep.numero),
      resumesEpisodesPrecedents: c.precedents,
      resumesEpisodesSuivants: c.suivants,
      registre: c.registre,
      briefExtrait: c.extrait,
      ...(paroles.length ? { parolesDeLAuteur: paroles } : {}),
      dureeCibleSecondes: duree,
      nombreDeScenes: nombreDeScenesVise(duree),
      consigne,
      ...(options.retour ? { retourUtilisateur: options.retour } : {}),
    },
  };
}

/** The `scenario-scene` input (step E): ONE scene of an episode, written from its treatment. The start of the input (episode, brief, registry, the author's words,
 * the episode's treatment) is the same for all scenes: it goes into the cache. The scene and its neighbours (PLANNED entry and exit states: the scenes
 * are written in parallel, none reads the other's text) come after. Null if the scene is not in the project or has no treatment. */
export async function entreeScenarioScene(
  db: Db,
  projectId: number,
  sceneId: number,
  consigne: string,
  options: { retour?: string } = {},
): Promise<(EntreeSkill & { episodeId: number }) | null> {
  const [sc] = await db
    .select({ id: scenes.id, episodeId: scenes.episodeId, titre: scenes.titre, fonction: scenes.fonction, ambiance: scenes.ambiance, traitement: scenes.traitement })
    .from(scenes)
    .innerJoin(episodes, eq(episodes.id, scenes.episodeId))
    .where(and(eq(scenes.id, sceneId), eq(episodes.projectId, projectId)));
  const t = sc ? traitementDeScene(sc.traitement) : null;
  if (!sc || !t) return null;
  const c = await contexteEpisode(db, projectId, sc.episodeId);
  if (!c) return null;
  const toutes = await db
    .select({ id: scenes.id, titre: scenes.titre, traitement: scenes.traitement })
    .from(scenes)
    .where(eq(scenes.episodeId, sc.episodeId))
    .orderBy(asc(scenes.ordre), asc(scenes.id));
  const i = toutes.findIndex((x) => x.id === sc.id);
  const voisine = (x: (typeof toutes)[number] | undefined) => (x ? { titre: x.titre, traitement: traitementDeScene(x.traitement) } : null);
  const avant = voisine(toutes[i - 1]);
  const apres = voisine(toutes[i + 1]);
  const paroles = await parolesDuProjet(db, projectId);
  const contexte: ContexteUtilise[] = [
    { type: "episode", libelle: `Épisode ${c.ep.numero} · ${c.ep.titre}`, ref: String(c.ep.id) },
    { type: "episode", libelle: `Traitement : ${toutes.length} scène${toutes.length > 1 ? "s" : ""} de l'épisode` },
    { type: "registre", libelle: `Registre : ${c.registre.length} asset${c.registre.length > 1 ? "s" : ""} (noms existants)` },
    ...c.contexteBrief,
    ...(paroles.length ? [{ type: "brief" as const, libelle: `Paroles de l'auteur (${paroles.length} message${paroles.length > 1 ? "s" : ""} de sa conception)` }] : []),
  ];
  return {
    skill: "scenario-scene",
    contexte,
    episodeId: sc.episodeId,
    entree: {
      episode: { titre: c.ep.titre, resume: c.ep.resume },
      briefEpisode: briefDeEpisode(c.brief, c.ep.titre, c.ep.numero),
      briefExtrait: c.extrait,
      registre: c.registre,
      ...(paroles.length ? { parolesDeLAuteur: paroles } : {}),
      traitementEpisode: toutes.map((x) => ({ titre: x.titre, intention: traitementDeScene(x.traitement)?.intention ?? "" })),
      scene: {
        titre: sc.titre,
        fonction: sc.fonction ?? "",
        ambiance: (sc.ambiance ?? "").trim(),
        intention: t.intention,
        etatEntree: t.etatEntree,
        etatSortie: t.etatSortie,
        dureeCibleSecondes: t.dureeCibleSecondes,
        ...(t.momentsDeLAuteur ? { momentsDeLAuteur: t.momentsDeLAuteur } : {}),
        position: `${i + 1} sur ${toutes.length}`,
      },
      scenePrecedente: avant ? { titre: avant.titre, etatSortie: avant.traitement?.etatSortie ?? "" } : null,
      sceneSuivante: apres ? { titre: apres.titre, etatEntree: apres.traitement?.etatEntree ?? "" } : null,
      consigne,
      ...(options.retour ? { retourUtilisateur: options.retour } : {}),
    },
  };
}

/** The `relecture-scenario` input for ONE episode (FRICTIONS 2026-10-19): everything the screenplay has written — scenes (ambiance), clips in order
 * with their link, their duration and their COMPLETE description (intent, lines of dialogue; the old "État en fin de plan" removed), the registry, the author's words — so that
 * the model keeps the state of the world consistent from start to finish. Clips are cited by HANDLE ("P07", the rank at that moment, never stored: F03);
 * `planUuids` (in order) is kept in the task's options: the worker checks at the end that the episode has not moved between the read and the reply.
 * Null if there is nothing to review (no clip) or if the episode is not in the project. */
export async function entreeRelecture(
  db: Db,
  projectId: number,
  episodeId: number,
  consigne: string,
  options: { retour?: string } = {},
): Promise<(EntreeSkill & { planUuids: string[] }) | null> {
  const c = await contexteEpisode(db, projectId, episodeId);
  if (!c || c.lesPlans.length === 0) return null;
  const liaisons = new Map((await db.select({ uuid: plans.uuid, liaison: plans.liaison }).from(plans).where(eq(plans.episodeId, episodeId))).map((l) => [l.uuid, liaisonOuDefaut(l.liaison)]));
  const paroles = await parolesDuProjet(db, projectId);
  const poignee = (i: number) => `P${String(i + 1).padStart(2, "0")}`;
  const titreScene = new Map(c.lesScenes.map((s) => [s.id, s.titre]));
  const lesPlans = c.lesPlans.map((p, i) => ({
    plan: poignee(i),
    scene: p.sceneId != null ? (titreScene.get(p.sceneId) ?? "") : "",
    titre: p.titre,
    liaison: liaisons.get(p.uuid) ?? "suite",
    dureeSecondes: p.dureeGenerationSecondes,
    description: p.description,
  }));
  const contexte: ContexteUtilise[] = [
    { type: "episode", libelle: `Épisode ${c.ep.numero} · ${c.ep.titre}`, ref: String(c.ep.id) },
    { type: "plan", libelle: `${lesPlans.length} plan${lesPlans.length > 1 ? "s" : ""} relu${lesPlans.length > 1 ? "s" : ""} : intentions et répliques` },
    { type: "registre", libelle: `Registre : ${c.registre.length} asset${c.registre.length > 1 ? "s" : ""} (noms existants)` },
    ...c.contexteBrief,
    ...(paroles.length ? [{ type: "brief" as const, libelle: `Paroles de l'auteur (${paroles.length} message${paroles.length > 1 ? "s" : ""} de sa conception)` }] : []),
  ];
  const duree = (c.extrait as { dureeEpisodeSecondes?: number } | null)?.dureeEpisodeSecondes;
  return {
    skill: "relecture-scenario",
    contexte,
    planUuids: c.lesPlans.map((p) => p.uuid),
    entree: {
      episode: { titre: c.ep.titre, resume: c.ep.resume },
      briefEpisode: briefDeEpisode(c.brief, c.ep.titre, c.ep.numero),
      briefExtrait: c.extrait,
      ...(paroles.length ? { parolesDeLAuteur: paroles } : {}),
      scenes: c.lesScenes.map((s) => ({ titre: s.titre, fonction: s.fonction ?? "", ambiance: (s.ambiance ?? "").trim() })),
      plans: lesPlans,
      ...(typeof duree === "number" && duree > 0 ? { dureeCibleSecondes: duree } : {}),
      registre: c.registre,
      consigne,
      ...(options.retour ? { retourUtilisateur: options.retour } : {}),
    },
  };
}

export async function entreeCorrectionPlan(db: Db, projectId: number, planUuid: string, consigne: string, retour?: string): Promise<(EntreeSkill & { plan: { uuid: string; titre: string; episodeId: number } }) | null> {
  const [p] = await db
    .select({ uuid: plans.uuid, titre: plans.titre, description: plans.description, duree: plans.dureeGenerationSecondes, episodeId: plans.episodeId })
    .from(plans)
    .where(and(eq(plans.uuid, planUuid), eq(plans.projectId, projectId)));
  if (!p) return null;
  const c = await contexteEpisode(db, projectId, p.episodeId);
  if (!c) return null;
  const contexte: ContexteUtilise[] = [
    { type: "plan", libelle: `Plan · ${p.titre}`, ref: p.uuid },
    { type: "episode", libelle: `Épisode ${c.ep.numero} · ${c.ep.titre}`, ref: String(c.ep.id) },
    { type: "registre", libelle: `Registre : ${c.registre.length} asset${c.registre.length > 1 ? "s" : ""}` },
    ...c.contexteBrief,
  ];
  return {
    skill: "scenario-episode",
    contexte,
    plan: { uuid: p.uuid, titre: p.titre, episodeId: p.episodeId },
    entree: {
      portee: { type: "plan-a-corriger", instruction: "Ne propose QU'UN SEUL plan (une seule scène, un seul plan) : le plan corrigé." },
      episode: { titre: c.ep.titre, resume: c.ep.resume },
      planACorriger: { titre: p.titre, description: sansEtatDeFin(p.description), dureeSecondes: p.duree },
      plansVoisins: c.lesPlans.filter((x) => x.uuid !== p.uuid).map((x) => ({ titre: x.titre, description: x.description })),
      registre: c.registre,
      briefExtrait: c.extrait,
      consigne,
      ...(retour ? { retourUtilisateur: retour } : {}),
    },
  };
}

/** The input of the small `references-plan` skill for a clip, with the code's choice (`choix`): the caller posts the task ONLY if `choix.suffit` is false
 * (otherwise the code's references are enough). Posted by a clip's preparation (lib/agents/service-clips.ts, `genererReferencesPlan`). `assetsProposesParLeLot`:
 * the assets an ongoing inventory is about to create (the skill may cite them, never propose them again). `null` if the clip is not in this project. */
export async function entreeReferencesPlan(
  db: Db,
  projectId: number,
  planUuid: string,
  options: { assetsProposesParLeLot?: { code: string; type: string }[] } = {},
): Promise<(EntreeSkill & { choix: ChoixReferencesPlan }) | null> {
  const [p] = await db.select({ id: plans.id }).from(plans).where(and(eq(plans.uuid, planUuid), eq(plans.projectId, projectId)));
  if (!p) return null;
  const choix = await choisirReferencesPlan(db, p.id);
  if (!choix) return null;
  const entree = construireEntreeReferencesPlan({
    narration: choix.narration,
    locuteurs: choix.locuteurs,
    dureeSecondes: choix.plan.dureeSecondes,
    scene: choix.scene,
    references: choix.references,
    doutes: choix.doutes,
    decorPrecedent: choix.decorPrecedent,
    candidats: choix.candidats,
    assetsProposesParLeLot: options.assetsProposesParLeLot,
  });
  return {
    skill: SKILL_REFERENCES_PLAN,
    choix,
    contexte: [
      { type: "plan", libelle: `Plan · ${choix.plan.titre}`, ref: choix.plan.uuid },
      { type: "registre", libelle: `Registre : ${entree.candidats.length} asset${entree.candidats.length > 1 ? "s" : ""} candidat${entree.candidats.length > 1 ? "s" : ""}` },
    ],
    entree,
  };
}

/** The last FINISHED render of a clip (generated or imported) whose file is known, or null. */
async function dernierRendu(db: Db, planId: number) {
  const [j] = await db
    .select({ id: jobs.id, cheminSortie: jobs.cheminSortie, finishedAt: jobs.finishedAt, createdAt: jobs.createdAt, workflowFichier: jobs.workflowFichier })
    .from(jobs)
    .where(and(eq(jobs.planId, planId), eq(jobs.statut, "termine"), isNotNull(jobs.cheminSortie)))
    .orderBy(desc(jobs.createdAt), desc(jobs.id))
    .limit(1);
  return j ?? null;
}

/** A specific FINISHED render of a clip (same shape as `dernierRendu`), or null if it does not exist, is not finished or has no file. */
async function renduDuPlan(db: Db, planId: number, jobId: number) {
  const [j] = await db
    .select({ id: jobs.id, cheminSortie: jobs.cheminSortie, finishedAt: jobs.finishedAt, createdAt: jobs.createdAt, workflowFichier: jobs.workflowFichier })
    .from(jobs)
    .where(and(eq(jobs.id, jobId), eq(jobs.planId, planId), eq(jobs.statut, "termine"), isNotNull(jobs.cheminSortie)))
    .limit(1);
  return j ?? null;
}

/** The history of post-viewing corrections already attempted on this clip (see `historiqueIteration`). Since 2026-11-09, an iteration's decisions
 * are written with the RECOMPILED sheet (a `plan-h3ir` proposal of the same request): its application is what makes it "appliquée". */
async function historiqueDuPlan(db: Db, projectId: number, planId: number) {
  const lues = await db
    .select({ id: propositions.id, createdAt: propositions.createdAt, appliedAt: propositions.appliedAt, statut: propositions.statut, consigne: propositions.consigne, resultat: agentRuns.resultat, entree: agentRuns.entree, demandeId: agentRuns.demandeId })
    .from(propositions)
    .leftJoin(agentRuns, eq(agentRuns.id, propositions.runId))
    .where(and(eq(propositions.projectId, projectId), eq(propositions.skill, "iteration-plan"), eq(propositions.portee, "plan"), eq(propositions.cibleId, planId)));
  const demandesIds = [...new Set(lues.map((p) => p.demandeId).filter((d): d is number => d != null))];
  const recompilees = demandesIds.length
    ? await db
        .select({ demandeId: agentRuns.demandeId, statut: propositions.statut, appliedAt: propositions.appliedAt })
        .from(agentRuns)
        .innerJoin(propositions, eq(propositions.id, agentRuns.propositionId))
        .where(and(eq(agentRuns.skill, SKILL_H3IR), inArray(agentRuns.demandeId, demandesIds), eq(propositions.statut, "appliquee")))
    : [];
  const appliqueeLe = new Map(recompilees.filter((r) => r.demandeId != null && r.appliedAt != null).map((r) => [r.demandeId!, r.appliedAt!]));
  const props = lues.map((p) => {
    const le = p.demandeId != null ? appliqueeLe.get(p.demandeId) : undefined;
    return le ? { ...p, statut: "appliquee", appliedAt: le } : p;
  });
  const ids = props.map((p) => p.id);
  const comptes = ids.length
    ? await db.select({ id: propositionChangements.propositionId, n: count() }).from(propositionChangements).where(inArray(propositionChangements.propositionId, ids)).groupBy(propositionChangements.propositionId)
    : [];
  const nb = new Map(comptes.map((c) => [c.id, Number(c.n)]));
  const rendus = await db
    .select({ fin: jobs.finishedAt })
    .from(jobs)
    .where(and(eq(jobs.planId, planId), eq(jobs.statut, "termine"), isNotNull(jobs.cheminSortie)));
  return historiqueIteration(
    props.map((p) => ({ ...p, nbChangements: nb.get(p.id) ?? 0 })),
    rendus.map((r) => r.fin).filter((d): d is Date => d != null),
  );
}

/** The `iteration-plan` input for ONE clip that has a render (routing by clip state, 2026-10-02: without a render, no
 * blind correction). See agents/skills/iteration-plan/SKILL.md, "Ce que tu reçois":
 * - `plan` (title, intent, wanted duration, fps), `promptActuel` (the six STORED sections, labels included);
 * - `references`: each label of the clip → asset, role, retention;
 * - `retourVisionnage` (required), `historique`;
 * - `planche`: a DESCRIPTOR of the render (job, path relative to MEDIA_ROOT, contact-sheet cap). The images are
 *   NEVER stored in agent_runs.entree: the worker rebuilds the contact sheet at run time
 *   (worker/agents/preparation.ts), measures the real duration (ffprobe) and replaces `planche` with `rendu`.
 *   The contact sheet is NEVER automatic (decision 2026-10-12): without `avecPlanche`, the descriptor is absent, the input carries
 *   `sansPlanche: true` and the agent works from the instruction and the current sheet (neither `rendu` nor measured duration). */
export async function entreeIterationPlan(
  db: Db,
  projectId: number,
  planUuid: string,
  retourVisionnage: string,
  /** Clip sheet of the "montage" table: the attempt (job) the agent must watch, when it is not the latest. */
  renduId?: number | null,
  /** Attach the render's contact sheet (ffprobe + ffmpeg at run time): "Montrer au chef opérateur" or "Analyser". */
  avecPlanche = false,
): Promise<(EntreeSkill & { plan: { id: number; uuid: string; titre: string } }) | { erreur: string }> {
  const [p] = await db.select().from(plans).where(and(eq(plans.uuid, planUuid), eq(plans.projectId, projectId)));
  if (!p) return { erreur: "Plan introuvable dans ce projet." };
  const rendu = renduId != null ? (await renduDuPlan(db, p.id, renduId)) ?? (await dernierRendu(db, p.id)) : await dernierRendu(db, p.id);
  if (!rendu?.cheminSortie) return { erreur: "Ce plan n'a pas encore de rendu terminé : on ne corrige pas un prompt à l'aveugle. Génère (ou importe) le plan, regarde-le, puis reviens." };
  const lignes = await db.select({ section: planPromptSections.section, contenu: planPromptSections.contenu }).from(planPromptSections).where(eq(planPromptSections.planId, p.id));
  const sections: Record<string, string> = {};
  for (const l of lignes) sections[l.section] = sections[l.section] ? `${sections[l.section]}\n${l.contenu}` : l.contenu;
  if (!Object.values(sections).some((s) => s.trim())) return { erreur: "Ce plan n'a pas de fiche (prompt vide) : écris-la d'abord (« Écrire la fiche »)." };

  // The neighbours, for the MATCH CUT (read-only): intent and end of the previous one, intent and start of the next one. Light context: 400 characters
  // of intent (the END of the previous one's, the START of the next one's: that is where the clips touch) and 450 of shot at most per neighbour.
  const lesPlans = await plansDe(db, p.episodeId);
  const rangPlan = lesPlans.findIndex((x) => x.uuid === p.uuid);
  const avant = rangPlan > 0 ? lesPlans[rangPlan - 1]! : null;
  const apres = rangPlan >= 0 ? lesPlans[rangPlan + 1] ?? null : null;
  const [shotsAvant, shotsApres] = await Promise.all([avant ? shotsExtremesDuPlan(db, avant.uuid) : null, apres ? shotsExtremesDuPlan(db, apres.uuid) : null]);
  const [refs, historique] = await Promise.all([
    db
      .select({ type: planRefs.type, slot: planRefs.slot, role: planRefs.role, retention: planRefs.retention, code: assets.code, typeAsset: assets.type })
      .from(planRefs)
      .leftJoin(assets, eq(assets.id, planRefs.assetId))
      .where(eq(planRefs.planId, p.id))
      .orderBy(asc(planRefs.type), asc(planRefs.slot)),
    historiqueDuPlan(db, projectId, p.id),
  ]);
  const libelleType = { picture: "Picture", video: "Video" } as const;
  const references = [
    ...refs.flatMap((r) => (r.type === "audio" ? [] : [{ ...r, type: r.type }])).map((r) => ({
      label: `<${libelleType[r.type]} ${r.slot}>`,
      type: r.type,
      slot: r.slot,
      asset: r.code ?? null,
      typeAsset: r.typeAsset ?? null,
      role: r.role ?? "",
      ...(r.retention ? { retention: r.retention } : {}),
    })),
  ];
  const importe = rendu.workflowFichier === WORKFLOW_IMPORT_MANUEL;
  // The registry: what is needed to ADD a reference (existing codes, never invented); without the voices (composite "keyframe" poses are cited like the other images).
  // `image`: the asset's file exists (a reference added without an image does not compile yet).
  const fichiers = new Map(
    (await db.select({ code: assets.code, fichier: assets.fichier }).from(assets).where(eq(assets.projectId, projectId))).map((a) => [a.code, !!a.fichier && existsSync(join(MEDIA_ROOT, cheminAssetMedia(a.fichier)))]),
  );
  const registre = (await registreResume(db, projectId)).map((a) => ({ ...a, image: fichiers.get(a.code) ?? false }));
  // The effective Open H3 IR settings of the clip (clip > scene > project) and the allowed values: the agent sets the camera and the rhythm through them, not through text.
  const [sceneR] = p.sceneId != null ? await db.select({ creativite: scenes.creativite, styleCamera: scenes.styleCamera }).from(scenes).where(eq(scenes.id, p.sceneId)) : [];
  const [projetR] = await db.select({ creativite: projects.creativite, styleCamera: projects.styleCamera }).from(projects).where(eq(projects.id, projectId));
  const resolus = resoudreReglages({ projet: projetR, scene: sceneR, plan: { creativite: p.creativite, styleCamera: p.styleCamera } });
  const reglages = {
    creativite: { actuelle: resolus.creativite, regleSur: LIBELLE_NIVEAU[resolus.origine.creativite] },
    styleMiseEnScene: { actuel: resolus.styleCamera ?? STYLE_AUCUN, regleSur: LIBELLE_NIVEAU[resolus.origine.styleCamera] },
    choix: {
      creativite: CREATIVITES.map((v) => ({ valeur: v, nom: LIBELLE_CREATIVITE[v], effet: AIDE_CREATIVITE[v] })),
      styleMiseEnScene: [{ valeur: STYLE_AUCUN, nom: "Aucun style", effet: "Aucun goût de mise en scène imposé : seuls l'intent et les images décident." }, ...MISES_EN_SCENE.map((v) => ({ valeur: v, nom: RESUME_STYLE_CAMERA[v], effet: DETAIL_STYLE_CAMERA[v] }))],
    },
  };
  const contexte: ContexteUtilise[] = [
    { type: "plan", libelle: `Plan · ${p.titre} · prompt actuel (six sections)`, ref: p.uuid },
    { type: "registre", libelle: `Registre : ${registre.length} asset${registre.length > 1 ? "s" : ""} à citer en référence` },
    {
      type: "plan",
      libelle: avecPlanche
        ? `Rendu ${importe ? "importé" : "généré"} du ${(rendu.finishedAt ?? rendu.createdAt).toLocaleString("fr-FR")} · planche de vignettes (une par seconde), extraite à l'exécution`
        : "Sans planche de vignettes : la consigne et la fiche actuelle seulement",
    },
    { type: "registre", libelle: `${refs.length} référence${refs.length > 1 ? "s" : ""} du plan` },
    ...(historique.length ? [{ type: "plan" as const, libelle: `${historique.length} correction${historique.length > 1 ? "s" : ""} déjà tentée${historique.length > 1 ? "s" : ""} sur ce plan` }] : []),
    ...(avant ? [{ type: "plan" as const, libelle: `Plan précédent · ${avant.titre} (lecture seule, pour le raccord)`, ref: avant.uuid }] : []),
    ...(apres ? [{ type: "plan" as const, libelle: `Plan suivant · ${apres.titre} (lecture seule, pour le raccord)`, ref: apres.uuid }] : []),
  ];
  return {
    skill: "iteration-plan",
    contexte,
    plan: { id: p.id, uuid: p.uuid, titre: p.titre },
    entree: {
      plan: { titre: p.titre, intention: sansEtatDeFin(p.description), liaison: liaisonOuDefaut(p.liaison), dureeVoulueSecondes: p.dureeGenerationSecondes, fps: p.fps },
      promptActuel: Object.fromEntries(ORDRE_SECTIONS.map((s) => [s, sections[s] ?? ""])),
      references,
      registre,
      reglages,
      retourVisionnage,
      historique,
      plansVoisins: {
        precedent: avant ? { titre: avant.titre, intention: avant.description.length > 400 ? `…${avant.description.slice(-399)}` : avant.description, ...(shotsAvant?.dernier ? { dernierShot: shotsAvant.dernier } : {}) } : null,
        suivant: apres ? { titre: apres.titre, liaison: apres.liaison, intention: apres.description.length > 400 ? `${apres.description.slice(0, 399)}…` : apres.description, ...(shotsApres?.premier ? { premierShot: shotsApres.premier } : {}) } : null,
      },
      ...(avecPlanche
        ? { planche: { jobId: rendu.id, cheminSortie: rendu.cheminSortie, maxVignettes: MAX_VIGNETTES_ITERATION, importe } }
        : { sansPlanche: true }),
    },
  };
}

// --- asset inventory -----------------------------------------------------------

/** `inventaire-assets` input: ALL the project's clips (title and intent, by scene and by episode), the current
 * registry and the brief. A single call for the project: the overview is what avoids duplicates between clips.
 * `null` if the project has no written clip. */
export async function entreeInventaire(db: Db, projectId: number, consigne: string, retour?: string): Promise<(EntreeSkill & { nbPlans: number; planUuids: Record<string, string>; entree: EntreeInventaire }) | null> {
  const eps = await db
    .select({ id: episodes.id, numero: episodes.numero, titre: episodes.titre, resume: episodes.resume })
    .from(episodes)
    .where(eq(episodes.projectId, projectId))
    .orderBy(asc(episodes.numero));
  if (eps.length === 0) return null;
  const ids = eps.map((e) => e.id);
  const lesScenes = await db.select({ id: scenes.id, episodeId: scenes.episodeId, titre: scenes.titre, fonction: scenes.fonction }).from(scenes).where(inArray(scenes.episodeId, ids)).orderBy(asc(scenes.ordre), asc(scenes.id));
  const lesPlans = await db
    .select({ uuid: plans.uuid, episodeId: plans.episodeId, sceneId: plans.sceneId, titre: plans.titre, description: plans.description })
    .from(plans)
    .where(inArray(plans.episodeId, ids))
    .orderBy(asc(plans.ordre), asc(plans.id));
  if (lesPlans.length === 0) return null;
  // Each clip receives a handle ("P07", in the input's reading order) that the model cites in `references`; the handle → uuid mapping stays
  // in the task's options (`planUuids`), never shown (lib/agents/inventory.ts).
  const planUuids: Record<string, string> = {};

  const registre = (await registreResume(db, projectId));
  const lireBrief = await lireBriefDuProjet(db, projectId);
  const { extrait, contexte: contexteBrief } = extraitsBrief(lireBrief?.contenu ?? null);
  const [projet] = await db.select({ clauseStyle: projects.clauseStyle }).from(projects).where(eq(projects.id, projectId));

  const episodesEntree = eps.map((e) => {
    const sc = lesScenes.filter((s) => s.episodeId === e.id);
    const duPlan = lesPlans.filter((p) => p.episodeId === e.id);
    const plansDe = (sceneId: number | null) =>
      duPlan
        .filter((p) => p.sceneId === sceneId)
        .map((p) => {
          const id = poigneePlan(Object.keys(planUuids).length + 1);
          planUuids[id] = p.uuid;
          return { id, titre: p.titre, intention: sansEtatDeFin(p.description).slice(0, 400) };
        });
    const desScenes = sc.map((s) => ({ titre: s.titre, fonction: s.fonction ?? "", plans: plansDe(s.id) }));
    const orphelins = plansDe(null);
    return {
      episode: `Épisode ${e.numero} · ${e.titre}`,
      resume: e.resume,
      scenes: [...desScenes, ...(orphelins.length ? [{ titre: "(hors scène)", fonction: "", plans: orphelins }] : [])],
    };
  });
  const contexte: ContexteUtilise[] = [
    { type: "registre", libelle: `Registre : ${registre.length} asset${registre.length > 1 ? "s" : ""} existant${registre.length > 1 ? "s" : ""}` },
    { type: "projet", libelle: `${lesPlans.length} plan${lesPlans.length > 1 ? "s" : ""} sur ${eps.length} épisode${eps.length > 1 ? "s" : ""}` },
    ...(projet?.clauseStyle ? [{ type: "projet" as const, libelle: "Clause de style du projet" }] : []),
    ...contexteBrief,
  ];
  return {
    skill: "inventaire-assets",
    contexte,
    nbPlans: lesPlans.length,
    planUuids,
    entree: {
      registre,
      brief: extrait,
      clauseStyleDuProjet: projet?.clauseStyle ?? "",
      episodes: episodesEntree,
      consigne,
      ...(retour ? { retourUtilisateur: retour } : {}),
    },
  };
}
