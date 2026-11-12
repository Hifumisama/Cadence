import { and, asc, count, desc, eq, gt, inArray, isNotNull, lt } from "drizzle-orm";
import { agentConversations, agentRuns, assets, briefs, episodes, jobs, planPromptSections, planRefs, plans, projects, propositionChangements, propositions, scenes } from "../../db/schema";
import { horsAffiches } from "../assets-visibles";
import { variantePromptAsset } from "../llm/variantes";
import { WORKFLOW_IMPORT_MANUEL } from "../plan-checks";
import { ORDRE_SECTIONS } from "../prompt";
import type { Db } from "./applicateurs/commun";
import { sansClesAbandonnees } from "./brief";
import { MAX_VIGNETTES_ITERATION, historiqueIteration } from "./iteration-plan";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { cheminAssetMedia, MEDIA_ROOT } from "../media";
import { AIDE_CREATIVITE, CREATIVITES, DETAIL_STYLE_CAMERA, LIBELLE_CREATIVITE, LIBELLE_NIVEAU, MISES_EN_SCENE, RESUME_STYLE_CAMERA, STYLE_AUCUN, resoudreReglages } from "../h3ir/reglages";
import { SKILL_H3IR } from "../h3ir/resultat";
import { detailsDuBrief, libelleDetailsDuBrief } from "./registre";
import { poigneePlan, type EntreeInventaire } from "./inventaire";
import { liaisonOuDefaut, type Liaison } from "../plan-liaison";
import { sansEtatDeFin } from "../intent";
import { nombreDeScenesVise, traitementDeScene } from "./traitement";
import { choisirReferencesPlan, type ChoixReferencesPlan } from "../h3ir/references-plan-db";
import { construireEntreeReferencesPlan, SKILL_REFERENCES_PLAN } from "./references-plan";
import type { BriefContenu, ContexteUtilise, PlaceScene, Position } from "./types";

/** Ce que l'agent lit AUTOMATIQUEMENT pour une portée courte : des extraits du brief et de
 * l'état courant, jamais le brief entier d'office. Chaque fonction renvoie l'entrée du skill
 * ET la liste « contexte utilisé » que l'interface affiche (dépliable). Côté serveur. */

export type EntreeSkill = {
  skill: string;
  entree: object;
  contexte: ContexteUtilise[];
  /** Variante de skill (guides chargés), voir lib/llm/skills.ts. */
  variante?: string;
};

export async function lireBriefDuProjet(db: Db, projectId: number): Promise<{ contenu: BriefContenu; statut: string } | null> {
  const [b] = await db.select().from(briefs).where(eq(briefs.projectId, projectId));
  return b ? { contenu: sansClesAbandonnees(b.contenu as BriefContenu), statut: b.statut } : null;
}

/** Les extraits du brief utiles à une génération courte, et ce qu'on a lu. */
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
    // Personnages et lieux avec leurs détails (tenue, aspect du lieu : facultatifs, avec leur `statut` ; « incertain » = encore vague).
    personnages: brief.personnages,
    lieux: brief.lieux,
    // Effets visuels et objets qui comptent (couleur, ampleur, comportement), quand l'entretien en a noté.
    ...(brief.elements?.length ? { elements: brief.elements } : {}),
    // Les notes libres du projet (ex-« globaux du scénario ») : ce que l'utilisateur veut qu'on garde en tête.
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
  // L'entrée du brief dont l'asset est tiré (tenue, aspect, élément, avec leur statut : « incertain » et « déduit » ne sont pas des certitudes).
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

/** L'entrée de `prompt-asset` pour un asset du REGISTRE (étape 2) : un asset existant passe par
 * `entreePromptAsset` (sa description, son parent, ses plans) ; un asset à créer reçoit la même forme,
 * construite depuis la description du brief. Un master est toujours une génération (Krea 2) : on ne
 * charge que son guide. */
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

// --- épisode, plan ----------------------------------------------------------

/** `description` : l'intent du plan SANS l'ancien « État en fin de plan » (plans écrits avant le 2026-11-08, lib/intent.ts) : les skills ne le voient
 * plus, et ne le recopient donc pas. */
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

/** Ce que l'AUTEUR a lui-même écrit pendant la conception du projet (ses messages, dans l'ordre), pour que le scénario parte de ses mots et
 * non du seul arc résumé du brief : un pitch précis (plan large d'ouverture, geste, réplique, voix off) se perdait dans le résumé.
 * Plafonné (contexte léger) : les derniers messages l'emportent, chacun est coupé net au-delà de `MAX_MESSAGE`. */
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

/** Le DERNIER shot d'un prompt vidéo assemblé (`detailed_description`), lisible hors de son plan : le timecode et la coupe sont retirés, et
 * les labels `<Subject N>` (propres à CE plan) sont remplacés par le code de l'asset (`codes[N]`). Sert au plan suivant : son premier shot
 * reprend là où celui-ci finit (qui est où, tourné vers quoi, état du feu). Plafonné : contexte léger. Pur, testé. */
