import { and, asc, count, eq, inArray, isNull } from "drizzle-orm";
import { horsAffiches } from "../assets/assets-visible";
import { db } from "../../db";
import {
  agentConversations,
  agentRuns,
  assets,
  briefs,
  episodes,
  plans,
  projects,
  propositionChangements,
  propositions,
  scenes,
} from "../../db/schema";
import { valider } from "../llm/validation";

import { contexteTotalDepuisEnv } from "../llm/budget-context";
import { chargerSkill } from "../llm/skills";
import { budgetInventaire, cleSousTacheInventaire, decouperInventaire, groupeInventaireDeCle, type OptionsRunInventaire } from "./inventory";
import { assetsACreer, ecrireReferencesApresApplication } from "./inventory-db";
import { SCHEMA_BRIEF, SECTIONS_FIGEES_PAR_LA_CONCEPTION, estCleSection, sousSchemaSection } from "./brief";
import { creerBriefPartiel, ecrireBrouillon, synchroniserClauseStyle } from "./brief-db";
import { accrocheEntretien } from "./hook";
import { choixActif, formulerReponse, selectionValide } from "./choice";
import { entreeNotes, ficheVersBrief, type Fiche } from "./sheet";
import { lireConception, ouvertureConcue } from "../projects/design-db";
import { ficheCourante } from "./sheet-db";
import type { BriefContenu, CibleDemandee, EpisodePourScenario, MessageConversation, PlaceScene, Portee, Position, Profondeur, Resultat, StatutChamp } from "./types";
import { PORTEES } from "./types";

import { groupeAffiche, raisonNonCochable } from "./checking";
import { TYPE_AFFICHE } from "../posters/posters";
import { entreePromptAffiche } from "./poster";
import { entreeCorrectionPlan, entreeRelecture, entreePromptAsset, entreePromptAssetCandidat, entreeScenarioEpisode, entreeScenarioScene, entreeTraitement, lireBriefDuProjet, type EntreeSkill } from "./context";
import { SEUIL_TRAITEMENT_SECONDES } from "./treatment";
import { DUREE_GENERATION_MAX, DUREE_GENERATION_MIN } from "../clips/clip-checks";
import { candidatsRegistre, cleSousTacheAsset, codeDeCleAsset, type CandidatRegistre } from "./registry";
import { annulerRunsDePropositions, runsDuLot } from "./batches";
import { cleSousTacheEpisode, cleSousTacheScene, dernieresSousTaches, episodeIdDeCle, estRunActif, sceneIdDeCle } from "./batches-pure";
import { appliquerProposition, enregistrerChangements } from "./proposal-db";
import { creerRun, tacheBloquante, type ButRun, type TacheBloquante } from "./runs";
import { squeletteDepuisBrief } from "./skeleton";
import type { Avertissement, ResultatApplication } from "./types";
import { entreeIterationPlan, entreeInventaire, entreeReferencesPlan } from "./context";
import { SKILL_REFERENCES_PLAN } from "./references-clip";
import { SKILL_ASSETS_MANQUANTS, brutsManquants, type ManquantRetenu } from "../h3ir/preparation";
import { ecrireReferencesDuSkill } from "../h3ir/preparation-db";
import { cleSousTachePlan, planUuidDeCle } from "./sheets";
import type { ContexteUtilise, PlanPourFiche } from "./types";
import { SKILL_H3IR, type EntreeH3ir } from "../h3ir/result";
import { preparerDepart } from "../h3ir/retouch";
import { referencesApresDecisions } from "../h3ir/brief-clip";
import { estCreativite, styleCameraOuNull } from "../h3ir/settings";
import type { DecisionsIteration } from "./types";
import { attentesFiches } from "../h3ir/engine-db";
import { jobs, planPromptSections, planRefs } from "../../db/schema";
import { isNotNull, sql } from "drizzle-orm";

/** Server logic of the agent system: conversations, brief, proposals. No dependency on
 * Next (the actions of app/agents/actions.ts are only wrappers): the trial script
 * and the tests call it directly. See app/agents/actions.ts for the contract. */

const ERR = (erreur: string) => ({ ok: false as const, erreur });

/** The refusal "a task is already running": it NAMES the blocking task (and returns it) so the window
 * offers to cancel it, instead of a message with no handle (a task left pending blocks the whole conversation). */
async function refusSiTacheActive(conversationId: number, message: string, buts?: ButRun[]) {
  const t = await tacheBloquante(conversationId, buts);
  if (!t) return null;
  const quoi = `${t.libelle ?? t.skill}, ${t.statut === "en_cours" ? "en cours" : "en attente"}`;
  return { ok: false as const, erreur: `${message} Tâche en cause : ${quoi}.`, bloquante: t as TacheBloquante };
}
const MAX_MESSAGE = 20_000;

// --- targets -----------------------------------------------------------------

export type CibleResolue = { cibleId: number | null; libelle: string };

export async function resoudreCible(projectId: number, portee: Portee, cible: CibleDemandee | null): Promise<CibleResolue | { erreur: string }> {
  if (!PORTEES.includes(portee)) return { erreur: `Portée inconnue : « ${portee} ».` };
  if (portee === "projet") {
    const [p] = await db.select({ nom: projects.nom }).from(projects).where(eq(projects.id, projectId));
    return p ? { cibleId: null, libelle: `Projet · ${p.nom}` } : { erreur: "Projet introuvable." };
  }
  if (!cible) return { erreur: `La portée « ${portee} » demande une cible.` };
  if (portee === "episode" && cible.id != null) {
    const [e] = await db
      .select({ id: episodes.id, numero: episodes.numero, titre: episodes.titre })
      .from(episodes)
      .where(and(eq(episodes.id, cible.id), eq(episodes.projectId, projectId)));
    return e ? { cibleId: e.id, libelle: `Épisode ${e.numero} · ${e.titre}` } : { erreur: "Épisode introuvable dans ce projet." };
  }
  if (portee === "plan" && (cible.uuid || cible.id != null)) {
    const [p] = await db
      .select({ id: plans.id, titre: plans.titre })
      .from(plans)
      .where(and(cible.uuid ? eq(plans.uuid, cible.uuid) : eq(plans.id, cible.id!), eq(plans.projectId, projectId)));
    return p ? { cibleId: p.id, libelle: `Plan · ${p.titre}` } : { erreur: "Plan introuvable dans ce projet." };
  }
  if (portee === "asset" && (cible.code || cible.id != null)) {
    const [a] = await db
      .select({ id: assets.id, code: assets.code, type: assets.type, description: assets.description })
      .from(assets)
      .where(and(eq(assets.projectId, projectId), cible.code ? eq(assets.code, cible.code) : eq(assets.id, cible.id!)));
    return a ? { cibleId: a.id, libelle: a.type === TYPE_AFFICHE ? (a.description ?? a.code) : a.code } : { erreur: "Asset introuvable dans ce projet." };
  }
  return { erreur: "Cible mal désignée pour cette portée." };
}

/** Readable label of an already resolved target (internal id). */
export async function libelleCible(projectId: number, portee: Portee, cibleId: number | null): Promise<string> {
  const libelle = (r: CibleResolue | { erreur: string }, repli: string) => ("libelle" in r ? r.libelle : repli);
  if (portee === "projet" || cibleId == null) return libelle(await resoudreCible(projectId, "projet", null), "Projet");
  if (portee === "episode") return libelle(await resoudreCible(projectId, "episode", { id: cibleId }), "Épisode");
  if (portee === "asset") return libelle(await resoudreCible(projectId, "asset", { id: cibleId }), "Asset");
  const [p] = await db.select({ titre: plans.titre }).from(plans).where(eq(plans.id, cibleId));
  return p ? `Plan · ${p.titre}` : "Plan";
}

// --- conversation -----------------------------------------------------------

const etapeInitiale = (p: Profondeur) => (p === "complete" ? "conversation" : "consigne");
/** The agent opens the intake interview (full conversation): three very different leads for whoever has no idea (hook.ts). */
const messagesInitiaux = (p: Profondeur): MessageConversation[] => (p === "complete" ? [{ role: "assistant", content: accrocheEntretien(), at: new Date().toISOString() }] : []);
/** A conversation's opening: for the intake interview of a DESIGNED project (design.ts), the pre-filled sheet and, in place of the first
 * message, the hook request to the model (`entreeAccroche`, task posted by `lancerAccroche` once the conversation is created); otherwise
 * the three-lead hook, empty sheet. */
