import type { EpisodePourScenario, Resultat } from "./types";
import { db } from "../../db";
import { episodes, plans, scenes, propositions, assets } from "../../db/schema";
import { eq, asc, count, inArray, and } from "drizzle-orm";
import { lireBriefDuProjet, entreeScenarioScene, entreeScenarioEpisode, entreeTraitement, entreeRelecture, type EntreeSkill, entreePromptAssetCandidat, entreeInventaire } from "./context";
import { cleSousTacheScene, cleSousTacheEpisode } from "./batches-pure";
import { creerRun } from "./runs";
import { SEUIL_TRAITEMENT_SECONDES } from "./treatment";
import { type CandidatRegistre, candidatsRegistre, cleSousTacheAsset } from "./registry";
import { horsAffiches } from "../assets/assets-visible";
import { decouperInventaire, budgetInventaire, type OptionsRunInventaire, cleSousTacheInventaire } from "./inventory";
import { contexteTotalDepuisEnv } from "../llm/budget-context";
import { chargerSkill } from "../llm/skills";
import { conversationParUuid } from "./service-conversation";
import { CONSIGNE_INVENTAIRE, CONSIGNE_REGISTRE, CONSIGNE_RELECTURE, CONSIGNE_SCENARIO, CONSIGNE_TRAITEMENT, ERR, refusSiTacheActive } from "./service-shared";
import { nouvelleProposition } from "./service-proposals";

/** A project's episodes that can be offered for writing their screenplay, in order,
 * with what they already contain: "vide" = neither clip nor scene (the skeleton just applied). */
async function episodesPourScenarios(projectId: number): Promise<EpisodePourScenario[]> {
  const lignes = await db
    .select({ id: episodes.id, numero: episodes.numero, titre: episodes.titre })
    .from(episodes)
    .where(eq(episodes.projectId, projectId))
    .orderBy(asc(episodes.numero));
  if (lignes.length === 0) return [];
  const ids = lignes.map((l) => l.id);
  const parPlans = new Map((await db.select({ id: plans.episodeId, n: count() }).from(plans).where(inArray(plans.episodeId, ids)).groupBy(plans.episodeId)).map((r) => [r.id, Number(r.n)]));
  const parScenes = new Map((await db.select({ id: scenes.episodeId, n: count() }).from(scenes).where(inArray(scenes.episodeId, ids)).groupBy(scenes.episodeId)).map((r) => [r.id, Number(r.n)]));
  return lignes.map((l) => {
    const nbPlans = parPlans.get(l.id) ?? 0;
    const nbScenes = parScenes.get(l.id) ?? 0;
    return { id: l.id, numero: l.numero, titre: l.titre, vide: nbPlans === 0 && nbScenes === 0, nbPlans, nbScenes };
  });
}

/** "Écrire les scénarios" from the project: a BATCH proposal, one subtask
 * (a `scenario-episode` task) per chosen episode, run one after the other in the queue. By
 * default, the EMPTY episodes; `episodeIds` chooses (and allows rewriting an episode that has
 * content: its changes then go into an overwrite section, unticked). An isolated failure does not
 * lose the rest (re-runnable). */