export const MAX_DERNIER_SHOT = 450;

export function dernierShotLisible(detailed: string, codes: Record<number, string>): string | null {
  const reperes = [...(detailed ?? "").matchAll(/\[Shot\s+\d+\]/g)];
  if (reperes.length === 0) return null;
  const dernier = reperes[reperes.length - 1]!;
  const corps = detailed
    .slice((dernier.index ?? 0) + dernier[0].length)
    // La coupe d'ouverture du shot : « Hard cut to » ou « the shot cuts to », « the camera transitions to »… (Open H3 IR, h3ir/prompts/base-en.txt §4.2).
    .replace(/^\s*At\s+\d{1,2}:\d{2}(?:\.\d{1,3})?\s*,?\s*(?:Hard cut to\s*|the\s+(?:shot|camera)\s+(?:cuts|transitions|changes|switches)\s+to\s*)?/i, "")
    .replace(/<\s*(?:Subject|Picture)\s*(\d+)\s*>/g, (_m, n: string) => codes[Number(n)] ?? "the subject")
    .replace(/\s+/g, " ")
    .trim();
  if (!corps) return null;
  return corps.length > MAX_DERNIER_SHOT ? `…${corps.slice(corps.length - MAX_DERNIER_SHOT + 1)}` : corps;
}

/** Le PREMIER shot d'un prompt assemblé, lisible hors de son plan (même traitement que `dernierShotLisible`) : le plan d'avant doit
 * finir là où celui-ci commence (itération : raccord vers l'aval). Le préambule d'ouverture (style, lumière) est écarté. */
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

/** Les shots extrêmes (premier, dernier) d'un plan qui a une fiche en base, lisibles hors de lui. */
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

/** L'entrée du brief qui correspond à cet épisode : même titre (insensible à la casse), sinon même rang. */
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
  // Une SCÈNE à insérer : ses voisines sont la scène qui la précède et celle qui la suit ; le dernier plan de l'une et le premier de l'autre
  // sont les plans à raccorder (la fin de l'un, le début de l'autre).
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
      // L'arc de CET épisode tel que le brief le pose (même titre, ou même rang à défaut).
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

/** L'entrée de `traitement-episode` (étape E) : l'épisode à découper en scènes. Les clés stables (épisode, brief, registre, mots de l'auteur) d'abord,
 * ce qui varie (durée, consigne) à la fin : le préfixe du prompt reste le même d'un appel à l'autre, le serveur le garde en cache.
 * Null si l'épisode n'est pas du projet ou si le brief ne donne pas de durée (rien à répartir). */
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

/** L'entrée de `scenario-scene` (étape E) : UNE scène d'un épisode, écrite depuis son traitement. Le début de l'entrée (épisode, brief, registre, mots de l'auteur,
 * traitement de l'épisode) est le même pour toutes les scènes : il part en cache. La scène et ses voisines (états d'entrée et de sortie PRÉVUS : les scènes
 * s'écrivent en parallèle, aucune ne lit le texte de l'autre) viennent après. Null si la scène n'est pas du projet ou n'a pas de traitement. */
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

/** L'entrée de `relecture-scenario` pour UN épisode (FRICTIONS 2026-10-19) : tout ce que le scénario a écrit — scènes (ambiance), plans dans l'ordre
 * avec leur liaison, leur durée et leur description COMPLÈTE (intention, répliques ; l'ancien « État en fin de plan » retiré), le registre, les mots de l'auteur — pour que
 * le modèle tienne le registre de l'état du monde d'un bout à l'autre. Les plans se citent par POIGNÉE (« P07 », le rang à cet instant, jamais stocké : F03) ;
 * `planUuids` (dans l'ordre) est gardé dans les options de la tâche : le worker vérifie à la fin que l'épisode n'a pas bougé entre la lecture et la réponse.
 * Null s'il n'y a rien à relire (aucun plan) ou si l'épisode n'est pas du projet. */
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

/** L'entrée du petit skill `references-plan` pour un plan, avec le choix du code (`choix`) : l'appelant ne pose la tâche QUE si `choix.suffit` est faux
 * (sinon les références du code suffisent). Posée par la préparation d'un plan (lib/agents/service.ts, `genererReferencesPlan`). `assetsProposesParLeLot` :
 * les assets qu'un inventaire en cours va créer (le skill peut les citer, jamais les reproposer). `null` si le plan n'est pas de ce projet. */
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

/** Le dernier rendu TERMINÉ d'un plan (généré ou importé) dont le fichier est connu, ou null. */
async function dernierRendu(db: Db, planId: number) {
  const [j] = await db
    .select({ id: jobs.id, cheminSortie: jobs.cheminSortie, finishedAt: jobs.finishedAt, createdAt: jobs.createdAt, workflowFichier: jobs.workflowFichier })
    .from(jobs)
    .where(and(eq(jobs.planId, planId), eq(jobs.statut, "termine"), isNotNull(jobs.cheminSortie)))
    .orderBy(desc(jobs.createdAt), desc(jobs.id))
    .limit(1);
  return j ?? null;
}