async function ouverture(projectId: number, portee: Portee, p: Profondeur): Promise<{ messages: MessageConversation[]; fiche: Fiche | null; entreeAccroche: object | null }> {
  if (portee === "projet" && p === "complete") {
    const o = await ouvertureConcue(db, projectId);
    if (o) return { messages: [], fiche: o.fiche, entreeAccroche: o.entreeAccroche };
  }
  return { messages: messagesInitiaux(p), fiche: null, entreeAccroche: null };
}

/** Posts the task that writes the screenwriter's hook (skill `accroche-scenariste`): a "tour" task, which the interface shows as
 * a reply in progress. Once per conversation; `relancerAccroche` serves if it failed. */
async function lancerAccroche(conversationId: number, projectId: number, entree: object) {
  await creerRun(db, { skill: "accroche-scenariste", entree, but: "tour", projectId, conversationId });
}
const profondeurParDefaut = (portee: Portee): Profondeur => (portee === "projet" ? "complete" : "courte");

type ConversationRow = typeof agentConversations.$inferSelect;

/** The conversation for (project, scope, target). */
async function trouver(projectId: number, portee: Portee, cibleId: number | null): Promise<ConversationRow | null> {
  const [c] = await db
    .select()
    .from(agentConversations)
    .where(
      and(
        eq(agentConversations.projectId, projectId),
        eq(agentConversations.portee, portee),
        cibleId == null ? isNull(agentConversations.cibleId) : eq(agentConversations.cibleId, cibleId),
      ),
    );
  return c ?? null;
}

export async function conversationParUuid(uuid: string): Promise<ConversationRow | null> {
  if (!/^[0-9a-f-]{36}$/i.test(uuid)) return null;
  const [c] = await db.select().from(agentConversations).where(eq(agentConversations.uuid, uuid));
  return c ?? null;
}

/** Stops what is running for a conversation: pending tasks are cancelled, running ones
 * receive the cancellation flag (the worker cuts the connection), proposals in
 * generation are rejected. */
export async function arreterTravaux(conversationId: number): Promise<void> {
  const maintenant = new Date();
  await db
    .update(agentRuns)
    .set({ statut: "annulee", finishedAt: maintenant })
    .where(and(eq(agentRuns.conversationId, conversationId), eq(agentRuns.statut, "en_attente")));
  await db
    .update(agentRuns)
    .set({ annulationDemandeeAt: maintenant })
    .where(and(eq(agentRuns.conversationId, conversationId), eq(agentRuns.statut, "en_cours")));
  await db
    .update(propositions)
    .set({ statut: "rejetee" })
    .where(and(eq(propositions.conversationId, conversationId), inArray(propositions.statut, ["en_generation", "prete"])));
}

export async function ouvrirConversation(projectId: number, portee: Portee, cible: CibleDemandee | null, profondeur?: Profondeur): Promise<Resultat<{ conversationUuid: string; reprise: boolean }>> {
  const r = await resoudreCible(projectId, portee, cible);
  if ("erreur" in r) return ERR(r.erreur);
  const existante = await trouver(projectId, portee, r.cibleId);
  if (existante) return { ok: true, conversationUuid: existante.uuid, reprise: true };
  const p = profondeur ?? profondeurParDefaut(portee);
  const ouv = await ouverture(projectId, portee, p);
  const [c] = await db
    .insert(agentConversations)
    .values({ projectId, portee, cibleId: r.cibleId, profondeur: p, etape: etapeInitiale(p), messages: ouv.messages, fiche: ouv.fiche })
    .onConflictDoNothing()
    .returning({ uuid: agentConversations.uuid });
  if (c) {
    await lancerAccrocheSiConcu(c.uuid, projectId, ouv.entreeAccroche);
    return { ok: true, conversationUuid: c.uuid, reprise: false };
  }
  const apres = await trouver(projectId, portee, r.cibleId);
  return apres ? { ok: true, conversationUuid: apres.uuid, reprise: true } : ERR("Conversation non créée.");
}

async function lancerAccrocheSiConcu(conversationUuid: string, projectId: number, entree: object | null) {
  if (!entree) return;
  const conv = await conversationParUuid(conversationUuid);
  if (conv) await lancerAccroche(conv.id, projectId, entree);
}

/** Re-runs the screenwriter's hook when its first write failed (the conversation then has no message). Refused as soon as a message
 * exists or a task is running: the hook is never regenerated for fun. */
export async function relancerAccroche(conversationUuid: string): Promise<Resultat> {
  const conv = await conversationParUuid(conversationUuid);
  if (!conv) return ERR("Conversation introuvable.");
  if (((conv.messages as MessageConversation[]) ?? []).length > 0) return ERR("L'entretien a déjà commencé : l'accroche ne change plus.");
  { const refus = await refusSiTacheActive(conv.id, "L'accroche est déjà en cours d'écriture.", ["tour"]); if (refus) return refus; }
  const o = await ouvertureConcue(db, conv.projectId);
  if (!o) return ERR("Ce projet n'a pas de conception : pas d'accroche à écrire.");
  await lancerAccroche(conv.id, conv.projectId, o.entreeAccroche);
  return { ok: true };
}

/** Card reply: the sent text is formulated here from the kept labels (never from the client), and only the cards of the
 * agent's LAST message still reply. */
export async function repondreAuChoix(conversationUuid: string, libelles: string[]): Promise<Resultat<{ runUuid: string }>> {
  const conv = await conversationParUuid(conversationUuid);
  if (!conv) return ERR("Conversation introuvable.");
  const choix = choixActif((conv.messages as MessageConversation[]) ?? []);
  if (!choix || !selectionValide(choix, libelles)) return ERR("Ce choix n'est plus disponible : réponds dans la zone de saisie.");
  return envoyerMessage(conversationUuid, formulerReponse(choix, libelles), libelles);
}

export async function envoyerMessage(conversationUuid: string, texte: string, choisis?: string[]): Promise<Resultat<{ runUuid: string }>> {
  const conv = await conversationParUuid(conversationUuid);
  if (!conv) return ERR("Conversation introuvable.");
  if (conv.profondeur !== "complete") return ERR("Cette conversation est courte : donne une consigne et génère la proposition.");
  const message = texte.trim();
  if (!message) return ERR("Le message est vide.");
  if (message.length > MAX_MESSAGE) return ERR(`Message trop long (${MAX_MESSAGE} caractères au plus).`);
  // A turn OR the briefing's writing (the first version goes alone, and is worth waiting for) block the send.
  { const refus = await refusSiTacheActive(conv.id, "L'agent est déjà en train de répondre : attends sa réponse.", ["tour", "brief"]); if (refus) return refus; }

  const messages = [...((conv.messages as MessageConversation[]) ?? []), { role: "user" as const, content: message, at: new Date().toISOString(), ...(choisis ? { choisis } : {}) }];
  const run = await db.transaction(async (tx) => {
    await tx.update(agentConversations).set({ messages, briefPret: false, etape: "conversation", updatedAt: new Date() }).where(eq(agentConversations.id, conv.id));
    // First the notes (a short call that returns a patch of the sheet): on its return, the worker applies the patch and posts the
    // agent's turn, with the updated sheet and what is still to ask (worker/agents/postProcessing.ts, postNotes).
    return creerRun(tx, {
      skill: "notes-entretien",
      entree: entreeNotes(messages.map((m) => ({ role: m.role, content: m.content })), await ficheCourante(tx, conv)),
      but: "tour",
      projectId: conv.projectId,
      conversationId: conv.id,
    });
  });
  return { ok: true, runUuid: run.uuid };
}

// --- brief ------------------------------------------------------------------

export async function genererBrief(conversationUuid: string): Promise<Resultat> {
  const conv = await conversationParUuid(conversationUuid);
  if (!conv) return ERR("Conversation introuvable.");
  if (conv.profondeur !== "complete") return ERR("Le brief ne se génère que dans une conversation complète.");
  const messages = (conv.messages as MessageConversation[]) ?? [];
  if (!messages.some((m) => m.role === "user")) return ERR("Parle d'abord de ton projet à l'agent.");
  const [existant] = await db.select({ statut: briefs.statut }).from(briefs).where(eq(briefs.projectId, conv.projectId));
  if (existant?.statut === "valide") return ERR("Ce projet a déjà un brief validé : modifie-le section par section.");
  { const refus = await refusSiTacheActive(conv.id, "Une réponse de l'agent est déjà en cours.", ["tour", "brief"]); if (refus) return refus; }

  // No call to the model: the brief fills up over the conversation (the notes sheet). "Passer au briefing" only
  // freezes the sheet as it is into a draft, even if incomplete (what the user did not say stays "déduit" or empty).
  const [projet] = await db.select({ nom: projects.nom }).from(projects).where(eq(projects.id, conv.projectId));
  const genere = ficheVersBrief(await ficheCourante(db, conv), projet?.nom ?? "");
  await db.transaction(async (tx) => {
    await ecrireBrouillon(tx, conv.projectId, { contenu: genere.contenu, statuts: genere.statuts as Record<string, StatutChamp> });
    await tx.update(agentConversations).set({ etape: "brief", updatedAt: new Date() }).where(eq(agentConversations.id, conv.id));
  });
  return { ok: true };
}