export async function genererScenarios(
  conversationUuid: string,
  options: { episodeIds?: number[]; consigne?: string } = {},
): Promise<Resultat<{ propositionUuid: string; nbSousTaches: number }>> {
  const conv = await conversationParUuid(conversationUuid);
  if (!conv) return ERR("Conversation introuvable.");
  if (conv.portee !== "projet") return ERR("Écrire les scénarios se demande depuis le projet ; pour un seul épisode, ouvre-le.");
  { const refus = await refusSiTacheActive(conv.id, "Une tâche de l'agent est déjà en cours sur cette conversation."); if (refus) return refus; }
  const brief = await lireBriefDuProjet(db, conv.projectId);
  if (!brief || brief.statut === "partiel") return ERR("Écris d'abord le brief du projet : l'agent s'appuie dessus pour chaque épisode.");

  const dispo = await episodesPourScenarios(conv.projectId);
  if (dispo.length === 0) return ERR("Ce projet n'a pas encore d'épisode : applique d'abord le squelette.");
  // By default: the empty episodes, and those whose treatment is waiting for its scenes (created by the "traitement" step, without clips).
  const voulus = options.episodeIds ?? (await Promise.all(dispo.map(async (e) => (e.vide || (await scenesATraiter(e.id)).length > 0 ? e.id : null)))).filter((id): id is number => id != null);
  if (voulus.length === 0) return ERR("Tous les épisodes ont déjà du contenu : choisis ceux à (ré)écrire.");
  const choisis = dispo.filter((e) => voulus.includes(e.id));
  if (choisis.length !== new Set(voulus).size) return ERR("Un des épisodes choisis n'est pas dans cette portée.");

  const consigne = (options.consigne ?? "").trim() || CONSIGNE_SCENARIO;
  // An episode whose treatment is written (scenes, each with its treatment, no clip) is written SCENE BY SCENE: one subtask per scene,
  // in parallel. The others are written in one piece, as before.
  type SousTache = { cle: string; libelle: string; skill: "scenario-episode" | "scenario-scene"; entree: object };
  const sousTaches: SousTache[] = [];
  for (const e of choisis) {
    const lesScenes = await scenesATraiter(e.id);
    if (lesScenes.length > 0) {
      for (const sc of lesScenes) {
        const entree = await entreeScenarioScene(db, conv.projectId, sc.id, consigne);
        if (entree) sousTaches.push({ cle: cleSousTacheScene(sc.id), libelle: `Scène ${sc.rang} · ${sc.titre}`, skill: "scenario-scene", entree: entree.entree });
      }
      continue;
    }
    const entree = await entreeScenarioEpisode(db, conv.projectId, e.id, consigne);
    if (entree) sousTaches.push({ cle: cleSousTacheEpisode(e.id), libelle: `Épisode ${e.numero} · ${e.titre}`, skill: "scenario-episode", entree: entree.entree });
  }
  if (sousTaches.length === 0) return ERR("Aucun épisode lisible.");

  const nbScenes = sousTaches.filter((t) => t.skill === "scenario-scene").length;
  const contexte = [
    { type: "brief" as const, libelle: `Brief du projet (${brief.statut})`, ref: "*" },
    { type: "episode" as const, libelle: nbScenes > 0 ? `${nbScenes} scène${nbScenes > 1 ? "s" : ""} à écrire, en parallèle` : `${sousTaches.length} épisode${sousTaches.length > 1 ? "s" : ""} à écrire, un par un` },
  ];
  const propId = await nouvelleProposition(conv, { skill: "scenarios", consigne, contexte, lot: true });
  for (const t of sousTaches) {
    await creerRun(db, {
      skill: t.skill,
      entree: t.entree,
      but: "proposition",
      projectId: conv.projectId,
      conversationId: conv.id,
      propositionId: propId,
      cleSousTache: t.cle,
      libelleSousTache: t.libelle,
    });
  }
  const [prop] = await db.select({ uuid: propositions.uuid }).from(propositions).where(eq(propositions.id, propId));
  return { ok: true, propositionUuid: prop!.uuid, nbSousTaches: sousTaches.length };
}

/** An episode's scenes that have their treatment and no clip yet, in order (rank 1, 2…): to write scene by scene. Empty as soon as a scene has no
 * treatment or one already has clips: the episode is then written in one piece (see `genererScenarios`). */
async function scenesATraiter(episodeId: number): Promise<{ id: number; titre: string; rang: number }[]> {
  const lesScenes = await db
    .select({ id: scenes.id, titre: scenes.titre, traitement: scenes.traitement })
    .from(scenes)
    .where(eq(scenes.episodeId, episodeId))
    .orderBy(asc(scenes.ordre), asc(scenes.id));
  if (lesScenes.length === 0 || lesScenes.some((s) => !s.traitement)) return [];
  const avecPlans = new Set((await db.select({ id: plans.sceneId }).from(plans).where(eq(plans.episodeId, episodeId))).map((r) => r.id));
  if (lesScenes.some((s) => avecPlans.has(s.id))) return [];
  return lesScenes.map((s, i) => ({ id: s.id, titre: s.titre, rang: i + 1 }));
}

/** Step E: an episode's TREATMENT, before its clips. A BATCH of one subtask per episode (a single episode for a film), which creates the scenes with their
 * treatment. Only concerns EMPTY episodes long enough to be worth a split (`SEUIL_TRAITEMENT_SECONDES`): a short film is written in one piece. */
