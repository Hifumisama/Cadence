import { and, asc, count, desc, eq, gt, inArray, isNotNull, lt } from "drizzle-orm";
import { agentRuns, assets, briefs, episodes, jobs, planDialogues, planPromptSections, planRefs, plans, projects, propositionChangements, propositions, repliques, scenes, seasons, voixFiches } from "../../db/schema";
import { horsAffiches } from "../assets-visibles";
import { variantePromptAsset } from "../llm/variantes";
import { WORKFLOW_IMPORT_MANUEL } from "../plan-checks";
import { ORDRE_SECTIONS } from "../prompt";
import type { Db } from "./applicateurs/commun";
import { MAX_VIGNETTES_ITERATION, historiqueIteration } from "./iteration-plan";
import { normaliser } from "./locuteurs";
import type { BriefContenu, ContexteUtilise, EtatIterationPlan, Position } from "./types";
import type { CandidatVoix } from "./voix-casting";

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
  return b ? { contenu: b.contenu as BriefContenu, statut: b.statut } : null;
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
    personnages: brief.personnages,
    lieux: brief.lieux,
    continuite: brief.continuite,
    rimes: brief.rimes,
    progressions: brief.progressions,
    pieges: brief.pieges,
    // Les notes libres du projet (ex-« globaux du scénario ») : ce que l'utilisateur veut qu'on garde en tête.
    ...(brief.notes?.trim() ? { notes: brief.notes.trim() } : {}),
  };
  const contexte: ContexteUtilise[] = [
    { type: "brief", libelle: "Brief · style et clause de style", ref: "style" },
    { type: "brief", libelle: "Brief · arc et ton", ref: "arc" },
    { type: "brief", libelle: `Brief · ${brief.personnages.length} personnage${brief.personnages.length > 1 ? "s" : ""}, ${brief.lieux.length} lieu${brief.lieux.length > 1 ? "x" : ""}`, ref: "personnages" },
    { type: "brief", libelle: "Brief · continuité, rimes, progressions, pièges", ref: "continuite" },
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
  return lignes.filter((a) => a.type !== "sfx" && a.type !== "keyframe").map((a) => ({ code: a.code, type: a.type, description: a.description ?? "" }));
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

  const ctx: ContexteUtilise[] = [
    { type: "asset", libelle: `${asset.code} · description canonique`, ref: asset.code },
    ...(parent ? [{ type: "asset" as const, libelle: `Parent ${parent.code} · description et prompt`, ref: parent.code }] : []),
    ...(famille.length ? [{ type: "registre" as const, libelle: `${famille.length} asset${famille.length > 1 ? "s" : ""} de la même famille` }] : []),
    ...(citations.length ? [{ type: "plan" as const, libelle: `${citations.length} plan${citations.length > 1 ? "s" : ""} qui le citent` }] : []),
    ...(projet?.clauseStyle ? [{ type: "projet" as const, libelle: "Clause de style du projet (information)" }] : []),
    ...contexte,
  ];
  return {
    skill: "prompt-asset",
    variante: variantePromptAsset({ type: asset.type, methodeGeneration: asset.methodeGeneration }),
    contexte: ctx,
    entree: {
      asset: { code: asset.code, type: asset.type, descriptionCanonique: asset.description ?? "", critique: asset.critique, methodeGeneration: asset.methodeGeneration, promptActuel: asset.promptGeneration ?? "" },
      parent: parent ? { code: parent.code, description: parent.description ?? "", promptGeneration: parent.promptGeneration ?? "" } : null,
      plansQuiLeCitent: citations.map((c) => ({ titre: c.titre, role: c.role ?? "", description: c.description ?? "" })),
      clauseStyleDuProjet: projet?.clauseStyle ?? "",
      memeFamille: famille.map((f) => ({ code: f.code, description: f.description ?? "" })),
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
  return {
    skill: "prompt-asset",
    variante: "generation",
    contexte: [
      { type: "asset", libelle: `${cand.code} · description issue du brief`, ref: cand.code },
      ...(projet?.clauseStyle ? [{ type: "projet" as const, libelle: "Clause de style du projet (information)" }] : []),
      ...contexte,
    ],
    entree: {
      asset: { code: cand.code, type: cand.type, descriptionCanonique: cand.description, critique: false, methodeGeneration: "generation", promptActuel: "" },
      parent: null,
      plansQuiLeCitent: [],
      clauseStyleDuProjet: projet?.clauseStyle ?? "",
      memeFamille: [],
      briefExtrait: extrait,
      consigne,
      ...(retour ? { retourUtilisateur: retour } : {}),
    },
  };
}

/** L'entrée de `prompt-voix` pour une voix du CASTING (étape « casting des voix ») : le personnage (ou la
 * voix off), ce que le brief en dit, quelques-unes de ses répliques (elles disent la prosodie attendue) et
 * les voix déjà au casting (pour que la nouvelle s'en distingue). */
export async function entreePromptVoixCandidat(db: Db, projectId: number, cand: CandidatVoix, consigne: string, retour?: string): Promise<EntreeSkill> {
  const brief = await lireBriefDuProjet(db, projectId);
  const { extrait, contexte } = extraitsBrief(brief?.contenu ?? null);
  const nomCandidat = normaliser(cand.nom);
  const duBrief = (brief?.contenu.personnages ?? []).find((p) => normaliser(p.nom ?? "") === nomCandidat);
  const deja = await db
    .select({ code: assets.code, instruction: assets.promptGeneration, description: assets.description, personnageId: voixFiches.personnageId })
    .from(assets)
    .innerJoin(voixFiches, eq(voixFiches.assetId, assets.id))
    .where(eq(assets.projectId, projectId))
    .orderBy(asc(assets.code));
  return {
    skill: "prompt-voix",
    contexte: [
      { type: "asset", libelle: `${cand.codeVoix} · ${cand.personnageCode ? `voix de ${cand.personnageCode}` : "voix off"}`, ref: cand.codeVoix },
      ...(cand.nbRepliques ? [{ type: "plan" as const, libelle: `${cand.nbRepliques} réplique${cand.nbRepliques > 1 ? "s" : ""} de cette voix` }] : []),
      ...(deja.length ? [{ type: "voix" as const, libelle: `${deja.length} voix déjà au casting (pour s'en distinguer)` }] : []),
      ...contexte,
    ],
    entree: {
      voix: {
        code: cand.codeVoix,
        personnage: cand.personnageCode ? { code: cand.personnageCode, descriptionCanonique: cand.description } : null,
        role: cand.personnageCode ? "" : "voix off",
      },
      impressionVocaleDuBrief: duBrief?.voix ?? "",
      langueDesDialogues: brief?.contenu.langueDialogues ?? "",
      repliquesDeLaVoix: cand.exemples,
      voixDejaAuCasting: deja.map((v) => ({ code: v.code, instruction: v.instruction ?? "", description: v.description ?? "" })),
      briefExtrait: extrait,
      consigne,
      ...(retour ? { retourUtilisateur: retour } : {}),
    },
  };
}

// --- épisode, plan ----------------------------------------------------------

type PlanLu = { uuid: string; titre: string; description: string; dureeGenerationSecondes: number; sceneId: number | null };

async function plansDe(db: Db, episodeId: number): Promise<PlanLu[]> {
  const l = await db
    .select({ uuid: plans.uuid, titre: plans.titre, description: plans.description, duree: plans.dureeGenerationSecondes, sceneId: plans.sceneId })
    .from(plans)
    .where(eq(plans.episodeId, episodeId))
    .orderBy(asc(plans.ordre), asc(plans.id));
  return l.map((p) => ({ uuid: p.uuid, titre: p.titre, description: p.description ?? "", dureeGenerationSecondes: p.duree, sceneId: p.sceneId }));
}

async function contexteEpisode(db: Db, projectId: number, episodeId: number) {
  const [ep] = await db
    .select({ id: episodes.id, titre: episodes.titre, resume: episodes.resume, numero: episodes.numero, seasonId: episodes.seasonId })
    .from(episodes)
    .innerJoin(seasons, eq(seasons.id, episodes.seasonId))
    .where(and(eq(episodes.id, episodeId), eq(seasons.projectId, projectId)));
  if (!ep) return null;
  const precedents = await db
    .select({ titre: episodes.titre, resume: episodes.resume })
    .from(episodes)
    .where(and(eq(episodes.seasonId, ep.seasonId), lt(episodes.numero, ep.numero)))
    .orderBy(asc(episodes.numero));
  const suivants = await db
    .select({ titre: episodes.titre, resume: episodes.resume })
    .from(episodes)
    .where(and(eq(episodes.seasonId, ep.seasonId), gt(episodes.numero, ep.numero)))
    .orderBy(asc(episodes.numero));
  const lesScenes = await db.select({ id: scenes.id, titre: scenes.titre, fonction: scenes.fonction }).from(scenes).where(eq(scenes.episodeId, ep.id)).orderBy(asc(scenes.ordre));
  const lesPlans = await plansDe(db, ep.id);
  const brief = await lireBriefDuProjet(db, projectId);
  const { extrait, contexte } = extraitsBrief(brief?.contenu ?? null);
  const registre = await registreResume(db, projectId);
  return { ep, precedents, suivants, brief: brief?.contenu ?? null, lesScenes, lesPlans, extrait, contexteBrief: contexte, registre };
}

/** L'entrée du brief qui correspond à cet épisode : même titre (insensible à la casse), sinon même rang. */
export function briefDeEpisode(brief: BriefContenu | null, titre: string, numero: number): { titre: string; resume: string; portee?: string } | null {
  if (!brief?.episodes?.length) return null;
  const n = (s: string) => s.trim().toLowerCase();
  return brief.episodes.find((e) => n(e.titre) === n(titre)) ?? brief.episodes[numero - 1] ?? null;
}

export async function entreeScenarioEpisode(
  db: Db,
  projectId: number,
  episodeId: number,
  consigne: string,
  options: { position?: Position; retour?: string } = {},
): Promise<(EntreeSkill & { sceneVoisineId: number | null }) | null> {
  const c = await contexteEpisode(db, projectId, episodeId);
  if (!c) return null;
  const insertion = options.position != null;
  let voisinAvant: PlanLu | null = null;
  let voisinApres: PlanLu | null = null;
  if (options.position) {
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
    { type: "registre", libelle: `Registre : ${c.registre.length} asset${c.registre.length > 1 ? "s" : ""} (noms existants)` },
    ...c.contexteBrief,
  ];
  return {
    skill: "scenario-episode",
    contexte,
    sceneVoisineId: voisinAvant?.sceneId ?? voisinApres?.sceneId ?? null,
    entree: {
      portee: insertion ? { type: "plan-a-inserer", instruction: "Ne propose QU'UN SEUL plan (une seule scène, un seul plan) : le plan à insérer." } : { type: "episode" },
      episode: { titre: c.ep.titre, resume: c.ep.resume },
      // L'arc de CET épisode tel que le brief le pose (même titre, ou même rang à défaut).
      briefEpisode: briefDeEpisode(c.brief, c.ep.titre, c.ep.numero),
      resumesEpisodesPrecedents: c.precedents,
      resumesEpisodesSuivants: c.suivants,
      scenesExistantes: c.lesScenes,
      plansExistants: c.lesPlans.map((p) => ({ titre: p.titre, description: p.description, dureeSecondes: p.dureeGenerationSecondes })),
      ...(insertion ? { planPrecedent: voisinAvant, planSuivant: voisinApres } : {}),
      registre: c.registre,
      briefExtrait: c.extrait,
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
      planACorriger: { titre: p.titre, description: p.description ?? "", dureeSecondes: p.duree },
      plansVoisins: c.lesPlans.filter((x) => x.uuid !== p.uuid).map((x) => ({ titre: x.titre, description: x.description })),
      registre: c.registre,
      briefExtrait: c.extrait,
      consigne,
      ...(retour ? { retourUtilisateur: retour } : {}),
    },
  };
}

/** L'entrée de `plan-h3` pour UN plan (étape 3 : la fiche de plan). Assemblée par l'application, jamais
 * devinée (voir agents/skills/plan-h3/regles.md, « Ce que tu reçois ») :
 * - `plan` : titre, intention (la description narrative, une ou deux phrases), position dans la scène,
 *   durée visée et fps ;
 * - `scene` (titre, fonction, et les intentions de TOUS ses plans dans l'ordre, `cePlan` marquant celui qu'on
 *   écrit : c'est le seul « texte » de la scène), `episode` : de quoi situer le plan ;
 * - `plansVoisins` : le précédent et le suivant (pour le raccord), titre et description ;
 * - `registre` : pour chaque asset candidat (hors voix, sons et plans clés) son code, sa description
 *   canonique (français), sa méthode, son prompt de génération (anglais) et s'il a déjà son fichier
 *   (image, ou son pour un bruitage) ; hors voix et plans clés (les voix se dérivent des répliques) ;
 * - `repliques` : celles du plan (uuid, locuteur, texte exact, durée mesurée si la prise existe) ;
 * - `clauseStyleDuProjet`, `briefExtrait` : le style visuel, la continuité, les rimes, les pièges. */
export async function entreePlanH3(
  db: Db,
  projectId: number,
  planUuid: string,
  consigne: string,
  retour?: string,
): Promise<(EntreeSkill & { plan: { id: number; uuid: string; titre: string; episodeId: number } }) | null> {
  const [p] = await db
    .select()
    .from(plans)
    .where(and(eq(plans.uuid, planUuid), eq(plans.projectId, projectId)));
  if (!p) return null;
  const c = await contexteEpisode(db, projectId, p.episodeId);
  if (!c) return null;
  const [scene] = p.sceneId == null ? [] : await db.select({ titre: scenes.titre, fonction: scenes.fonction }).from(scenes).where(eq(scenes.id, p.sceneId));
  const [projet] = await db.select({ clauseStyle: projects.clauseStyle }).from(projects).where(eq(projects.id, projectId));

  const dansLaScene = c.lesPlans.filter((x) => x.sceneId === p.sceneId);
  const rang = Math.max(0, dansLaScene.findIndex((x) => x.uuid === p.uuid));
  const i = c.lesPlans.findIndex((x) => x.uuid === p.uuid);
  const voisin = (x: { titre: string; description: string; dureeGenerationSecondes: number | null } | undefined) =>
    x ? { titre: x.titre, description: x.description, dureeSecondes: x.dureeGenerationSecondes } : null;

  const registre = await db
    .select({
      code: assets.code,
      type: assets.type,
      description: assets.description,
      methode: assets.methodeGeneration,
      prompt: assets.promptGeneration,
      fichier: assets.fichier,
    })
    .from(assets)
    .where(and(eq(assets.projectId, projectId), horsAffiches))
    .orderBy(asc(assets.code));
  const candidats = registre
    .filter((a) => a.type !== "voix" && a.type !== "keyframe")
    .map((a) => ({
      code: a.code,
      type: a.type,
      descriptionCanonique: a.description ?? "",
      methode: a.methode ?? "generation",
      promptGeneration: a.prompt ?? "",
      aUnFichier: !!a.fichier,
    }));

  const dialogues = await db
    .select({
      uuid: repliques.uuid,
      locuteurTexte: repliques.locuteurTexte,
      locuteurCode: assets.code,
      texte: repliques.texte,
      dureeSecondes: repliques.dureeSecondes,
      slot: planDialogues.slot,
    })
    .from(planDialogues)
    .innerJoin(repliques, eq(repliques.id, planDialogues.repliqueId))
    .leftJoin(assets, eq(assets.id, repliques.locuteurId))
    .where(eq(planDialogues.planId, p.id))
    .orderBy(asc(planDialogues.slot));

  const contexte: ContexteUtilise[] = [
    { type: "plan", libelle: `Plan · ${p.titre}`, ref: p.uuid },
    { type: "episode", libelle: `Épisode ${c.ep.numero} · ${c.ep.titre}`, ref: String(c.ep.id) },
    { type: "registre", libelle: `Registre : ${candidats.length} asset${candidats.length > 1 ? "s" : ""} candidat${candidats.length > 1 ? "s" : ""}` },
    ...(dialogues.length ? [{ type: "plan" as const, libelle: `${dialogues.length} réplique${dialogues.length > 1 ? "s" : ""} du plan` }] : []),
    ...(projet?.clauseStyle ? [{ type: "projet" as const, libelle: "Clause de style du projet" }] : []),
    ...c.contexteBrief,
  ];
  return {
    skill: "plan-h3",
    contexte,
    plan: { id: p.id, uuid: p.uuid, titre: p.titre, episodeId: p.episodeId },
    entree: {
      plan: {
        titre: p.titre,
        intention: p.description ?? "",
        positionDansLaScene: dansLaScene.length > 0 ? `${rang + 1}/${dansLaScene.length}` : "",
        dureeViseeSecondes: p.dureeGenerationSecondes,
        fps: p.fps,
      },
      // La scène n'a pas de texte narratif en base : son contenu, ce sont les intentions de ses plans, dans l'ordre.
      scene: scene
        ? {
            titre: scene.titre,
            fonction: scene.fonction ?? "",
            plans: dansLaScene.map((x, k) => ({
              position: k + 1,
              titre: x.titre,
              intention: (x.description ?? "").trim().slice(0, 400),
              ...(x.uuid === p.uuid ? { cePlan: true } : {}),
            })),
          }
        : null,
      episode: { titre: c.ep.titre, resume: c.ep.resume },
      plansVoisins: { precedent: voisin(c.lesPlans[i - 1]), suivant: voisin(c.lesPlans[i + 1]) },
      registre: candidats,
      repliques: dialogues.map((d) => ({
        repliqueId: d.uuid,
        locuteur: d.locuteurCode ?? d.locuteurTexte ?? "",
        texte: d.texte,
        ...(d.dureeSecondes != null ? { dureeMesureeSecondes: d.dureeSecondes } : {}),
      })),
      clauseStyleDuProjet: projet?.clauseStyle ?? "",
      briefExtrait: c.extrait,
      consigne,
      ...(retour ? { retourUtilisateur: retour } : {}),
    },
  };
}

/** Le dernier rendu TERMINÉ d'un plan (généré ou importé) dont le fichier est connu, ou null. */
export async function dernierRendu(db: Db, planId: number) {
  const [j] = await db
    .select({ id: jobs.id, cheminSortie: jobs.cheminSortie, finishedAt: jobs.finishedAt, createdAt: jobs.createdAt, workflowFichier: jobs.workflowFichier })
    .from(jobs)
    .where(and(eq(jobs.planId, planId), eq(jobs.statut, "termine"), isNotNull(jobs.cheminSortie)))
    .orderBy(desc(jobs.createdAt), desc(jobs.id))
    .limit(1);
  return j ?? null;
}

/** L'historique des corrections après visionnage déjà tentées sur ce plan (voir `historiqueIteration`). */
async function historiqueDuPlan(db: Db, projectId: number, planId: number) {
  const props = await db
    .select({ id: propositions.id, createdAt: propositions.createdAt, appliedAt: propositions.appliedAt, statut: propositions.statut, consigne: propositions.consigne, resultat: agentRuns.resultat })
    .from(propositions)
    .leftJoin(agentRuns, eq(agentRuns.id, propositions.runId))
    .where(and(eq(propositions.projectId, projectId), eq(propositions.skill, "iteration-plan"), eq(propositions.portee, "plan"), eq(propositions.cibleId, planId)));
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

/** Ce que la fenêtre « Corriger après visionnage » montre avant de lancer. */
export async function etatIterationPlan(db: Db, projectId: number, planUuid: string): Promise<EtatIterationPlan | null> {
  const [p] = await db
    .select({ id: plans.id, titre: plans.titre, duree: plans.dureeGenerationSecondes })
    .from(plans)
    .where(and(eq(plans.uuid, planUuid), eq(plans.projectId, projectId)));
  if (!p) return null;
  const [remplies, rendu, historique] = await Promise.all([
    db.select({ contenu: planPromptSections.contenu }).from(planPromptSections).where(eq(planPromptSections.planId, p.id)),
    dernierRendu(db, p.id),
    historiqueDuPlan(db, projectId, p.id),
  ]);
  return {
    titre: p.titre,
    aUneFiche: remplies.some((s) => s.contenu.trim().length > 0),
    rendu: rendu
      ? { termineLe: (rendu.finishedAt ?? rendu.createdAt)?.toISOString() ?? null, importe: rendu.workflowFichier === WORKFLOW_IMPORT_MANUEL, dureeVoulueSecondes: p.duree }
      : null,
    nbCorrections: historique.length,
    nbCorrectionsAppliquees: historique.filter((h) => h.issue === "appliquee").length,
  };
}

/** L'entrée d'`iteration-plan` pour UN plan qui a un rendu (routage par état du plan, 2026-10-02 : sans rendu, pas
 * de correction à l'aveugle). Voir agents/skills/iteration-plan/regles.md, « Ce que tu reçois » :
 * - `plan` (titre, intention, durée voulue, fps), `promptActuel` (les six sections STOCKÉES, labels compris) ;
 * - `references` : chaque label du plan → asset, rôle, rétention ; les voix (`voix: true`) avec leur réplique ;
 * - `repliques` (texte exact, slot, durée mesurée), `retourVisionnage` (obligatoire), `historique` ;
 * - `planche` : un DESCRIPTEUR du rendu (job, chemin relatif à MEDIA_ROOT, plafond de vignettes). Les images ne
 *   sont JAMAIS stockées dans agent_runs.entree : le worker reconstruit la planche à l'exécution
 *   (worker/agents/preparation.ts), mesure la durée réelle (ffprobe) et remplace `planche` par `rendu`. */
export async function entreeIterationPlan(
  db: Db,
  projectId: number,
  planUuid: string,
  retourVisionnage: string,
): Promise<(EntreeSkill & { plan: { id: number; uuid: string; titre: string } }) | { erreur: string }> {
  const [p] = await db.select().from(plans).where(and(eq(plans.uuid, planUuid), eq(plans.projectId, projectId)));
  if (!p) return { erreur: "Plan introuvable dans ce projet." };
  const rendu = await dernierRendu(db, p.id);
  if (!rendu?.cheminSortie) return { erreur: "Ce plan n'a pas encore de rendu terminé : on ne corrige pas un prompt à l'aveugle. Génère (ou importe) le plan, regarde-le, puis reviens." };
  const lignes = await db.select({ section: planPromptSections.section, contenu: planPromptSections.contenu }).from(planPromptSections).where(eq(planPromptSections.planId, p.id));
  const sections: Record<string, string> = {};
  for (const l of lignes) sections[l.section] = sections[l.section] ? `${sections[l.section]}\n${l.contenu}` : l.contenu;
  if (!Object.values(sections).some((s) => s.trim())) return { erreur: "Ce plan n'a pas de fiche (prompt vide) : écris-la d'abord (« Écrire la fiche »)." };

  const [refs, dialogues, historique] = await Promise.all([
    db
      .select({ type: planRefs.type, slot: planRefs.slot, role: planRefs.role, retention: planRefs.retention, code: assets.code, typeAsset: assets.type })
      .from(planRefs)
      .leftJoin(assets, eq(assets.id, planRefs.assetId))
      .where(eq(planRefs.planId, p.id))
      .orderBy(asc(planRefs.type), asc(planRefs.slot)),
    db
      .select({ slot: planDialogues.slot, texte: repliques.texte, locuteurTexte: repliques.locuteurTexte, locuteurCode: assets.code, dureeSecondes: repliques.dureeSecondes })
      .from(planDialogues)
      .innerJoin(repliques, eq(repliques.id, planDialogues.repliqueId))
      .leftJoin(assets, eq(assets.id, repliques.locuteurId))
      .where(eq(planDialogues.planId, p.id))
      .orderBy(asc(planDialogues.slot)),
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
    ...dialogues.map((d) => ({
      label: `<Audio ${d.slot}>`,
      type: "audio" as const,
      slot: d.slot,
      voix: true,
      replique: d.texte,
      locuteur: d.locuteurCode ?? d.locuteurTexte ?? "",
    })),
  ];
  const importe = rendu.workflowFichier === WORKFLOW_IMPORT_MANUEL;
  // Le registre : de quoi AJOUTER une référence (codes existants, jamais inventés) ; sans les voix ni les images clés.
  const registre = (await registreResume(db, projectId)).filter((a) => a.type !== "voix");
  const contexte: ContexteUtilise[] = [
    { type: "plan", libelle: `Plan · ${p.titre} · prompt actuel (six sections)`, ref: p.uuid },
    { type: "registre", libelle: `Registre : ${registre.length} asset${registre.length > 1 ? "s" : ""} à citer en référence` },
    { type: "plan", libelle: `Rendu ${importe ? "importé" : "généré"} du ${(rendu.finishedAt ?? rendu.createdAt).toLocaleString("fr-FR")} · planche de vignettes (une par seconde), extraite à l'exécution` },
    { type: "registre", libelle: `${refs.length} référence${refs.length > 1 ? "s" : ""} du plan` },
    ...(dialogues.length ? [{ type: "plan" as const, libelle: `${dialogues.length} réplique${dialogues.length > 1 ? "s" : ""} liée${dialogues.length > 1 ? "s" : ""}` }] : []),
    ...(historique.length ? [{ type: "plan" as const, libelle: `${historique.length} correction${historique.length > 1 ? "s" : ""} déjà tentée${historique.length > 1 ? "s" : ""} sur ce plan` }] : []),
  ];
  return {
    skill: "iteration-plan",
    contexte,
    plan: { id: p.id, uuid: p.uuid, titre: p.titre },
    entree: {
      plan: { titre: p.titre, intention: p.description ?? "", dureeVoulueSecondes: p.dureeGenerationSecondes, fps: p.fps },
      promptActuel: Object.fromEntries(ORDRE_SECTIONS.map((s) => [s, sections[s] ?? ""])),
      references,
      registre,
      repliques: dialogues.map((d) => ({
        locuteur: d.locuteurCode ?? d.locuteurTexte ?? "",
        texte: d.texte,
        slotAudio: d.slot,
        ...(d.dureeSecondes != null ? { dureeMesureeSecondes: d.dureeSecondes } : {}),
      })),
      retourVisionnage,
      historique,
      planche: { jobId: rendu.id, cheminSortie: rendu.cheminSortie, maxVignettes: MAX_VIGNETTES_ITERATION, importe },
    },
  };
}

/** « Contexte utilisé » d'une portée, sans lancer de génération (aperçu avant lancement). */
export async function apercuContexteDe(db: Db, projectId: number, portee: string, cibleId: number | null): Promise<ContexteUtilise[]> {
  if (portee === "asset" && cibleId != null) return (await entreePromptAsset(db, projectId, cibleId, ""))?.contexte ?? [];
  if (portee === "episode" && cibleId != null) return (await entreeScenarioEpisode(db, projectId, cibleId, ""))?.contexte ?? [];
  if (portee === "plan" && cibleId != null) {
    const [p] = await db.select({ uuid: plans.uuid }).from(plans).where(inArray(plans.id, [cibleId]));
    return p ? ((await entreeCorrectionPlan(db, projectId, p.uuid, ""))?.contexte ?? []) : [];
  }
  const brief = await lireBriefDuProjet(db, projectId);
  return extraitsBrief(brief?.contenu ?? null).contexte;
}

// --- inventaire des assets -----------------------------------------------------

/** Entrée d'`inventaire-assets` : TOUS les plans du projet (titre et intention, par scène et par épisode), le registre
 * actuel et le brief. Un seul appel pour le projet : c'est la vue d'ensemble qui évite les doublons entre plans.
 * `null` si le projet n'a aucun plan écrit. */
export async function entreeInventaire(db: Db, projectId: number, consigne: string, retour?: string): Promise<(EntreeSkill & { nbPlans: number }) | null> {
  const eps = await db
    .select({ id: episodes.id, numero: episodes.numero, titre: episodes.titre, resume: episodes.resume, saison: seasons.numero })
    .from(episodes)
    .innerJoin(seasons, eq(seasons.id, episodes.seasonId))
    .where(eq(seasons.projectId, projectId))
    .orderBy(asc(seasons.numero), asc(episodes.numero));
  if (eps.length === 0) return null;
  const ids = eps.map((e) => e.id);
  const lesScenes = await db.select({ id: scenes.id, episodeId: scenes.episodeId, titre: scenes.titre, fonction: scenes.fonction }).from(scenes).where(inArray(scenes.episodeId, ids)).orderBy(asc(scenes.ordre), asc(scenes.id));
  const lesPlans = await db
    .select({ episodeId: plans.episodeId, sceneId: plans.sceneId, titre: plans.titre, description: plans.description })
    .from(plans)
    .where(inArray(plans.episodeId, ids))
    .orderBy(asc(plans.ordre), asc(plans.id));
  if (lesPlans.length === 0) return null;

  const registre = (await registreResume(db, projectId)).filter((a) => a.type !== "voix");
  const lireBrief = await lireBriefDuProjet(db, projectId);
  const { extrait, contexte: contexteBrief } = extraitsBrief(lireBrief?.contenu ?? null);
  const [projet] = await db.select({ clauseStyle: projects.clauseStyle }).from(projects).where(eq(projects.id, projectId));

  const episodesEntree = eps.map((e) => {
    const sc = lesScenes.filter((s) => s.episodeId === e.id);
    const duPlan = lesPlans.filter((p) => p.episodeId === e.id);
    const plansDe = (sceneId: number | null) => duPlan.filter((p) => p.sceneId === sceneId).map((p) => ({ titre: p.titre, intention: (p.description ?? "").trim().slice(0, 400) }));
    const orphelins = plansDe(null);
    return {
      episode: `Épisode ${e.numero} · ${e.titre}`,
      resume: e.resume,
      scenes: [
        ...sc.map((s) => ({ titre: s.titre, fonction: s.fonction ?? "", plans: plansDe(s.id) })),
        ...(orphelins.length ? [{ titre: "(hors scène)", fonction: "", plans: orphelins }] : []),
      ],
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