export async function modifierChampBrief(projectId: number, section: string, valeur: unknown): Promise<Resultat> {
  if (!estCleSection(section)) return ERR(`Section de brief inconnue : « ${section} ».`);
  if (SECTIONS_FIGEES_PAR_LA_CONCEPTION.includes(section) && (await lireConception(db, projectId))) {
    return ERR("Ce choix a été fait à la conception du projet : le changer reviendrait à refaire le projet (la langue touche tous les dialogues, la durée tout le découpage).");
  }
  const sous = sousSchemaSection(SCHEMA_BRIEF, section);
  if (sous) {
    const v = valider({ $schema: "https://json-schema.org/draft/2020-12/schema", ...sous }, valeur);
    if (!v.ok) return ERR(`Valeur invalide pour « ${section} » : ${v.erreurs.join(" ; ")}`);
  }
  // A project without a brief: the first manual edit creates a PARTIAL brief (style, notes…),
  // the source of the style clause even when the agent has not written anything yet.
  await creerBriefPartiel(db, projectId);
  await db.transaction(async (tx) => {
    const [b] = await tx.select().from(briefs).where(eq(briefs.projectId, projectId));
    if (!b) throw new Error("Brief introuvable.");
    await tx
      .update(briefs)
      .set({
        contenu: { ...(b.contenu as Record<string, unknown>), [section]: valeur },
        statuts: { ...(b.statuts as Record<string, StatutChamp>), [section]: "fourni" },
        version: b.version + 1,
        updatedAt: new Date(),
      })
      .where(eq(briefs.id, b.id));
    await synchroniserClauseStyle(tx, projectId); // no effect on a draft: not yet the reference
    // The film's title is the PROJECT's: correcting it in the brief renames the project (a single name, everywhere).
    if (section === "titre" && typeof valeur === "string" && valeur.trim()) await tx.update(projects).set({ nom: valeur.trim() }).where(eq(projects.id, projectId));
  });
  return { ok: true };
}

// --- proposal ------------------------------------------------------------

async function nouvelleProposition(conv: ConversationRow, p: { skill: string; consigne: string; contexte: unknown[]; parentId?: number | null; retour?: string | null; lot?: boolean }): Promise<number> {
  // A single current proposal: the previous one, if it is still waiting, is rejected — and if
  // it is still in generation, its tasks (a batch has several) are stopped.
  const enCours = await db
    .select({ id: propositions.id })
    .from(propositions)
    .where(and(eq(propositions.conversationId, conv.id), eq(propositions.statut, "en_generation")));
  await annulerRunsDePropositions(db, enCours.map((x) => x.id));
  await db
    .update(propositions)
    .set({ statut: "rejetee" })
    .where(and(eq(propositions.conversationId, conv.id), inArray(propositions.statut, ["en_generation", "prete"])));
  const [prop] = await db
    .insert(propositions)
    .values({
      conversationId: conv.id,
      projectId: conv.projectId,
      skill: p.skill,
      portee: conv.portee,
      cibleId: conv.cibleId,
      consigne: p.consigne,
      contexte: p.contexte,
      parentId: p.parentId ?? null,
      retour: p.retour ?? null,
      lot: p.lot ?? false,
    })
    .returning({ id: propositions.id });
  await db.update(agentConversations).set({ propositionId: prop!.id, consigne: p.consigne, etape: "proposition", updatedAt: new Date() }).where(eq(agentConversations.id, conv.id));
  return prop!.id;
}

/** `sceneId`: the scene where the inserted clip lands, when the caller knows it (an empty scene has no neighbouring clip to deduce it from). */
async function entreePourConversation(conv: ConversationRow, consigne: string, position?: Position, retour?: string, sceneId?: number, place?: PlaceScene): Promise<{ entree: EntreeSkill; options: Record<string, unknown> } | { erreur: string }> {
  const cibleId = conv.cibleId;
  if (conv.portee === "asset" && cibleId != null) {
    // A project's or episode's poster is a hidden asset: the `prompt-asset` skill, `affiche` variant, same review path.
    const [cibleAsset] = await db.select({ type: assets.type }).from(assets).where(and(eq(assets.id, cibleId), eq(assets.projectId, conv.projectId)));
    if (cibleAsset?.type === TYPE_AFFICHE) {
      const a = await entreePromptAffiche(db, conv.projectId, cibleId, consigne, retour);
      return a ? { entree: a, options: { variante: a.variante } } : { erreur: "Affiche introuvable." };
    }
    const e = await entreePromptAsset(db, conv.projectId, cibleId, consigne, retour);
    return e ? { entree: e, options: { variante: e.variante } } : { erreur: "Asset introuvable." };
  }
  if (conv.portee === "episode" && cibleId != null) {
    const e = await entreeScenarioEpisode(db, conv.projectId, cibleId, consigne, { position, place, retour });
    return e ? { entree: e, options: { ...(place ? { place } : position ? { position, sceneVoisineId: sceneId ?? e.sceneVoisineId } : {}) } } : { erreur: "Épisode introuvable." };
  }
  if (conv.portee === "plan" && cibleId != null) {
    const [p] = await db.select({ uuid: plans.uuid }).from(plans).where(eq(plans.id, cibleId));
    const e = p ? await entreeCorrectionPlan(db, conv.projectId, p.uuid, consigne, retour) : null;
    return e ? { entree: e, options: {} } : { erreur: "Plan introuvable." };
  }
  return { erreur: `La portée « ${conv.portee} » ne se génère pas en profondeur courte : ouvre une conversation complète.` };
}

export async function genererProposition(conversationUuid: string, options: { consigne?: string; position?: Position; sceneId?: number; place?: PlaceScene; demandeId?: number } = {}): Promise<Resultat<{ propositionUuid: string; runUuid: string | null }>> {
  const conv = await conversationParUuid(conversationUuid);
  if (!conv) return ERR("Conversation introuvable.");
  { const refus = await refusSiTacheActive(conv.id, "Une tâche de l'agent est déjà en cours sur cette conversation."); if (refus) return refus; }

  // Write the screenplays from the project: a BATCH (one subtask per episode).
  if (conv.profondeur === "courte" && (conv.portee === "projet")) {
    const r = await genererScenarios(conversationUuid, { consigne: options.consigne });
    return r.ok ? { ok: true, propositionUuid: r.propositionUuid, runUuid: null } : r;
  }

  // Full depth: the skeleton is built in code from the brief.
  if (conv.profondeur === "complete") {
    const [brief] = await db.select().from(briefs).where(eq(briefs.projectId, conv.projectId));
    if (!brief || brief.statut === "partiel") return ERR("Génère d'abord le brief.");
    const lignesEps = await db
      .select({ id: episodes.id, numero: episodes.numero, titre: episodes.titre, resume: episodes.resume })
      .from(episodes)
      .where(eq(episodes.projectId, conv.projectId));
    // An "empty" episode (no clip, no scene, no summary) is reused by the skeleton rather
    // than doubled: a film is born already with its episode.
    const idsEps = lignesEps.map((e) => e.id);
    const avecPlans = new Set(idsEps.length ? (await db.select({ id: plans.episodeId }).from(plans).where(inArray(plans.episodeId, idsEps))).map((r) => r.id) : []);
    const avecScenes = new Set(idsEps.length ? (await db.select({ id: scenes.episodeId }).from(scenes).where(inArray(scenes.episodeId, idsEps))).map((r) => r.id) : []);
    const eps = lignesEps.map((e) => ({ ...e, vide: !e.resume.trim() && !avecPlans.has(e.id) && !avecScenes.has(e.id) }));
    const bruts = squeletteDepuisBrief(brief.contenu as BriefContenu, brief.statuts as Record<string, StatutChamp>, {
      episodes: eps,
      briefValide: brief.statut === "valide" ? (brief.contenu as BriefContenu) : null,
    });
    const contexte = [{ type: "brief" as const, libelle: `Brief du projet (${brief.statut})`, ref: "*" }];
    const propId = await nouvelleProposition(conv, { skill: "squelette", consigne: conv.consigne, contexte });
    await db.transaction((tx) => enregistrerChangements(tx, propId, conv.projectId, { type: conv.portee as Portee, cibleId: conv.cibleId }, bruts));
    const [prop] = await db.select({ uuid: propositions.uuid }).from(propositions).where(eq(propositions.id, propId));
    return { ok: true, propositionUuid: prop!.uuid, runUuid: null };
  }

  // An episode with no instruction nor position: "write its screenplay" (the normal case of an empty episode).
  const consigne =
    (options.consigne ?? conv.consigne).trim() || (conv.portee === "episode" && !options.position ? "Écris le scénario complet de cet épisode." : "");
  if (!consigne) return ERR("Écris une consigne : l'intention en une ligne.");
  const e = await entreePourConversation(conv, consigne, options.position, undefined, options.sceneId, options.place);
  if ("erreur" in e) return ERR(e.erreur);
  const propId = await nouvelleProposition(conv, { skill: e.entree.skill, consigne, contexte: e.entree.contexte });
  const run = await creerRun(db, {
    skill: e.entree.skill,
    entree: e.entree.entree,
    but: "proposition",
    projectId: conv.projectId,
    conversationId: conv.id,
    propositionId: propId,
    options: e.options,
    demandeId: options.demandeId,
  });
  await db.update(propositions).set({ runId: run.id }).where(eq(propositions.id, propId));
  const [prop] = await db.select({ uuid: propositions.uuid }).from(propositions).where(eq(propositions.id, propId));
  return { ok: true, propositionUuid: prop!.uuid, runUuid: run.uuid };
}