export async function genererTraitements(
  conversationUuid: string,
  options: { consigne?: string } = {},
): Promise<Resultat<{ propositionUuid: string; nbSousTaches: number }>> {
  const conv = await conversationParUuid(conversationUuid);
  if (!conv) return ERR("Conversation introuvable.");
  if (conv.portee !== "projet") return ERR("Le traitement se demande depuis le projet.");
  { const refus = await refusSiTacheActive(conv.id, "Une tâche de l'agent est déjà en cours sur cette conversation."); if (refus) return refus; }
  const brief = await lireBriefDuProjet(db, conv.projectId);
  if (!brief || brief.statut === "partiel") return ERR("Écris d'abord le brief du projet : le traitement s'appuie dessus.");
  const vides = (await episodesPourScenarios(conv.projectId)).filter((e) => e.vide);
  if (vides.length === 0) return ERR("Aucun épisode vide : le traitement ne s'écrit que pour un épisode sans scène ni plan.");
  const consigne = (options.consigne ?? "").trim() || CONSIGNE_TRAITEMENT;
  const sousTaches: { e: EpisodePourScenario; entree: NonNullable<Awaited<ReturnType<typeof entreeTraitement>>> }[] = [];
  for (const e of vides) {
    const entree = await entreeTraitement(db, conv.projectId, e.id, consigne);
    const duree = (entree?.entree as { dureeCibleSecondes?: number } | undefined)?.dureeCibleSecondes ?? 0;
    if (entree && duree >= SEUIL_TRAITEMENT_SECONDES) sousTaches.push({ e, entree });
  }
  if (sousTaches.length === 0) return ERR(`Aucun épisode n'a besoin d'un traitement : il vise moins de ${SEUIL_TRAITEMENT_SECONDES} secondes, son scénario s'écrit d'un seul tenant.`);
  const contexte = [
    { type: "episode" as const, libelle: `${sousTaches.length} épisode${sousTaches.length > 1 ? "s" : ""} à découper en scènes` },
    ...sousTaches[0]!.entree.contexte.filter((c) => c.type === "brief" || c.type === "registre"),
  ];
  const propId = await nouvelleProposition(conv, { skill: "traitements", consigne, contexte, lot: true });
  for (const { e, entree } of sousTaches) {
    await creerRun(db, {
      skill: "traitement-episode",
      entree: entree.entree,
      but: "proposition",
      projectId: conv.projectId,
      conversationId: conv.id,
      propositionId: propId,
      cleSousTache: cleSousTacheEpisode(e.id),
      libelleSousTache: `Épisode ${e.numero} · ${e.titre}`,
    });
  }
  const [prop] = await db.select({ uuid: propositions.uuid }).from(propositions).where(eq(propositions.id, propId));
  return { ok: true, propositionUuid: prop!.uuid, nbSousTaches: sousTaches.length };
}

/** Screenplay review (FRICTIONS 2026-10-19): a model pass that reflects on each WRITTEN episode, after the screenplays and the inventory, BEFORE the
 * clip sheets. A BATCH like the screenplays (one `relecture-scenario` task per episode that has clips): an isolated failure does not lose the rest. The corrections
 * are clip changes (description, link, duration, removal of a duplicate, resolution clip added) to review and apply like any proposal. */