/** Un rendu TERMINÉ précis d'un plan (même forme que `dernierRendu`), ou null s'il n'existe pas, n'est pas fini ou n'a pas de fichier. */
async function renduDuPlan(db: Db, planId: number, jobId: number) {
  const [j] = await db
    .select({ id: jobs.id, cheminSortie: jobs.cheminSortie, finishedAt: jobs.finishedAt, createdAt: jobs.createdAt, workflowFichier: jobs.workflowFichier })
    .from(jobs)
    .where(and(eq(jobs.id, jobId), eq(jobs.planId, planId), eq(jobs.statut, "termine"), isNotNull(jobs.cheminSortie)))
    .limit(1);
  return j ?? null;
}

/** L'historique des corrections après visionnage déjà tentées sur ce plan (voir `historiqueIteration`). Depuis 2026-11-09, les décisions d'une itération
 * s'écrivent avec la fiche RECOMPILÉE (une proposition `plan-h3ir` de la même demande) : c'est son application qui fait « appliquée ». */
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

/** L'entrée d'`iteration-plan` pour UN plan qui a un rendu (routage par état du plan, 2026-10-02 : sans rendu, pas
 * de correction à l'aveugle). Voir agents/skills/iteration-plan/SKILL.md, « Ce que tu reçois » :
 * - `plan` (titre, intention, durée voulue, fps), `promptActuel` (les six sections STOCKÉES, labels compris) ;
 * - `references` : chaque label du plan → asset, rôle, rétention ; les voix (`voix: true`) avec leur réplique ;
 * - `retourVisionnage` (obligatoire), `historique` ;
 * - `planche` : un DESCRIPTEUR du rendu (job, chemin relatif à MEDIA_ROOT, plafond de vignettes). Les images ne
 *   sont JAMAIS stockées dans agent_runs.entree : le worker reconstruit la planche à l'exécution
 *   (worker/agents/preparation.ts), mesure la durée réelle (ffprobe) et remplace `planche` par `rendu`.
 *   La planche n'est JAMAIS automatique (décision 2026-10-12) : sans `avecPlanche`, le descripteur est absent, l'entrée porte
 *   `sansPlanche: true` et l'agent travaille depuis la consigne et la fiche actuelle (ni `rendu` ni durée mesurée). */
export async function entreeIterationPlan(
  db: Db,
  projectId: number,
  planUuid: string,
  retourVisionnage: string,
  /** Fiche de plan « table de montage » : l'essai (job) que l'agent doit regarder, quand ce n'est pas le dernier. */
  renduId?: number | null,
  /** Joindre la planche de vignettes du rendu (ffprobe + ffmpeg à l'exécution) : « Montrer au chef opérateur » ou « Analyser ». */
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

  // Les voisins, pour le RACCORD (lecture seule) : intention et fin du précédent, intention et début du suivant. Contexte léger : 400 caractères
  // d'intention (la FIN de celle du précédent, le DÉBUT de celle du suivant : c'est là que les plans se touchent) et 450 de shot au plus par voisin.
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
  const libelleType = { picture: "Picture", audio: "Audio", video: "Video" } as const;
  const references = [
    ...refs.map((r) => ({
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
  // Le registre : de quoi AJOUTER une référence (codes existants, jamais inventés) ; sans les voix (les poses composites « keyframe » se citent comme les autres images).
  // `image` : le fichier de l'asset existe (une référence ajoutée sans image ne se compile pas encore).
  const fichiers = new Map(
    (await db.select({ code: assets.code, fichier: assets.fichier }).from(assets).where(eq(assets.projectId, projectId))).map((a) => [a.code, !!a.fichier && existsSync(join(MEDIA_ROOT, cheminAssetMedia(a.fichier)))]),
  );
  const registre = (await registreResume(db, projectId)).map((a) => ({ ...a, image: fichiers.get(a.code) ?? false }));
  // Les réglages Open H3 IR effectifs du plan (plan > scène > projet) et les valeurs permises : l'agent règle la caméra et le rythme par eux, pas par du texte.
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

// --- inventaire des assets -----------------------------------------------------

/** Entrée d'`inventaire-assets` : TOUS les plans du projet (titre et intention, par scène et par épisode), le registre
 * actuel et le brief. Un seul appel pour le projet : c'est la vue d'ensemble qui évite les doublons entre plans.
 * `null` si le projet n'a aucun plan écrit. */
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
  // Chaque plan reçoit une poignée (« P07 », dans l'ordre de lecture de l'entrée) que le modèle cite dans `references` ; la poignée → uuid reste
  // dans les options de la tâche (`planUuids`), jamais montrée (lib/agents/inventaire.ts).
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