export async function propositionParUuid(uuid: string) {
  if (!/^[0-9a-f-]{36}$/i.test(uuid)) return null;
  const [p] = await db.select().from(propositions).where(eq(propositions.uuid, uuid));
  return p ?? null;
}

/** A proposal "en génération" whose task failed or was cancelled no longer waits for anything:
 * its status is caught up here (worker resume, cancellation from the header…). */
export async function rafraichirStatut<T extends typeof propositions.$inferSelect>(p: T): Promise<T> {
  if (p.statut !== "en_generation" || p.runId == null) return p;
  const [run] = await db.select({ statut: agentRuns.statut, erreur: agentRuns.erreur }).from(agentRuns).where(eq(agentRuns.id, p.runId));
  if (run && (run.statut === "echoue" || run.statut === "annulee")) {
    const erreur = run.statut === "annulee" ? "Annulée." : (run.erreur ?? "La génération a échoué.");
    await db.update(propositions).set({ statut: "echouee", erreur }).where(eq(propositions.id, p.id));
    return { ...p, statut: "echouee", erreur };
  }
  return p;
}

export async function cocherChangements(propositionUuid: string, selection: { groupe?: string; ids?: number[] }, coche: boolean): Promise<Resultat<{ modifies: number }>> {
  const prop = await propositionParUuid(propositionUuid);
  if (!prop) return ERR("Proposition introuvable.");
  if (prop.statut !== "prete") return ERR("Cette proposition n'est plus modifiable.");
  const lignes = await db.select().from(propositionChangements).where(eq(propositionChangements.propositionId, prop.id));
  const cibles = lignes.filter((c) => {
    if (selection.ids && !selection.ids.includes(c.id)) return false;
    if (selection.groupe && groupeAffiche({ groupe: c.groupe, ecrase: c.ecrase, refuseRaison: c.refuseRaison }) !== selection.groupe) return false;
    return !raisonNonCochable({ avertissements: (c.avertissements ?? []) as Avertissement[], refuseRaison: c.refuseRaison });
  });
  if (cibles.length) await db.update(propositionChangements).set({ coche }).where(inArray(propositionChangements.id, cibles.map((c) => c.id)));
  return { ok: true, modifies: cibles.length };
}

// --- episode screenplays: a BATCH (one subtask per episode) -------------------

const CONSIGNE_SCENARIO = "Écris le scénario complet de cet épisode.";

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

const CONSIGNE_TRAITEMENT = "Découpe cet épisode en scènes : ce que chacune raconte, d'où elle part, où elle arrive.";

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

const CONSIGNE_RELECTURE = "Relis le scénario de cet épisode et rends les plus petites corrections qui le rendent cohérent.";

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

const CONSIGNE_REGISTRE = "Écris le prompt de génération de ce master (image de référence) à partir de sa description canonique.";

/** The masters the brief describes (characters, places), with what already exists in the registry.
 * Empty as long as the project has no written brief. */