export async function genererRelectures(
  conversationUuid: string,
  options: { episodeIds?: number[]; consigne?: string } = {},
): Promise<Resultat<{ propositionUuid: string; nbSousTaches: number }>> {
  const conv = await conversationParUuid(conversationUuid);
  if (!conv) return ERR("Conversation introuvable.");
  if (conv.portee !== "projet") return ERR("La relecture se demande depuis le projet.");
  { const refus = await refusSiTacheActive(conv.id, "Une tâche de l'agent est déjà en cours sur cette conversation."); if (refus) return refus; }
  const dispo = (await episodesPourScenarios(conv.projectId)).filter((e) => e.nbPlans > 0);
  if (dispo.length === 0) return ERR("Aucun épisode n'a de plan à relire : écris d'abord les scénarios.");
  const choisis = options.episodeIds ? dispo.filter((e) => options.episodeIds!.includes(e.id)) : dispo;
  if (choisis.length === 0) return ERR("Aucun des épisodes choisis n'a de plan à relire.");
  const consigne = (options.consigne ?? "").trim() || CONSIGNE_RELECTURE;
  const sousTaches: { e: EpisodePourScenario; entree: NonNullable<Awaited<ReturnType<typeof entreeRelecture>>> }[] = [];
  for (const e of choisis) {
    const entree = await entreeRelecture(db, conv.projectId, e.id, consigne);
    if (entree) sousTaches.push({ e, entree });
  }
  if (sousTaches.length === 0) return ERR("Aucun épisode lisible.");
  const contexte = [
    { type: "episode" as const, libelle: `${sousTaches.length} épisode${sousTaches.length > 1 ? "s" : ""} à relire, un par un` },
    ...sousTaches[0]!.entree.contexte.filter((c) => c.type === "brief" || c.type === "registre"),
  ];
  const propId = await nouvelleProposition(conv, { skill: "relectures", consigne, contexte, lot: true });
  for (const { e, entree } of sousTaches) {
    await creerRun(db, {
      skill: "relecture-scenario",
      entree: entree.entree,
      options: { planUuids: entree.planUuids },
      but: "proposition",
      projectId: conv.projectId,
      conversationId: conv.id,
      propositionId: propId,
      cleSousTache: cleSousTacheEpisode(e.id),
      libelleSousTache: `Épisode ${e.numero} · ${e.titre}`,
    });
  }
  const [prop] = await db.select({ uuid: propositions.uuid }).from(propositions).where(eq(propositions.id, propId));
  return { ok: true, propositionUuid: prop!.uuid, nbSousTaches: sousTaches.length };
}

/** The masters the brief describes (characters, places), with what already exists in the registry.
 * Empty as long as the project has no written brief. */
export async function candidatsDuProjet(projectId: number): Promise<CandidatRegistre[]> {
  const brief = await lireBriefDuProjet(db, projectId);
  if (!brief || brief.statut === "partiel") return [];
  const existants = await db
    .select({ id: assets.id, code: assets.code, type: assets.type, description: assets.description, promptGeneration: assets.promptGeneration })
    .from(assets)
    .where(and(eq(assets.projectId, projectId), horsAffiches));
  return candidatsRegistre(brief.contenu, existants);
}

/** Step 2: "créer le registre d'assets" — ONE batch of `prompt-asset` subtasks, one per master of the
 * brief (character, place), one after the other. Each subtask creates the asset if it does not exist
 * (brief description + prompt) or writes the prompt of an existing asset. From the project or a
 * season (changes to existing assets only go through the project scope: the lock
 * refuses the rest, with its reason). Voices, props, effects and sounds are NOT created here. */
export async function genererRegistre(
  conversationUuid: string,
  options: { codes?: string[]; consigne?: string } = {},
): Promise<Resultat<{ propositionUuid: string; nbSousTaches: number }>> {
  const conv = await conversationParUuid(conversationUuid);
  if (!conv) return ERR("Conversation introuvable.");
  if (conv.portee !== "projet") return ERR("Le registre se crée depuis le projet : ouvre l'agent sur le projet.");
  { const refus = await refusSiTacheActive(conv.id, "Une tâche de l'agent est déjà en cours sur cette conversation."); if (refus) return refus; }
  const brief = await lireBriefDuProjet(db, conv.projectId);
  if (!brief || brief.statut === "partiel") return ERR("Écris d'abord le brief du projet : le registre en descend (personnages, lieux).");

  const candidats = await candidatsDuProjet(conv.projectId);
  if (candidats.length === 0) return ERR("Le brief ne décrit aucun personnage ni lieu : rien à créer.");
  const voulus = options.codes ?? candidats.filter((c) => c.aTraiter).map((c) => c.code);
  if (voulus.length === 0) return ERR("Tous les assets du brief ont déjà un prompt : choisis ceux à réécrire.");
  const choisis = candidats.filter((c) => voulus.includes(c.code));
  if (choisis.length !== new Set(voulus).size) return ERR("Un des assets choisis n'est plus décrit par le brief.");

  const consigne = (options.consigne ?? "").trim() || CONSIGNE_REGISTRE;
  const sousTaches: { c: CandidatRegistre; e: EntreeSkill }[] = [];
  for (const c of choisis) {
    const e = await entreePromptAssetCandidat(db, conv.projectId, c, consigne);
    if (e) sousTaches.push({ c, e });
  }
  if (sousTaches.length === 0) return ERR("Aucun asset lisible.");

  const contexte = [
    { type: "brief" as const, libelle: `Brief du projet (${brief.statut})`, ref: "*" },
    { type: "registre" as const, libelle: `${sousTaches.length} asset${sousTaches.length > 1 ? "s" : ""} à écrire, un par un` },
    ...sousTaches[0]!.e.contexte.filter((x) => x.type === "brief"),
  ];
  const propId = await nouvelleProposition(conv, { skill: "registre", consigne, contexte, lot: true });
  for (const { c, e } of sousTaches) {
    await creerRun(db, {
      skill: "prompt-asset",
      entree: e.entree,
      but: "proposition",
      projectId: conv.projectId,
      conversationId: conv.id,
      propositionId: propId,
      cleSousTache: cleSousTacheAsset(c.code),
      libelleSousTache: c.libelle,
      options: e.variante ? { variante: e.variante } : null,
    });
  }
  const [prop] = await db.select({ uuid: propositions.uuid }).from(propositions).where(eq(propositions.id, propId));
  return { ok: true, propositionUuid: prop!.uuid, nbSousTaches: sousTaches.length };
}