async function candidatsDuProjet(projectId: number): Promise<CandidatRegistre[]> {
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

const CONSIGNE_INVENTAIRE = "Dresse la liste des assets qui manquent au registre pour écrire les fiches de plan de ce projet.";

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

// --- step 3: clip sheets ------------------------------------------

const CONSIGNE_FICHE = "Écris la fiche de plan complète.";
const CONSIGNE_PROMPTS_CREES =
  "Écris le prompt de génération de cet asset (image de référence) à partir de sa description canonique ; s'il dérive d'un parent, pars de lui quand c'est pertinent.";

/** The clips of a scope (project, episode or a clip) that can be offered for writing their sheet, in
 * reading order, with what they already have: filled sections, references, render, lines of dialogue. A clip
 * with no filled section is "à écrire" (ticked outright); the others, when chosen, will go into overwrite. */
async function plansPourFiches(projectId: number, portee: Portee, cibleId: number | null): Promise<PlanPourFiche[]> {
  if (portee === "asset") return [];
  const tous = await db
    .select({
      id: plans.id,
      uuid: plans.uuid,
      titre: plans.titre,
      description: plans.description,
      duree: plans.dureeGenerationSecondes,
      statut: plans.statut,
      episodeId: plans.episodeId,
      sceneId: plans.sceneId,
      epNumero: episodes.numero,
      epTitre: episodes.titre,
    })
    .from(plans)
    .innerJoin(episodes, eq(episodes.id, plans.episodeId))
    .where(eq(plans.projectId, projectId))
    .orderBy(asc(episodes.numero), asc(plans.ordre), asc(plans.id));
  // The displayed rank is the clip's rank in ITS episode (F03: a position, never an identifier).
  const rangs = new Map<number, number>();
  const parEpisode = new Map<number, number>();
  for (const p of tous) {
    const n = (parEpisode.get(p.episodeId) ?? 0) + 1;
    parEpisode.set(p.episodeId, n);
    rangs.set(p.id, n);
  }
  const lignes = tous.filter((p) =>
    portee === "plan" ? p.id === cibleId : portee === "episode" ? p.episodeId === cibleId : true,
  );
  if (lignes.length === 0) return [];
  const ids = lignes.map((p) => p.id);
  const [remplies, refs, rendus, lesScenes] = await Promise.all([
    db.select({ planId: planPromptSections.planId }).from(planPromptSections).where(and(inArray(planPromptSections.planId, ids), sql`length(trim(${planPromptSections.contenu})) > 0`)),
    db.select({ planId: planRefs.planId, n: count() }).from(planRefs).where(and(inArray(planRefs.planId, ids), inArray(planRefs.type, ["picture", "audio"]))).groupBy(planRefs.planId),
    db.select({ planId: jobs.planId }).from(jobs).where(and(inArray(jobs.planId, ids), eq(jobs.statut, "termine"), isNotNull(jobs.cheminSortie))),
    db.select({ id: scenes.id, titre: scenes.titre }).from(scenes).where(inArray(scenes.episodeId, [...new Set(lignes.map((p) => p.episodeId))])),
  ]);
  const avecSections = new Set(remplies.map((r) => r.planId));
  const nbRefs = new Map(refs.map((r) => [r.planId, Number(r.n)]));
  const avecRendu = new Set(rendus.map((r) => r.planId));
  const titreScene = new Map(lesScenes.map((s) => [s.id, s.titre]));
  return lignes.map((p) => ({
    uuid: p.uuid,
    titre: p.titre,
    rang: rangs.get(p.id) ?? 0,
    episodeId: p.episodeId,
    episodeLibelle: `Épisode ${p.epNumero} · ${p.epTitre}`,
    sceneTitre: p.sceneId != null ? (titreScene.get(p.sceneId) ?? null) : null,
    dureeSecondes: p.duree,
    aDesSections: avecSections.has(p.id),
    nbRefs: nbRefs.get(p.id) ?? 0,
    aUnRendu: p.statut === "previsualise" || p.statut === "termine" || avecRendu.has(p.id),
    sansIntention: !(p.description ?? "").trim(),
  }));
}

/** Step 3: COMPILE a clip's sheet (scope `plan`: a simple proposal) or the sheets of an episode's or the project's clips (a BATCH: one
 * subtask per clip, key `plan:<uuid>`, one after the other in the queue). By default, the clips WITHOUT a sheet; `planUuids` chooses (and allows
 * recompiling a sheet: it goes into the "risque d'écrasement" section, unticked unless requested).
 *
 * Engine: Open H3 IR (virtual skill `plan-h3ir`, worker/h3ir.ts). It compiles from the references set on the clip: a clip that does not yet have its
 * references, or whose image is missing, is NOT compiled here (it must first be prepared: lib/h3ir/preparation.ts, which the "Générer la
 * fiche" requests lead to, lib/tasks/requests-db.ts). In a batch, these clips are left aside and named in the context; alone, they are refused with the reason. */
export async function genererFiches(
  conversationUuid: string,
  options: {
    planUuids?: string[];
    consigne?: string;
    /** The "Générer la fiche" request that posts this task (single clip). */
    demandeId?: number;
    /** Number of shots, staging style and creativity, optional (absent: those of the clip, its scene or the project). */
    reglagesH3ir?: { shots?: number | null; director?: string | null; creativity?: string | null };
  } = {},
): Promise<Resultat<{ propositionUuid: string; nbSousTaches: number; runUuid?: string; nonPrets: string[] }>> {
  const conv = await conversationParUuid(conversationUuid);
  if (!conv) return ERR("Conversation introuvable.");
  const portee = conv.portee as Portee;
  if (portee === "asset") return ERR("Les fiches s'écrivent depuis un plan, un épisode ou le projet.");
  { const refus = await refusSiTacheActive(conv.id, "Une tâche de l'agent est déjà en cours sur cette conversation."); if (refus) return refus; }

  const dispo = await plansPourFiches(conv.projectId, portee, conv.cibleId);
  if (dispo.length === 0) return ERR(portee === "plan" ? "Plan introuvable." : "Aucun plan dans cette portée : écris d'abord le scénario.");
  const voulus = options.planUuids ?? (portee === "plan" ? dispo.map((p) => p.uuid) : dispo.filter((p) => !p.aDesSections).map((p) => p.uuid));
  if (voulus.length === 0) return ERR(options.planUuids ? "Coche au moins un plan." : "Tous les plans ont déjà une fiche : choisis ceux à réécrire.");
  const choisis = dispo.filter((p) => voulus.includes(p.uuid));
  if (choisis.length !== new Set(voulus).size) return ERR("Un des plans choisis n'est pas dans cette portée.");
  const consigne = (options.consigne ?? "").trim() || CONSIGNE_FICHE;
  const attentes = await attentesFiches(conv.projectId, choisis.map((p) => p.uuid));
  const attenteDe = (uuid: string): string | null => attentes.get(uuid) ?? "état des références inconnu";
  const entreeH3ir = (planUuid: string): EntreeH3ir => ({ planUuid, shots: options.reglagesH3ir?.shots ?? null, director: options.reglagesH3ir?.director ?? null, creativity: options.reglagesH3ir?.creativity ?? null });
  const nonPrets = choisis.filter((p) => attenteDe(p.uuid)).map((p) => p.uuid);

  if (portee === "plan") {
    const plan = choisis[0]!;
    const attente = attenteDe(plan.uuid);
    if (attente) return ERR(`Open H3 IR ne peut pas encore compiler ce plan : ${attente}. « Générer la fiche » prépare d'abord ses références et leurs images.`);
    const contexte: ContexteUtilise[] = [{ type: "plan", libelle: `Plan · ${plan.titre} (Open H3 IR)`, ref: plan.uuid }];
    const propId = await nouvelleProposition(conv, { skill: SKILL_H3IR, consigne: "Fiche de plan compilée par Open H3 IR.", contexte });
    const run = await creerRun(db, { skill: SKILL_H3IR, entree: entreeH3ir(plan.uuid), but: "proposition", projectId: conv.projectId, conversationId: conv.id, propositionId: propId, options: null, demandeId: options.demandeId });
    await db.update(propositions).set({ runId: run.id }).where(eq(propositions.id, propId));
    const [prop] = await db.select({ uuid: propositions.uuid }).from(propositions).where(eq(propositions.id, propId));
    return { ok: true, propositionUuid: prop!.uuid, nbSousTaches: 1, runUuid: run.uuid, nonPrets };
  }

  // A BATCH: one subtask per ready clip.
  const plusieursEpisodes = new Set(choisis.map((p) => p.episodeId)).size > 1;
  const sousTaches = choisis.filter((p) => !attenteDe(p.uuid));
  if (sousTaches.length === 0) {
    return ERR(nonPrets.length ? `Aucun plan prêt à compiler : ${nonPrets.length} plan${nonPrets.length > 1 ? "s attendent" : " attend"} ses références ou leurs images (« Générer la fiche » les prépare).` : "Aucun plan lisible.");
  }
  const contexte: ContexteUtilise[] = [
    { type: "plan" as const, libelle: `${sousTaches.length} fiche${sousTaches.length > 1 ? "s" : ""} de plan à compiler avec Open H3 IR, une par une` },
    ...(nonPrets.length ? [{ type: "plan" as const, libelle: `${nonPrets.length} laissé${nonPrets.length > 1 ? "s" : ""} de côté (références ou images à préparer d'abord)` }] : []),
  ];
  const propId = await nouvelleProposition(conv, { skill: "fiches", consigne, contexte, lot: true });
  for (const p of sousTaches) {
    await creerRun(db, {
      skill: SKILL_H3IR,
      entree: entreeH3ir(p.uuid),
      but: "proposition",
      projectId: conv.projectId,
      conversationId: conv.id,
      propositionId: propId,
      options: null,
      cleSousTache: cleSousTachePlan(p.uuid),
      libelleSousTache: `${plusieursEpisodes ? `${p.episodeLibelle} · ` : ""}Plan ${String(p.rang).padStart(2, "0")} · ${p.titre} (Open H3 IR)`,
    });
  }
  const [prop] = await db.select({ uuid: propositions.uuid }).from(propositions).where(eq(propositions.id, propId));
  return { ok: true, propositionUuid: prop!.uuid, nbSousTaches: sousTaches.length, nonPrets };
}

// --- preparation of a clip before its compilation (wave 4a, lib/h3ir/preparation.ts) ----------

const CONSIGNE_REFERENCES = "Choisis les images de référence de ce plan (doute du choix automatique).";

/** Posts a clip's `references-plan` task (ONE per clip, only when the code's choice has a doubt: the caller has checked), in the conversation
 * of the CLIP. Its output (worker/agents/postProcessing.ts) writes the references right away, or, if missing assets must be created, makes them creations
 * that the request applies (the references are then written in the same transaction). `rechoisir`: replace references already set. */
export async function genererReferencesPlan(
  conversationUuid: string,
  options: { demandeId?: number; rechoisir?: boolean; assetsProposesParLeLot?: { code: string; type: string }[] } = {},
): Promise<Resultat<{ propositionUuid: string; runUuid: string }>> {
  const conv = await conversationParUuid(conversationUuid);
  if (!conv) return ERR("Conversation introuvable.");
  if (conv.portee !== "plan" || conv.cibleId == null) return ERR("Le choix des références se demande depuis un plan.");
  { const refus = await refusSiTacheActive(conv.id, "Une tâche de l'agent est déjà en cours sur ce plan."); if (refus) return refus; }
  const [p] = await db.select({ uuid: plans.uuid }).from(plans).where(eq(plans.id, conv.cibleId));
  if (!p) return ERR("Plan introuvable.");
  const e = await entreeReferencesPlan(db, conv.projectId, p.uuid, { assetsProposesParLeLot: options.assetsProposesParLeLot });
  if (!e) return ERR("Plan introuvable.");
  const contexte: ContexteUtilise[] = [...e.contexte, { type: "plan", libelle: `${e.choix.doutes.length} doute${e.choix.doutes.length > 1 ? "s" : ""} du choix automatique` }];
  const propId = await nouvelleProposition(conv, { skill: SKILL_REFERENCES_PLAN, consigne: CONSIGNE_REFERENCES, contexte });
  const run = await creerRun(db, {
    skill: SKILL_REFERENCES_PLAN,
    entree: e.entree,
    but: "proposition",
    projectId: conv.projectId,
    conversationId: conv.id,
    propositionId: propId,
    options: { planId: conv.cibleId, ...(options.rechoisir ? { rechoisir: true } : {}) },
    demandeId: options.demandeId,
  });
  await db.update(propositions).set({ runId: run.id }).where(eq(propositions.id, propId));
  const [prop] = await db.select({ uuid: propositions.uuid }).from(propositions).where(eq(propositions.id, propId));
  return { ok: true, propositionUuid: prop!.uuid, runUuid: run.uuid };
}

/** Creates missing assets RIGHT AWAY (two at most, already kept: lib/h3ir/preparation.ts, `retenirManquants`) from a clip's conversation:
 * an `assets-manquants` proposal, applied without review ("Itérer": the assets the agent decided to create). Returns the created codes and the
 * proposal (source of the prompts). */
export async function creerAssetsManquants(
  conversationUuid: string,
  manquants: ManquantRetenu[],
): Promise<Resultat<{ propositionUuid: string | null; crees: string[] }>> {
  const conv = await conversationParUuid(conversationUuid);
  if (!conv) return ERR("Conversation introuvable.");
  if (manquants.length === 0) return { ok: true, propositionUuid: null, crees: [] };
  const existants = new Set((await db.select({ code: assets.code }).from(assets).where(and(eq(assets.projectId, conv.projectId), inArray(assets.code, manquants.map((m) => m.code))))).map((a) => a.code));
  const aCreer = manquants.filter((m) => !existants.has(m.code));
  if (aCreer.length === 0) return { ok: true, propositionUuid: null, crees: [] };
  const propId = await nouvelleProposition(conv, { skill: SKILL_ASSETS_MANQUANTS, consigne: "Assets manquants décidés par l'itération.", contexte: [] });
  await enregistrerChangements(db, propId, conv.projectId, { type: conv.portee as Portee, cibleId: conv.cibleId }, brutsManquants(aCreer));
  const a = await appliquerProposition(propId, { confirmeEcrasement: false });
  if (!a.ok) return ERR(`Les assets manquants n'ont pas pu être créés : ${a.erreur}`);
  const crees = (await db.select({ code: assets.code }).from(assets).where(and(eq(assets.projectId, conv.projectId), inArray(assets.code, aCreer.map((m) => m.code))))).map((x) => x.code);
  const [prop] = await db.select({ uuid: propositions.uuid }).from(propositions).where(eq(propositions.id, propId));
  return { ok: true, propositionUuid: prop?.uuid ?? null, crees };
}

// --- correction after viewing (iteration-plan) -------------------------------------

const MAX_RETOUR_VISIONNAGE = 4000;


/** "Corriger après visionnage" (page of a clip that has a RENDER): a simple, refinable proposal, modelled on
 * a single clip's sheet. `retour` = what the user saw (mandatory); it becomes the proposal's instruction.
 * Routing by clip state (decision 2026-10-02): without a finished render, refused (never a blind correction); without a
 * sheet, refused ("écris-la d'abord"). The contact sheet is extracted by the worker at run time, never stored. */
export async function genererIteration(
  conversationUuid: string,
  /** `planche`: attach the render's contact sheet (never by default: "Montrer au chef opérateur" checkbox, "Analyser" button). */
  options: { retour: string; renduId?: number | null; planche?: boolean; demandeId?: number },
): Promise<Resultat<{ propositionUuid: string; runUuid: string }>> {
  const conv = await conversationParUuid(conversationUuid);
  if (!conv) return ERR("Conversation introuvable.");
  if (conv.portee !== "plan" || conv.cibleId == null) return ERR("La correction après visionnage se demande depuis la page d'un plan.");
  const retour = (options.retour ?? "").trim();
  if (!retour) return ERR("Dis ce que tu as vu dans le rendu : c'est le point de départ du diagnostic.");
  if (retour.length > MAX_RETOUR_VISIONNAGE) return ERR(`Ton retour est trop long (${MAX_RETOUR_VISIONNAGE} caractères au plus).`);
  { const refus = await refusSiTacheActive(conv.id, "Une tâche de l'agent est déjà en cours sur ce plan."); if (refus) return refus; }
  const [p] = await db.select({ uuid: plans.uuid }).from(plans).where(eq(plans.id, conv.cibleId));
  if (!p) return ERR("Plan introuvable.");
  const e = await entreeIterationPlan(db, conv.projectId, p.uuid, retour, options.renduId ?? null, options.planche === true);
  if ("erreur" in e) return ERR(e.erreur);
  const propId = await nouvelleProposition(conv, { skill: "iteration-plan", consigne: retour, contexte: e.contexte });
  const run = await creerRun(db, { skill: "iteration-plan", entree: e.entree, but: "proposition", projectId: conv.projectId, conversationId: conv.id, propositionId: propId, demandeId: options.demandeId });
  await db.update(propositions).set({ runId: run.id }).where(eq(propositions.id, propId));
  const [prop] = await db.select({ uuid: propositions.uuid }).from(propositions).where(eq(propositions.id, propId));
  return { ok: true, propositionUuid: prop!.uuid, runUuid: run.uuid };
}

/** "Itérer": the sheet is ALWAYS recompiled by Open H3 IR (2026-11-09) with the iteration agent's DECISIONS (complete intent, duration,
 * references added / removed, creativity and the clip's staging style). Nothing is written here: the decisions go as an override of the brief
 * (lib/h3ir/brief-clip.ts) and are only written onto the clip with the compiled sheet, on application (postTraitement: `apres.description`,
 * `dureeGenerationSecondes`, the manifest's `refs`, `reglages`); if the compilation fails, nothing is written. The final references must all have
 * their image: the "Itérer" request (lib/tasks/requests-db.ts) first creates the missing assets decided and waits for their images (wave 4a); called too early,
 * the recompilation is refused without a task launched. */
export async function genererReecriturePlan(
  conversationUuid: string,
  /** `depuisNumero`: the attempt the user started from. When the decisions only touch the description, the instruction is played on THAT attempt's PROMPT
   * (skill `retouche-prompt`, worker/h3ir.ts) instead of a recompilation; the skill may answer "refonte", and the compilation then takes over. */
  options: { consigne: string; decisions: DecisionsIteration; demandeId?: number; depuisNumero?: number | null },
): Promise<Resultat<{ propositionUuid: string; runUuid: string }>> {
  const conv = await conversationParUuid(conversationUuid);
  if (!conv) return ERR("Conversation introuvable.");
  if (conv.portee !== "plan" || conv.cibleId == null) return ERR("La recompilation d'un plan se demande depuis la page d'un plan.");
  const dec = options.decisions ?? {};
  const description = (dec.description ?? "").trim() || null;
  const duree = Number.isInteger(dec.dureeSecondes) && dec.dureeSecondes! >= DUREE_GENERATION_MIN && dec.dureeSecondes! <= DUREE_GENERATION_MAX ? dec.dureeSecondes! : null;
  const references = dec.references && dec.references.ajouter.length + dec.references.retirer.length > 0 ? { ajouter: [...dec.references.ajouter], retirer: [...dec.references.retirer] } : null;
  const creativite = dec.reglages?.creativite && estCreativite(dec.reglages.creativite) ? dec.reglages.creativite : null;
  const styleCamera = dec.reglages?.styleCamera && styleCameraOuNull(dec.reglages.styleCamera) ? dec.reglages.styleCamera : null;
  const reglagesPlan = creativite || styleCamera ? { creativite, styleCamera } : null;
  if (!description && duree == null && !references && !reglagesPlan) return ERR("L'agent n'a rien décidé de changer : rien à recompiler.");
  { const refus = await refusSiTacheActive(conv.id, "Une tâche de l'agent est déjà en cours sur ce plan."); if (refus) return refus; }
  const [p] = await db.select({ uuid: plans.uuid }).from(plans).where(eq(plans.id, conv.cibleId));
  if (!p) return ERR("Plan introuvable.");
  const finales = await referencesApresDecisions(conv.projectId, p.uuid, references ?? {});
  if (!finales) return ERR("Plan introuvable.");
  if (finales.inconnus.length) return ERR(`Références inconnues du registre : ${finales.inconnus.join(", ")}. Rien n'a été écrit.`);
  if (finales.pasDesImages.length) return ERR(`Ces assets ne sont pas des images : ${finales.pasDesImages.join(", ")}. Rien n'a été écrit.`);
  if (finales.codes.length === 0) return ERR("Le plan n'aurait plus aucune image de référence : Open H3 IR ne peut pas le compiler. Rien n'a été écrit.");
  if (finales.sansImage.length) return ERR(`En attente d'images : ${finales.sansImage.join(", ")} (la recompilation part quand elles existent) ; rien n'a été écrit.`);

  // Starting from an attempt: retouch its prompt when the decisions only touch the description (lib/h3ir/retouch.ts, `preparerDepart`).
  const [essai] =
    options.depuisNumero != null && !references && !reglagesPlan && duree == null
      ? await db
          .select({ prompt: jobs.promptUtilise, description: jobs.descriptionUtilisee, duree: jobs.dureeUtilisee })
          .from(jobs)
          .where(and(eq(jobs.planId, conv.cibleId), eq(jobs.numeroRendu, options.depuisNumero)))
          .limit(1)
      : [];
  const depart = preparerDepart(
    { description, duree, references: !!references, reglages: !!reglagesPlan },
    options.depuisNumero,
    essai,
    options.consigne,
    (n) => n >= DUREE_GENERATION_MIN && n <= DUREE_GENERATION_MAX,
  );
  const retouche = depart.retouche;
  const descriptionVoulue = depart.description;
  const dureeVoulue = depart.duree;

  const entree: EntreeH3ir = {
    planUuid: p.uuid,
    shots: null,
    director: null,
    creativity: null,
    ...(descriptionVoulue ? { description: descriptionVoulue } : {}),
    ...(dureeVoulue != null ? { dureeSecondes: dureeVoulue } : {}),
    ...(references ? { references } : {}),
    ...(reglagesPlan ? { reglagesPlan } : {}),
    ...(retouche ? { retouche } : {}),
  };
  const contexte: ContexteUtilise[] = [{ type: "plan", libelle: "Décisions de l'agent d'itération, recompilées par Open H3 IR (écrites avec la fiche)", ref: p.uuid }];
  const propId = await nouvelleProposition(conv, { skill: SKILL_H3IR, consigne: options.consigne.trim(), contexte });
  const run = await creerRun(db, {
    skill: SKILL_H3IR,
    entree,
    but: "proposition",
    projectId: conv.projectId,
    conversationId: conv.id,
    propositionId: propId,
    options: { ...(descriptionVoulue ? { descriptionNouvelle: descriptionVoulue } : {}), ...(dureeVoulue != null ? { dureeNouvelle: dureeVoulue } : {}), ...(reglagesPlan ? { reglagesNouveaux: reglagesPlan } : {}) },
    demandeId: options.demandeId,
  });
  await db.update(propositions).set({ runId: run.id }).where(eq(propositions.id, propId));
  const [prop] = await db.select({ uuid: propositions.uuid }).from(propositions).where(eq(propositions.id, propId));
  return { ok: true, propositionUuid: prop!.uuid, runUuid: run.uuid };
}

/** The assets CREATED by a sheets proposal (missing assets) that do not yet have an image prompt. */
async function assetsCreesSansPrompt(propositionId: number): Promise<{ id: number; code: string; type: string }[]> {
  const lignes = await db
    .select({ apres: propositionChangements.apres })
    .from(propositionChangements)
    .where(
      and(
        eq(propositionChangements.propositionId, propositionId),
        eq(propositionChangements.cibleType, "asset"),
        eq(propositionChangements.operation, "creer"),
        isNotNull(propositionChangements.appliqueAt),
      ),
    );
  const codes = lignes.map((l) => (l.apres as { code?: unknown } | null)?.code).filter((c): c is string => typeof c === "string");
  if (codes.length === 0) return [];
  const [prop] = await db.select({ projectId: propositions.projectId }).from(propositions).where(eq(propositions.id, propositionId));
  if (!prop) return [];
  const lus = await db
    .select({ id: assets.id, code: assets.code, type: assets.type, prompt: assets.promptGeneration })
    .from(assets)
    .where(and(eq(assets.projectId, prop.projectId), inArray(assets.code, codes)))
    .orderBy(asc(assets.code));
  return lus.filter((a) => !(a.prompt ?? "").trim()).map((a) => ({ id: a.id, code: a.code, type: a.type }));
}

/** After applying a sheet, an inventory or a choice of references: "Continuer: écrire les prompts des assets créés". A BATCH
 * `prompt-asset` (one subtask per asset created without a prompt, `asset:<code>`), posted in the PROJECT's conversation (the only scope where an existing asset
 * is modified). Launched on the user's click, or by a project's creation. Refused if the project's conversation already has a running task or a
 * proposal awaiting review (it is not lost). A clip's preparation goes through `genererPromptsAssets` (detached batch). */
export async function genererPromptsAssetsCrees(
  propositionUuid: string,
  options: { consigne?: string } = {},
): Promise<Resultat<{ conversationUuid: string; propositionUuid: string; nbSousTaches: number }>> {
  const source = await propositionParUuid(propositionUuid);
  if (!source) return ERR("Proposition introuvable.");
  if (!SKILLS_CREANT_DES_ASSETS.includes(source.skill)) return ERR("Cette proposition n'a pas créé d'assets à décrire (fiches de plan, inventaire, références d'un plan).");
  if (source.statut !== "appliquee" && source.statut !== "partielle") return ERR("Applique d'abord la proposition : les assets n'existent pas encore.");
  const aEcrire = await assetsCreesSansPrompt(source.id);
  if (aEcrire.length === 0) return ERR("Aucun asset créé par cette proposition n'attend son prompt.");

  const o = await ouvrirConversation(source.projectId, "projet", null);
  if (!o.ok) return o;
  const conv = await conversationParUuid(o.conversationUuid);
  if (!conv) return ERR("Conversation du projet introuvable.");
  { const refus = await refusSiTacheActive(conv.id, "L'agent du projet a déjà une tâche en cours : attends qu'elle finisse."); if (refus) return refus; }
  if (conv.propositionId != null) {
    const [courante] = await db.select({ statut: propositions.statut }).from(propositions).where(eq(propositions.id, conv.propositionId));
    if (courante && (courante.statut === "prete" || courante.statut === "en_generation")) {
      return ERR("La conversation du projet a une proposition en attente de revue : applique-la ou rejette-la d'abord.");
    }
  }
  const consigne = (options.consigne ?? "").trim() || CONSIGNE_PROMPTS_CREES;
  const lot = await poserLotPrompts(source.projectId, aEcrire, { consigne, conv });
  if (!lot.ok) return lot;
  return { ok: true, conversationUuid: conv.uuid, propositionUuid: lot.propositionUuid, nbSousTaches: lot.nbSousTaches };
}

/** The proposals whose asset creations then wait for their prompts. */
const SKILLS_CREANT_DES_ASSETS = ["fiches", "inventaire-assets", SKILL_REFERENCES_PLAN, SKILL_ASSETS_MANQUANTS];

/** The image prompts of these assets (a clip's preparation, wave 4a): a DETACHED `prompt-asset` batch (without conversation: it neither replaces nor
 * rejects the proposal under review in the project's conversation, and does not wait for it to be free). Its tasks carry the request (`demandeId`): the
 * request's line follows them in the panel, they go before background work. The request applies the batch itself. Only assets without a
 * prompt are taken. */
export async function genererPromptsAssets(
  projectId: number,
  assetIds: number[],
  options: { demandeId?: number; consigne?: string } = {},
): Promise<Resultat<{ propositionUuid: string; nbSousTaches: number }>> {
  if (assetIds.length === 0) return ERR("Aucun asset à décrire.");
  const lus = await db
    .select({ id: assets.id, code: assets.code, type: assets.type, prompt: assets.promptGeneration })
    .from(assets)
    .where(and(eq(assets.projectId, projectId), inArray(assets.id, assetIds)))
    .orderBy(asc(assets.code));
  const aEcrire = lus.filter((a) => !(a.prompt ?? "").trim());
  if (aEcrire.length === 0) return ERR("Aucun de ces assets n'attend son prompt.");
  return poserLotPrompts(projectId, aEcrire, { consigne: (options.consigne ?? "").trim() || CONSIGNE_PROMPTS_CREES, demandeId: options.demandeId });
}

/** The `prompt-asset` batch itself: attached to the project's conversation (`conv`, current proposal) or detached (`conv` absent). */
async function poserLotPrompts(
  projectId: number,
  aEcrire: { id: number; code: string }[],
  o: { consigne: string; conv?: ConversationRow; demandeId?: number },
): Promise<Resultat<{ propositionUuid: string; nbSousTaches: number }>> {
  const sousTaches: { code: string; e: EntreeSkill }[] = [];
  for (const a of aEcrire) {
    const e = await entreePromptAsset(db, projectId, a.id, o.consigne);
    if (e) sousTaches.push({ code: a.code, e });
  }
  if (sousTaches.length === 0) return ERR("Aucun asset lisible.");
  const contexte = [{ type: "registre" as const, libelle: `${sousTaches.length} asset${sousTaches.length > 1 ? "s" : ""} sans prompt, un par un` }];
  let propId: number;
  if (o.conv) propId = await nouvelleProposition(o.conv, { skill: "prompts-assets", consigne: o.consigne, contexte, lot: true });
  else {
    const [p] = await db.insert(propositions).values({ conversationId: null, projectId, skill: "prompts-assets", portee: "projet", cibleId: null, consigne: o.consigne, contexte, lot: true }).returning({ id: propositions.id });
    propId = p!.id;
  }
  for (const { code, e } of sousTaches) {
    await creerRun(db, {
      skill: "prompt-asset",
      entree: e.entree,
      but: "proposition",
      projectId,
      conversationId: o.conv?.id ?? null,
      propositionId: propId,
      cleSousTache: cleSousTacheAsset(code),
      libelleSousTache: code,
      options: e.variante ? { variante: e.variante } : null,
      demandeId: o.demandeId,
    });
  }
  const [prop] = await db.select({ uuid: propositions.uuid }).from(propositions).where(eq(propositions.id, propId));
  return { ok: true, propositionUuid: prop!.uuid, nbSousTaches: sousTaches.length };
}

/** Re-runs ONE subtask of a batch (failed, cancelled, or to redo), with an optional
 * free-form feedback. Its old changes stay until the new reply replaces them;
 * the other subtasks do not move. */
export async function relancerSousTache(propositionUuid: string, cle: string, retour?: string): Promise<Resultat<{ runUuid: string }>> {
  const prop = await propositionParUuid(propositionUuid);
  if (!prop) return ERR("Proposition introuvable.");
  if (!prop.lot) return ERR("Cette proposition n'est pas un lot.");
  if (prop.statut !== "prete" && prop.statut !== "en_generation" && prop.statut !== "echouee") return ERR("Cette proposition est close : plus de relance possible.");
  const sous = dernieresSousTaches(await runsDuLot(db, prop.id)).find((x) => x.run.cle === cle);
  if (!sous) return ERR("Sous-tâche introuvable.");
  if (estRunActif(sous.run)) return ERR("Cette sous-tâche est déjà en file ou en cours.");
  let cible: { skill: string; entree: object; options: { variante?: string; [cle: string]: unknown } | null };
  const codeAsset = codeDeCleAsset(cle);
  const planUuid = planUuidDeCle(cle);
  if (planUuid) {
    // Batch of sheets (Open H3 IR): the subtask is re-run with the same input (the brief is re-read at run time).
    const [ancien] = await db.select({ entree: agentRuns.entree }).from(agentRuns).where(eq(agentRuns.id, sous.run.id));
    cible = { skill: SKILL_H3IR, entree: (ancien?.entree as object | null) ?? { planUuid }, options: null };
  } else if (codeAsset && prop.skill === "prompts-assets") {
    // Prompts of the assets created by the sheets: the asset exists, we start from it (and from its parent).
    const [a] = await db.select({ id: assets.id }).from(assets).where(and(eq(assets.projectId, prop.projectId), eq(assets.code, codeAsset)));
    const e = a ? await entreePromptAsset(db, prop.projectId, a.id, prop.consigne || CONSIGNE_PROMPTS_CREES, retour?.trim() || undefined) : null;
    if (!e) return ERR("L'asset n'existe plus.");
    cible = { skill: "prompt-asset", entree: e.entree, options: e.variante ? { variante: e.variante } : null };
  } else if (codeAsset) {
    const cand = (await candidatsDuProjet(prop.projectId)).find((c) => c.code === codeAsset);
    if (!cand) return ERR("Cet asset n'est plus décrit par le brief.");
    const e = await entreePromptAssetCandidat(db, prop.projectId, cand, prop.consigne || CONSIGNE_REGISTRE, retour?.trim() || undefined);
    if (!e) return ERR("L'asset n'existe plus.");
    cible = { skill: "prompt-asset", entree: e.entree, options: e.variante ? { variante: e.variante } : null };
  } else if (groupeInventaireDeCle(cle) != null && prop.skill === "inventaire-assets") {
    // A scene group of a split inventory: the same input and the same options (clip handles, following groups), with the assets that
    // the OTHER groups now propose.
    const [ancien] = await db.select({ entree: agentRuns.entree, options: agentRuns.options }).from(agentRuns).where(eq(agentRuns.id, sous.run.id));
    const autres = (await assetsACreer(db, prop.id, { saufSousTache: cle })).map((a) => ({ code: a.code, type: a.type, description: a.description }));
    const entree = { ...((ancien?.entree as object | null) ?? {}), assetsDejaProposes: autres, ...(retour?.trim() ? { retourUtilisateur: retour.trim() } : {}) };
    cible = { skill: "inventaire-assets", entree, options: (ancien?.options as { [cle: string]: unknown } | null) ?? null };
  } else {
    const sceneId = sceneIdDeCle(cle);
    const episodeId = episodeIdDeCle(cle);
    if (sceneId != null) {
      // A screenplay scene: its treatment as it is now, with the free-form feedback.
      const entree = await entreeScenarioScene(db, prop.projectId, sceneId, prop.consigne || CONSIGNE_SCENARIO, { retour: retour?.trim() || undefined });
      if (!entree) return ERR("La scène n'existe plus ou n'a plus de traitement.");
      cible = { skill: "scenario-scene", entree: entree.entree, options: null };
    } else if (episodeId == null) {
      return ERR("Sous-tâche non relançable.");
    } else if (prop.skill === "traitements") {
      const entree = await entreeTraitement(db, prop.projectId, episodeId, prop.consigne || CONSIGNE_TRAITEMENT, { retour: retour?.trim() || undefined });
      if (!entree) return ERR("L'épisode n'existe plus.");
      cible = { skill: "traitement-episode", entree: entree.entree, options: null };
    } else if (prop.skill === "relectures") {
      // Review: the episode as it is now (its clips may have changed since), with the free-form feedback.
      const r = await entreeRelecture(db, prop.projectId, episodeId, prop.consigne || CONSIGNE_RELECTURE, { retour: retour?.trim() || undefined });
      if (!r) return ERR("L'épisode n'existe plus ou n'a plus de plan.");
      cible = { skill: "relecture-scenario", entree: r.entree, options: { planUuids: r.planUuids } };
    } else {
      const entree = await entreeScenarioEpisode(db, prop.projectId, episodeId, prop.consigne || CONSIGNE_SCENARIO, { retour: retour?.trim() || undefined });
      if (!entree) return ERR("L'épisode n'existe plus.");
      cible = { skill: "scenario-episode", entree: entree.entree, options: null };
    }
  }

  const run = await creerRun(db, {
    skill: cible.skill,
    entree: cible.entree,
    options: cible.options,
    but: "proposition",
    projectId: prop.projectId,
    conversationId: prop.conversationId,
    propositionId: prop.id,
    cleSousTache: cle,
    libelleSousTache: sous.run.libelle,
  });
  await db.update(propositions).set({ statut: "en_generation", erreur: null }).where(eq(propositions.id, prop.id));
  if (prop.conversationId != null) {
    await db.update(agentConversations).set({ etape: "proposition", propositionId: prop.id, updatedAt: new Date() }).where(eq(agentConversations.id, prop.conversationId));
  }
  return { ok: true, runUuid: run.uuid };
}

export async function appliquerSelection(propositionUuid: string, options: Parameters<typeof appliquerProposition>[1] = {}): Promise<ResultatApplication> {
  const prop = await propositionParUuid(propositionUuid);
  if (!prop) return { ok: false, erreur: "Proposition introuvable." };
  // Asset inventory: the clip references that cite an asset created by the proposal are written in the same transaction, AFTER the
  // creations (lib/agents/inventory-db.ts). Those that cited only existing assets were already written by the post-processing.
  // Choice of a clip's references (preparation, wave 4a): the missing assets are created, then the skill's references (them included) are written onto the
  // clip in the same transaction.
  if (prop.skill === SKILL_REFERENCES_PLAN) {
    const suite = options.dansTransaction;
    return appliquerProposition(prop.id, {
      ...options,
      dansTransaction: async (tx) => {
        await ecrireReferencesDuSkill(tx, prop.id, prop.runId);
        if (suite) await suite(tx);
      },
    });
  }
  if (prop.skill === "inventaire-assets") {
    const suite = options.dansTransaction;
    return appliquerProposition(prop.id, {
      ...options,
      dansTransaction: async (tx) => {
        await ecrireReferencesApresApplication(tx, prop.id);
        if (suite) await suite(tx);
      },
    });
  }
  return appliquerProposition(prop.id, options);
}