/** Asset inventory: AFTER the screenplays and the registry from the brief, BEFORE the clip sheets. A single call
 * (`inventaire-assets`) reads all the clips, the registry and the brief, and proposes the missing assets (props,
 * states of a set, effects) as one consolidated list: the sheets then rely on a registry that exists, instead of
 * each inventing its own assets (duplicates). From the PROJECT's conversation; without an image prompt (they are written
 * afterwards, as for the assets created by the sheets). */
export async function genererInventaire(
  conversationUuid: string,
  options: { consigne?: string } = {},
): Promise<Resultat<{ propositionUuid: string; runUuid: string }>> {
  const conv = await conversationParUuid(conversationUuid);
  if (!conv) return ERR("Conversation introuvable.");
  if (conv.portee !== "projet") return ERR("L'inventaire se demande depuis le projet : ouvre l'agent sur le projet.");
  { const refus = await refusSiTacheActive(conv.id, "Une tâche de l'agent est déjà en cours sur cette conversation."); if (refus) return refus; }
  const consigne = (options.consigne ?? "").trim() || CONSIGNE_INVENTAIRE;
  const e = await entreeInventaire(db, conv.projectId, consigne);
  if (!e) return ERR("Aucun plan écrit pour l'instant : écris d'abord les scénarios des épisodes.");
  // The inventory also returns each clip's references (2026-11-09). A single call when everything fits in the budget (common case); a long film
  // is split into consecutive scene groups (lib/agents/inventory.ts, `decouperInventaire`), posted one after the other (each group sees
  // the assets the previous ones propose: worker/agents/postProcessing.ts).
  const groupes = decouperInventaire(e.entree, { budgetJetons: budgetInventaire(contexteTotalDepuisEnv()), jetonsSkill: chargerSkill("inventaire-assets").jetonsEstimes });
  const plansDuGroupe = (ids: string[]) => Object.fromEntries(ids.map((id) => [id, e.planUuids[id]!]));
  const lot = groupes.length > 1;
  const contexte = lot ? [...e.contexte, { type: "projet" as const, libelle: `Film découpé en ${groupes.length} groupes de scènes, lus l'un après l'autre` }] : e.contexte;
  const propId = await nouvelleProposition(conv, { skill: "inventaire-assets", consigne, contexte, lot });
  const [premier, ...suite] = groupes;
  const optionsRun: OptionsRunInventaire = {
    plans: plansDuGroupe(premier!.planIds),
    ...(lot ? { suite: suite.map((g) => ({ cle: cleSousTacheInventaire(g.numero), libelle: g.libelle, entree: g.entree, plans: plansDuGroupe(g.planIds) })) } : {}),
  };
  const run = await creerRun(db, {
    skill: "inventaire-assets",
    entree: premier!.entree,
    options: optionsRun,
    but: "proposition",
    projectId: conv.projectId,
    conversationId: conv.id,
    propositionId: propId,
    ...(lot ? { cleSousTache: cleSousTacheInventaire(1), libelleSousTache: premier!.libelle } : {}),
  });
  if (!lot) await db.update(propositions).set({ runId: run.id }).where(eq(propositions.id, propId));
  const [prop] = await db.select({ uuid: propositions.uuid }).from(propositions).where(eq(propositions.id, propId));
  return { ok: true, propositionUuid: prop!.uuid, runUuid: run.uuid };
}
