import { and, asc, count, eq, inArray, isNull, ne } from "drizzle-orm";
import { horsAffiches } from "../assets-visibles";
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
import { VARIANTE_AFFICHE } from "../llm/variantes";
import { contexteTotalDepuisEnv } from "../llm/budget-contexte";
import { chargerSkill } from "../llm/skills";
import { budgetInventaire, cleSousTacheInventaire, decouperInventaire, groupeInventaireDeCle, type OptionsRunInventaire } from "./inventaire";
import { assetsACreer, ecrireReferencesApresApplication } from "./inventaire-db";
import { SCHEMA_BRIEF, SECTIONS_FIGEES_PAR_LA_CONCEPTION, estCleSection, sousSchemaSection } from "./brief";
import { abandonnerBrouillon, creerBriefPartiel, ecrireBrouillon, synchroniserClauseStyle } from "./brief-db";
import { accrocheEntretien } from "./accroche";
import { choixActif, formulerReponse, selectionValide } from "./choix";
import { entreeNotes, ficheVersBrief, type Fiche } from "./fiche";
import { lireConception, ouvertureConcue } from "../conception-db";
import { ficheCourante } from "./fiche-db";
import type { BriefContenu, CibleDemandee, EpisodePourScenario, MessageConversation, PlaceScene, Portee, Position, Profondeur, Resultat, StatutChamp } from "./types";
import { PORTEES } from "./types";
import { controleDuree } from "./applicateurs/plan";
import { cocheParDefaut, groupeAffiche, raisonNonCochable } from "./cochage";
import { TYPE_AFFICHE } from "../affiches";
import { entreePromptAffiche } from "./affiche";
import { entreeCorrectionPlan, entreeRelecture, entreePromptAsset, entreePromptAssetCandidat, entreeScenarioEpisode, entreeScenarioScene, entreeTraitement, lireBriefDuProjet, type EntreeSkill } from "./contexte";
import { SEUIL_TRAITEMENT_SECONDES } from "./traitement";
import { DUREE_GENERATION_MAX, DUREE_GENERATION_MIN } from "../plan-checks";
import { candidatsRegistre, cleSousTacheAsset, codeDeCleAsset, type CandidatRegistre } from "./registre";
import { annulerLot, annulerRunsDePropositions, runsDuLot, type ResultatAnnulationLot } from "./lots";
import { cleSousTacheEpisode, cleSousTacheScene, dernieresSousTaches, episodeIdDeCle, estRunActif, sceneIdDeCle } from "./lots-pur";
import { appliquerProposition, enregistrerChangements } from "./proposition-db";
import { creerRun, tacheBloquante, type ButRun, type TacheBloquante } from "./runs";
import { squeletteDepuisBrief } from "./squelette";
import type { Avertissement, ResultatApplication } from "./types";
import { entreeIterationPlan, entreeInventaire, entreePlanH3, entreeReferencesPlan, etatIterationPlan } from "./contexte";
import { SKILL_REFERENCES_PLAN } from "./references-plan";
import { SKILL_ASSETS_MANQUANTS, brutsManquants, type ManquantRetenu } from "../h3ir/preparation";
import { ecrireReferencesDuSkill } from "../h3ir/preparation-db";
import { cleSousTachePlan, planUuidDeCle } from "./fiches";
import type { ContexteUtilise, EtatIterationPlan, PlanPourFiche } from "./types";
import { SKILL_H3IR, type EntreeH3ir } from "../h3ir/resultat";
import { referencesApresDecisions } from "../h3ir/brief-plan";
import { estCreativite, styleCameraOuNull } from "../h3ir/reglages";
import type { DecisionsIteration } from "./types";
import type { ChoixMoteur, DemandeMoteur } from "../h3ir/moteur";
import { resoudreMoteursFiches } from "../h3ir/moteur-db";
import { jobs, planPromptSections, planRefs } from "../../db/schema";
import { isNotNull, sql } from "drizzle-orm";

/** Logique serveur du système d'agents : conversations, brief, propositions. Aucune dépendance à
 * Next (les actions de app/agents/actions.ts n'en sont que des enveloppes) : le script
 * d'essai et les tests l'appellent directement. Voir app/agents/actions.ts pour le contrat. */

const ERR = (erreur: string) => ({ ok: false as const, erreur });

/** Refus « une tâche est déjà en cours » : il NOMME la tâche qui bloque (et la renvoie) pour que la fenêtre
 * propose de l'annuler, au lieu d'un message sans prise (une tâche restée en attente bloque toute la conversation). */
async function refusSiTacheActive(conversationId: number, message: string, buts?: ButRun[]) {
  const t = await tacheBloquante(conversationId, buts);
  if (!t) return null;
  const quoi = `${t.libelle ?? t.skill}, ${t.statut === "en_cours" ? "en cours" : "en attente"}`;
  return { ok: false as const, erreur: `${message} Tâche en cause : ${quoi}.`, bloquante: t as TacheBloquante };
}
const MAX_MESSAGE = 20_000;

// --- cibles -----------------------------------------------------------------

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

/** Libellé lisible d'une cible déjà résolue (id interne). */
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
/** L'agent ouvre l'entretien d'entrée (conversation complète) : trois pistes très différentes pour qui n'a pas d'idée (accroche.ts). */
const messagesInitiaux = (p: Profondeur): MessageConversation[] => (p === "complete" ? [{ role: "assistant", content: accrocheEntretien(), at: new Date().toISOString() }] : []);
/** L'ouverture d'une conversation : pour l'entretien d'entrée d'un projet CONÇU (conception.ts), la fiche préremplie et, à la place du premier
 * message, la demande d'accroche au modèle (`entreeAccroche`, tâche posée par `lancerAccroche` une fois la conversation créée) ; sinon
 * l'accroche à trois pistes, fiche vide. */
async function ouverture(projectId: number, portee: Portee, p: Profondeur): Promise<{ messages: MessageConversation[]; fiche: Fiche | null; entreeAccroche: object | null }> {
  if (portee === "projet" && p === "complete") {
    const o = await ouvertureConcue(db, projectId);
    if (o) return { messages: [], fiche: o.fiche, entreeAccroche: o.entreeAccroche };
  }
  return { messages: messagesInitiaux(p), fiche: null, entreeAccroche: null };
}

/** Pose la tâche qui écrit l'accroche du scénariste (skill `accroche-scenariste`) : une tâche « tour », que l'interface affiche comme
 * une réponse en cours. Une seule fois par conversation ; `relancerAccroche` sert si elle a échoué. */
async function lancerAccroche(conversationId: number, projectId: number, entree: object) {
  await creerRun(db, { skill: "accroche-scenariste", entree, but: "tour", projectId, conversationId });
}
const profondeurParDefaut = (portee: Portee): Profondeur => (portee === "projet" ? "complete" : "courte");

type ConversationRow = typeof agentConversations.$inferSelect;

/** La conversation du (projet, portée, cible). */
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

/** Arrête ce qui tourne pour une conversation : les tâches en attente sont annulées, celles en
 * cours reçoivent le drapeau d'annulation (le worker coupe la connexion), les propositions en
 * génération sont rejetées. */
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

export async function nouvelleConversation(projectId: number, portee: Portee, cible: CibleDemandee | null, profondeur?: Profondeur): Promise<Resultat<{ conversationUuid: string }>> {
  const r = await resoudreCible(projectId, portee, cible);
  if ("erreur" in r) return ERR(r.erreur);
  const existante = await trouver(projectId, portee, r.cibleId);
  if (existante) {
    await arreterTravaux(existante.id);
    if (portee === "projet") await abandonnerBrouillon(db, projectId);
    await db.delete(agentConversations).where(eq(agentConversations.id, existante.id)); // propositions : conversation_id → null
  }
  const p = profondeur ?? existante?.profondeur ?? profondeurParDefaut(portee);
  const ouv = await ouverture(projectId, portee, p as Profondeur);
  const [c] = await db
    .insert(agentConversations)
    .values({ projectId, portee, cibleId: r.cibleId, profondeur: p, etape: etapeInitiale(p as Profondeur), messages: ouv.messages, fiche: ouv.fiche })
    .returning({ uuid: agentConversations.uuid });
  await lancerAccrocheSiConcu(c!.uuid, projectId, ouv.entreeAccroche);
  return { ok: true, conversationUuid: c!.uuid };
}

async function lancerAccrocheSiConcu(conversationUuid: string, projectId: number, entree: object | null) {
  if (!entree) return;
  const conv = await conversationParUuid(conversationUuid);
  if (conv) await lancerAccroche(conv.id, projectId, entree);
}

/** Relance l'accroche du scénariste quand sa première écriture a échoué (la conversation n'a alors aucun message). Refusé dès qu'un message
 * existe ou qu'une tâche tourne : l'accroche ne se régénère jamais pour le plaisir. */
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

export async function reinitialiser(conversationUuid: string): Promise<Resultat> {
  const conv = await conversationParUuid(conversationUuid);
  if (!conv) return ERR("Conversation introuvable.");
  await arreterTravaux(conv.id);
  if (conv.portee === "projet") await db.delete(briefs).where(and(eq(briefs.projectId, conv.projectId), eq(briefs.statut, "brouillon")));
  const ouv = await ouverture(conv.projectId, conv.portee as Portee, conv.profondeur as Profondeur);
  await db
    .update(agentConversations)
    .set({ messages: ouv.messages, consigne: "", briefPret: false, resteADefinir: [], fiche: ouv.fiche, propositionId: null, etape: etapeInitiale(conv.profondeur as Profondeur), updatedAt: new Date() })
    .where(eq(agentConversations.id, conv.id));
  if (ouv.entreeAccroche) await lancerAccroche(conv.id, conv.projectId, ouv.entreeAccroche);
  return { ok: true };
}

/** Réponse par cartes : le texte envoyé est formulé ici depuis les libellés retenus (jamais depuis le client), et seules les cartes du
 * DERNIER message de l'agent répondent encore. */
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
  // Un tour OU l'écriture du briefing (la première version part seule, et vaut qu'on l'attende) bloquent l'envoi.
  { const refus = await refusSiTacheActive(conv.id, "L'agent est déjà en train de répondre : attends sa réponse.", ["tour", "brief"]); if (refus) return refus; }

  const messages = [...((conv.messages as MessageConversation[]) ?? []), { role: "user" as const, content: message, at: new Date().toISOString(), ...(choisis ? { choisis } : {}) }];
  const run = await db.transaction(async (tx) => {
    await tx.update(agentConversations).set({ messages, briefPret: false, etape: "conversation", updatedAt: new Date() }).where(eq(agentConversations.id, conv.id));
    // D'abord les notes (un appel court qui rend un patch de la fiche) : à son retour, le worker applique le patch et pose le tour
    // de l'agent, avec la fiche à jour et ce qui reste à demander (worker/agents/postTraitement.ts, postNotes).
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

  // Aucun appel au modèle : le brief se remplit au fil de la conversation (la fiche de notes). « Passer au briefing » ne fait que
  // figer la fiche telle qu'elle est en brouillon, même incomplète (ce que l'utilisateur n'a pas dit reste « déduit » ou vide).
  const [projet] = await db.select({ nom: projects.nom }).from(projects).where(eq(projects.id, conv.projectId));
  const genere = ficheVersBrief(await ficheCourante(db, conv), projet?.nom ?? "");
  await db.transaction(async (tx) => {
    await ecrireBrouillon(tx, conv.projectId, { contenu: genere.contenu, statuts: genere.statuts as Record<string, StatutChamp> });
    await tx.update(agentConversations).set({ etape: "brief", updatedAt: new Date() }).where(eq(agentConversations.id, conv.id));
  });
  return { ok: true };
}

/** Abandonne le brouillon de brief et revient à l'étape conversation (conversation conservée). Un
 * brief VALIDÉ ne se rejette pas : on le modifie section par section. */
export async function rejeterBrief(conversationUuid: string): Promise<Resultat> {
  const conv = await conversationParUuid(conversationUuid);
  if (!conv) return ERR("Conversation introuvable.");
  if (conv.profondeur !== "complete") return ERR("Il n'y a pas de brief dans une conversation courte.");
  const [b] = await db.select({ id: briefs.id, statut: briefs.statut }).from(briefs).where(eq(briefs.projectId, conv.projectId));
  if (b?.statut === "valide") return ERR("Le brief est validé : modifie-le section par section.");
  // Une génération de brief ou de proposition en cours n'a plus d'objet : on l'arrête.
  await db
    .update(agentRuns)
    .set({ statut: "annulee", finishedAt: new Date() })
    .where(and(eq(agentRuns.conversationId, conv.id), eq(agentRuns.statut, "en_attente"), inArray(agentRuns.but, ["brief", "proposition"])));
  await db
    .update(agentRuns)
    .set({ annulationDemandeeAt: new Date() })
    .where(and(eq(agentRuns.conversationId, conv.id), eq(agentRuns.statut, "en_cours"), inArray(agentRuns.but, ["brief", "proposition"])));
  await db
    .update(propositions)
    .set({ statut: "rejetee" })
    .where(and(eq(propositions.conversationId, conv.id), inArray(propositions.statut, ["en_generation", "prete"])));
  if (b) await abandonnerBrouillon(db, conv.projectId); // le brief partiel (style, notes) n'est jamais touché
  await db
    .update(agentConversations)
    .set({ etape: "conversation", briefPret: false, propositionId: null, updatedAt: new Date() })
    .where(eq(agentConversations.id, conv.id));
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
  // Un projet sans brief : la première édition à la main crée un brief PARTIEL (style, notes…),
  // la source de la clause de style même quand l'agent n'a encore rien rédigé.
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
    await synchroniserClauseStyle(tx, projectId); // sans effet sur un brouillon : pas encore la référence
    // Le titre du film est celui du PROJET : le corriger dans le brief renomme le projet (un seul nom, partout).
    if (section === "titre" && typeof valeur === "string" && valeur.trim()) await tx.update(projects).set({ nom: valeur.trim() }).where(eq(projects.id, projectId));
  });
  return { ok: true };
}

// --- proposition ------------------------------------------------------------

async function nouvelleProposition(conv: ConversationRow, p: { skill: string; consigne: string; contexte: unknown[]; parentId?: number | null; retour?: string | null; lot?: boolean }): Promise<number> {
  // Une seule proposition courante : la précédente, si elle attend encore, est rejetée — et si
  // elle est encore en génération, ses tâches (un lot en a plusieurs) sont arrêtées.
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

/** `sceneId` : la scène où atterrit le plan inséré, quand l'appelant la connaît (une scène vide n'a pas de plan voisin pour la déduire). */
async function entreePourConversation(conv: ConversationRow, consigne: string, position?: Position, retour?: string, sceneId?: number, place?: PlaceScene): Promise<{ entree: EntreeSkill; options: Record<string, unknown> } | { erreur: string }> {
  const cibleId = conv.cibleId;
  if (conv.portee === "asset" && cibleId != null) {
    // L'affiche d'un projet ou d'un épisode est un asset caché : le skill `prompt-asset`, variante `affiche`, même parcours de revue.
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

  // Écrire les scénarios depuis le projet : un LOT (une sous-tâche par épisode).
  if (conv.profondeur === "courte" && (conv.portee === "projet")) {
    const r = await genererScenarios(conversationUuid, { consigne: options.consigne });
    return r.ok ? { ok: true, propositionUuid: r.propositionUuid, runUuid: null } : r;
  }

  // Profondeur complète : le squelette se construit en code depuis le brief.
  if (conv.profondeur === "complete") {
    const [brief] = await db.select().from(briefs).where(eq(briefs.projectId, conv.projectId));
    if (!brief || brief.statut === "partiel") return ERR("Génère d'abord le brief.");
    const lignesEps = await db
      .select({ id: episodes.id, numero: episodes.numero, titre: episodes.titre, resume: episodes.resume })
      .from(episodes)
      .where(eq(episodes.projectId, conv.projectId));
    // Un épisode « vide » (ni plan, ni scène, ni résumé) est réutilisé par le squelette plutôt
    // que doublé : un film naît déjà avec son épisode.
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

  // Un épisode sans consigne ni position : « écris son scénario » (le cas normal d'un épisode vide).
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

/** Une proposition « en génération » dont la tâche a échoué ou été annulée n'attend plus rien :
 * son statut est rattrapé ici (reprise du worker, annulation depuis le header…). */
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

export async function cocherChangement(changementId: number, coche: boolean): Promise<Resultat> {
  const [c] = await db.select().from(propositionChangements).where(eq(propositionChangements.id, changementId));
  if (!c) return ERR("Changement introuvable.");
  const [prop] = await db.select({ statut: propositions.statut }).from(propositions).where(eq(propositions.id, c.propositionId));
  if (prop?.statut !== "prete") return ERR("Cette proposition n'est plus modifiable.");
  if (coche) {
    const raison = raisonNonCochable({ avertissements: (c.avertissements ?? []) as Avertissement[], refuseRaison: c.refuseRaison });
    if (raison) return ERR(raison);
  }
  await db.update(propositionChangements).set({ coche }).where(eq(propositionChangements.id, changementId));
  return { ok: true };
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

export async function corrigerChangement(changementId: number, valeurs: { dureeGenerationSecondes?: number }): Promise<Resultat> {
  const [c] = await db.select().from(propositionChangements).where(eq(propositionChangements.id, changementId));
  if (!c) return ERR("Changement introuvable.");
  if (c.cibleType !== "plan") return ERR("Seul un plan se corrige sur place.");
  if (valeurs.dureeGenerationSecondes === undefined) return ERR("Rien à corriger.");
  const w = controleDuree(valeurs.dureeGenerationSecondes);
  if (w) return ERR(w.texte);
  const apres = { ...((c.apres ?? {}) as Record<string, unknown>), dureeGenerationSecondes: valeurs.dureeGenerationSecondes };
  const avertissements = ((c.avertissements ?? []) as Avertissement[]).filter((a) => a.type !== "bloque_controle");
  await db
    .update(propositionChangements)
    .set({
      apres,
      avertissements,
      coche: cocheParDefaut({ operation: c.operation as "creer" | "modifier" | "supprimer", avertissements, ecrase: c.ecrase, refuseRaison: c.refuseRaison }),
    })
    .where(eq(propositionChangements.id, changementId));
  return { ok: true };
}

export async function rejeter(propositionUuid: string): Promise<Resultat> {
  const prop = await propositionParUuid(propositionUuid);
  if (!prop) return ERR("Proposition introuvable.");
  if (prop.statut !== "prete" && prop.statut !== "en_generation" && prop.statut !== "echouee") return ERR("Cette proposition est déjà close.");
  if (prop.statut === "en_generation" && prop.runId != null) {
    await db.update(agentRuns).set({ statut: "annulee", finishedAt: new Date() }).where(and(eq(agentRuns.id, prop.runId), eq(agentRuns.statut, "en_attente")));
    await db.update(agentRuns).set({ annulationDemandeeAt: new Date() }).where(and(eq(agentRuns.id, prop.runId), eq(agentRuns.statut, "en_cours")));
  }
  if (prop.lot) await annulerRunsDePropositions(db, [prop.id]);
  await db.update(propositions).set({ statut: "rejetee" }).where(eq(propositions.id, prop.id));
  if (prop.conversationId != null) {
    const [conv] = await db.select().from(agentConversations).where(eq(agentConversations.id, prop.conversationId));
    if (conv && conv.propositionId === prop.id) {
      await db
        .update(agentConversations)
        .set({ propositionId: null, etape: conv.profondeur === "complete" ? (prop.lot ? "applique" : "brief") : "consigne", updatedAt: new Date() })
        .where(eq(agentConversations.id, conv.id));
    }
  }
  return { ok: true };
}

export async function affiner(propositionUuid: string, retour: string): Promise<Resultat<{ propositionUuid: string; runUuid: string }>> {
  const parent = await propositionParUuid(propositionUuid);
  if (!parent) return ERR("Proposition introuvable.");
  const texte = retour.trim();
  if (!texte) return ERR("Dis ce qu'il faut changer.");
  if (parent.skill === "squelette") return ERR("Le squelette se construit depuis le brief : corrige le brief, puis régénère la proposition.");
  if (parent.lot) return ERR("Un lot ne s'affine pas en bloc : relance la sous-tâche qui ne convient pas, avec ton retour.");
  if (parent.conversationId == null) return ERR("La conversation de cette proposition n'existe plus.");
  const [conv] = await db.select().from(agentConversations).where(eq(agentConversations.id, parent.conversationId));
  if (!conv) return ERR("La conversation de cette proposition n'existe plus.");
  if (parent.runId == null) return ERR("Cette proposition n'a pas de tâche à rejouer.");
  const [runParent] = await db.select().from(agentRuns).where(eq(agentRuns.id, parent.runId));
  if (!runParent) return ERR("La tâche d'origine est introuvable.");
  { const refus = await refusSiTacheActive(conv.id, "Une tâche de l'agent est déjà en cours sur cette conversation."); if (refus) return refus; }

  const optionsParent = (runParent.options ?? null) as { modele?: string; variante?: string; position?: Position; sceneVoisineId?: number | null; place?: PlaceScene } | null;
  const entree = {
    ...(runParent.entree as Record<string, unknown>),
    retourUtilisateur: texte,
    propositionPrecedente: runParent.resultat ?? null,
  };
  // Une proposition d'affiche écrite avant la fusion porte encore l'ancien skill `prompt-affiche` : elle se rejoue en variante `affiche` de `prompt-asset`.
  const ancienneAffiche = parent.skill === "prompt-affiche";
  const skillRejoue = ancienneAffiche ? "prompt-asset" : parent.skill;
  const propId = await nouvelleProposition(conv, { skill: skillRejoue, consigne: parent.consigne, contexte: (parent.contexte as unknown[]) ?? [], parentId: parent.id, retour: texte });
  const run = await creerRun(db, { skill: skillRejoue, entree, but: "proposition", projectId: conv.projectId, conversationId: conv.id, propositionId: propId, options: ancienneAffiche ? { ...optionsParent, variante: VARIANTE_AFFICHE } : optionsParent });
  await db.update(propositions).set({ runId: run.id }).where(eq(propositions.id, propId));
  const [nouvelle] = await db.select({ uuid: propositions.uuid }).from(propositions).where(eq(propositions.id, propId));
  return { ok: true, propositionUuid: nouvelle!.uuid, runUuid: run.uuid };
}

// --- scénarios d'épisodes : un LOT (une sous-tâche par épisode) -------------------

const CONSIGNE_SCENARIO = "Écris le scénario complet de cet épisode.";

/** Les épisodes d'un projet proposables à l'écriture de leur scénario, dans
 * l'ordre, avec ce qu'ils contiennent déjà : « vide » = ni plan ni scène (le squelette tout juste
 * appliqué). */
export async function episodesPourScenarios(projectId: number): Promise<EpisodePourScenario[]> {
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

/** « Écrire les scénarios » depuis le projet : une proposition EN LOT, une sous-tâche
 * (une tâche `scenario-episode`) par épisode choisi, exécutées l'une après l'autre dans la file. Par
 * défaut, les épisodes VIDES ; `episodeIds` choisit (et permet de réécrire un épisode qui a du
 * contenu : ses modifications vont alors en section d'écrasement, décochées). Un échec isolé ne
 * perd pas le reste (relançable). */
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
  // Par défaut : les épisodes vides, et ceux dont le traitement attend ses scènes (créées par l'étape « traitement », sans plan).
  const voulus = options.episodeIds ?? (await Promise.all(dispo.map(async (e) => (e.vide || (await scenesATraiter(e.id)).length > 0 ? e.id : null)))).filter((id): id is number => id != null);
  if (voulus.length === 0) return ERR("Tous les épisodes ont déjà du contenu : choisis ceux à (ré)écrire.");
  const choisis = dispo.filter((e) => voulus.includes(e.id));
  if (choisis.length !== new Set(voulus).size) return ERR("Un des épisodes choisis n'est pas dans cette portée.");

  const consigne = (options.consigne ?? "").trim() || CONSIGNE_SCENARIO;
  // Un épisode dont le traitement est écrit (des scènes, chacune avec son traitement, sans plan) s'écrit SCÈNE PAR SCÈNE : une sous-tâche par scène,
  // en parallèle. Les autres s'écrivent d'un seul tenant, comme avant.
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

/** Les scènes d'un épisode qui ont leur traitement et pas encore de plan, dans l'ordre (rang 1, 2…) : à écrire scène par scène. Vide dès qu'une scène n'a pas de
 * traitement ou qu'une a déjà des plans : l'épisode s'écrit alors d'un seul tenant (voir `genererScenarios`). */
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

/** Étape E : le TRAITEMENT d'un épisode, avant ses plans. Un LOT d'une sous-tâche par épisode (un seul épisode pour un film), qui crée les scènes avec leur
 * traitement. Ne concerne que les épisodes VIDES et assez longs pour valoir un découpage (`SEUIL_TRAITEMENT_SECONDES`) : un film court s'écrit d'un seul tenant. */
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

/** Relecture des scénarios (FRICTIONS 2026-10-19) : une passe du modèle qui réfléchit sur chaque épisode ÉCRIT, après les scénarios et l'inventaire, AVANT les
 * fiches de plan. Un LOT comme les scénarios (une tâche `relecture-scenario` par épisode qui a des plans) : un échec isolé ne perd pas le reste. Les corrections
 * sont des changements de plan (description, liaison, durée, suppression d'un doublon, plan de résolution ajouté) à relire et appliquer comme toute proposition. */
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

/** Les masters que le brief décrit (personnages, lieux), avec ce qui existe déjà dans le registre.
 * Vide tant que le projet n'a pas de brief rédigé. */
export async function candidatsDuProjet(projectId: number): Promise<CandidatRegistre[]> {
  const brief = await lireBriefDuProjet(db, projectId);
  if (!brief || brief.statut === "partiel") return [];
  const existants = await db
    .select({ id: assets.id, code: assets.code, type: assets.type, description: assets.description, promptGeneration: assets.promptGeneration })
    .from(assets)
    .where(and(eq(assets.projectId, projectId), horsAffiches));
  return candidatsRegistre(brief.contenu, existants);
}

/** Étape 2 : « créer le registre d'assets » — UN lot de sous-tâches `prompt-asset`, une par master du
 * brief (personnage, lieu), l'une après l'autre. Chaque sous-tâche crée l'asset s'il n'existe pas
 * (description du brief + prompt) ou écrit le prompt d'un asset existant. Depuis le projet ou une
 * saison (les modifications d'assets existants ne passent que par la portée projet : le verrou
 * refuse le reste, avec sa raison). Les voix, accessoires, effets et sons ne sont PAS créés ici. */
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

/** Inventaire des assets : APRÈS les scénarios et le registre issu du brief, AVANT les fiches de plan. Un seul appel
 * (`inventaire-assets`) lit tous les plans, le registre et le brief, et propose les assets manquants (accessoires,
 * états d'un décor, effets) en une liste consolidée : les fiches s'appuient ensuite sur un registre qui existe, au
 * lieu d'inventer chacune ses assets (doublons). Depuis la conversation du PROJET ; sans prompt d'image (ils s'écrivent
 * ensuite, comme pour les assets créés par les fiches). */
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
  // L'inventaire rend aussi les références de chaque plan (2026-11-09). Un seul appel quand tout tient dans le budget (cas courant) ; un long film
  // est découpé en groupes de scènes consécutives (lib/agents/inventaire.ts, `decouperInventaire`), posés l'un après l'autre (chaque groupe voit
  // les assets que les précédents proposent : worker/agents/postTraitement.ts).
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

// --- étape 3 : les fiches de plan (plan-h3) ------------------------------------------

const CONSIGNE_FICHE = "Écris la fiche de plan complète.";
const CONSIGNE_PROMPTS_CREES =
  "Écris le prompt de génération de cet asset (image de référence) à partir de sa description canonique ; s'il dérive d'un parent, pars de lui quand c'est pertinent.";

/** Les plans d'une portée (projet, épisode ou un plan) proposables à l'écriture de leur fiche, dans
 * l'ordre de lecture, avec ce qu'ils ont déjà : sections remplies, références, rendu, répliques. Un plan
 * sans section remplie est « à écrire » (coché d'office) ; les autres, choisis, iront en écrasement. */
export async function plansPourFiches(projectId: number, portee: Portee, cibleId: number | null): Promise<PlanPourFiche[]> {
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
  // Le rang affiché est celui du plan dans SON épisode (F03 : une position, jamais un identifiant).
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

/** Étape 3 : COMPILER la fiche d'un plan (portée `plan` : une proposition simple) ou les fiches des plans d'un épisode ou du projet (un LOT : une
 * sous-tâche par plan, clé `plan:<uuid>`, l'une après l'autre dans la file). Par défaut, les plans SANS fiche ; `planUuids` choisit (et permet de
 * recompiler une fiche : elle ira dans la section « risque d'écrasement », décochée hors demande).
 *
 * MOTEUR (vague 4a, 2026-11-09, lib/h3ir/moteur.ts) : Open H3 IR SEUL (skill virtuel `plan-h3ir`, worker/h3ir.ts). Il compile depuis les références
 * posées sur le plan : un plan qui n'a pas encore ses références, ou dont une image manque, n'est PAS compilé ici (il doit d'abord être préparé :
 * lib/h3ir/preparation.ts, que les demandes « Générer la fiche » mènent, lib/demandes-db.ts). En lot, ces plans sont laissés de côté et nommés dans le
 * contexte ; seuls, ils sont refusés avec la raison. `moteur: "plan-h3"` (option interne) ou `CADENCE_MOTEUR_FICHE=plan-h3` : retour arrière d'urgence. */
export async function genererFiches(
  conversationUuid: string,
  options: { planUuids?: string[]; consigne?: string; /** Une consigne PAR plan (plan-h3 seulement : Open H3 IR compile la description). */ consignes?: Record<string, string>; /** La demande « Générer la fiche » qui pose cette tâche (plan seul). */ demandeId?: number;
    /** Le moteur (défaut : celui de l'application, Open H3 IR). `reglagesH3ir` : nombre de shots, style de mise en scène et créativité facultatifs (absents : ceux du plan, de sa scène ou du projet). */
    moteur?: DemandeMoteur; reglagesH3ir?: { shots?: number | null; director?: string | null; creativity?: string | null } } = {},
): Promise<Resultat<{ propositionUuid: string; nbSousTaches: number; runUuid?: string; moteurs: Record<string, ChoixMoteur>; nonPrets: string[] }>> {
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
  const moteurs = await resoudreMoteursFiches(conv.projectId, choisis.map((p) => p.uuid), options.moteur);
  const choixDe = (uuid: string): ChoixMoteur => moteurs.get(uuid) ?? { moteur: "h3ir", repli: null, attente: "état des références inconnu" };
  const entreeH3ir = (planUuid: string): EntreeH3ir => ({ planUuid, shots: options.reglagesH3ir?.shots ?? null, director: options.reglagesH3ir?.director ?? null, creativity: options.reglagesH3ir?.creativity ?? null });
  const moteursRendus = Object.fromEntries(moteurs);
  const nonPrets = choisis.filter((p) => choixDe(p.uuid).moteur === "h3ir" && choixDe(p.uuid).attente).map((p) => p.uuid);

  if (portee === "plan") {
    const plan = choisis[0]!;
    const choix = choixDe(plan.uuid);
    if (choix.moteur === "h3ir") {
      if (choix.attente) return ERR(`Open H3 IR ne peut pas encore compiler ce plan : ${choix.attente}. « Générer la fiche » prépare d'abord ses références et leurs images.`);
      const contexte: ContexteUtilise[] = [{ type: "plan", libelle: `Plan · ${plan.titre} (Open H3 IR)`, ref: plan.uuid }];
      const propId = await nouvelleProposition(conv, { skill: SKILL_H3IR, consigne: "Fiche de plan compilée par Open H3 IR.", contexte });
      const run = await creerRun(db, { skill: SKILL_H3IR, entree: entreeH3ir(plan.uuid), but: "proposition", projectId: conv.projectId, conversationId: conv.id, propositionId: propId, options: null, demandeId: options.demandeId });
      await db.update(propositions).set({ runId: run.id }).where(eq(propositions.id, propId));
      const [prop] = await db.select({ uuid: propositions.uuid }).from(propositions).where(eq(propositions.id, propId));
      return { ok: true, propositionUuid: prop!.uuid, nbSousTaches: 1, runUuid: run.uuid, moteurs: moteursRendus, nonPrets };
    }
    // plan-h3 IMPOSÉ (retour arrière d'urgence) : une proposition simple (« affiner » rejoue le skill avec le retour).
    const e = await entreePlanH3(db, conv.projectId, plan.uuid, consigne);
    if (!e) return ERR("Plan introuvable.");
    const contexte = [...e.contexte, { type: "plan" as const, libelle: "plan-h3 imposé (retour arrière d'urgence)" }];
    const propId = await nouvelleProposition(conv, { skill: "plan-h3", consigne, contexte });
    const run = await creerRun(db, { skill: "plan-h3", entree: e.entree, but: "proposition", projectId: conv.projectId, conversationId: conv.id, propositionId: propId, options: e.variante ? { variante: e.variante } : null, demandeId: options.demandeId });
    await db.update(propositions).set({ runId: run.id }).where(eq(propositions.id, propId));
    const [prop] = await db.select({ uuid: propositions.uuid }).from(propositions).where(eq(propositions.id, propId));
    return { ok: true, propositionUuid: prop!.uuid, nbSousTaches: 1, runUuid: run.uuid, moteurs: moteursRendus, nonPrets };
  }

  // Un LOT : une sous-tâche par plan prêt (Open H3 IR), ou par plan si plan-h3 est imposé.
  const plusieursEpisodes = new Set(choisis.map((p) => p.episodeId)).size > 1;
  const sousTaches: ({ p: PlanPourFiche; moteur: "plan-h3"; e: EntreeSkill } | { p: PlanPourFiche; moteur: "h3ir" })[] = [];
  for (const p of choisis) {
    const choix = choixDe(p.uuid);
    if (choix.moteur === "h3ir") {
      if (!choix.attente) sousTaches.push({ p, moteur: "h3ir" });
      continue;
    }
    const e = await entreePlanH3(db, conv.projectId, p.uuid, options.consignes?.[p.uuid]?.trim() || consigne);
    if (e) sousTaches.push({ p, moteur: "plan-h3", e });
  }
  if (sousTaches.length === 0) {
    return ERR(nonPrets.length ? `Aucun plan prêt à compiler : ${nonPrets.length} plan${nonPrets.length > 1 ? "s attendent" : " attend"} ses références ou leurs images (« Générer la fiche » les prépare).` : "Aucun plan lisible.");
  }
  const nbH3ir = sousTaches.filter((s) => s.moteur === "h3ir").length;
  const nbPlanH3 = sousTaches.length - nbH3ir;
  const premierPlanH3 = sousTaches.find((s): s is Extract<(typeof sousTaches)[number], { moteur: "plan-h3" }> => s.moteur === "plan-h3");
  const contexte: ContexteUtilise[] = [
    { type: "plan" as const, libelle: `${sousTaches.length} fiche${sousTaches.length > 1 ? "s" : ""} de plan à écrire, une par une` },
    {
      type: "plan" as const,
      libelle: [
        nbH3ir ? `${nbH3ir} compilée${nbH3ir > 1 ? "s" : ""} par Open H3 IR` : null,
        nbPlanH3 ? `${nbPlanH3} écrite${nbPlanH3 > 1 ? "s" : ""} par plan-h3 (imposé : retour arrière d'urgence)` : null,
        nonPrets.length ? `${nonPrets.length} laissé${nonPrets.length > 1 ? "s" : ""} de côté (références ou images à préparer d'abord)` : null,
      ].filter(Boolean).join(" · "),
    },
    ...(premierPlanH3 ? premierPlanH3.e.contexte.filter((x) => x.type === "brief" || x.type === "registre" || x.type === "projet") : []),
  ];
  const propId = await nouvelleProposition(conv, { skill: "fiches", consigne, contexte, lot: true });
  for (const s of sousTaches) {
    const { p } = s;
    await creerRun(db, {
      skill: s.moteur === "h3ir" ? SKILL_H3IR : "plan-h3",
      entree: s.moteur === "h3ir" ? entreeH3ir(p.uuid) : s.e.entree,
      but: "proposition",
      projectId: conv.projectId,
      conversationId: conv.id,
      propositionId: propId,
      options: s.moteur === "plan-h3" && s.e.variante ? { variante: s.e.variante } : null,
      cleSousTache: cleSousTachePlan(p.uuid),
      libelleSousTache: `${plusieursEpisodes ? `${p.episodeLibelle} · ` : ""}Plan ${String(p.rang).padStart(2, "0")} · ${p.titre}${s.moteur === "h3ir" ? " (Open H3 IR)" : " (plan-h3)"}`,
    });
  }
  const [prop] = await db.select({ uuid: propositions.uuid }).from(propositions).where(eq(propositions.id, propId));
  return { ok: true, propositionUuid: prop!.uuid, nbSousTaches: sousTaches.length, moteurs: moteursRendus, nonPrets };
}

// --- préparation d'un plan avant sa compilation (vague 4a, lib/h3ir/preparation.ts) ----------

const CONSIGNE_REFERENCES = "Choisis les images de référence de ce plan (doute du choix automatique).";

/** Pose la tâche `references-plan` d'un plan (UNE par plan, seulement quand le choix du code a un doute : l'appelant l'a vérifié), dans la conversation
 * du PLAN. Sa sortie (worker/agents/postTraitement.ts) écrit les références tout de suite, ou, s'il faut créer des assets manquants, en fait des créations
 * que la demande applique (les références s'écrivent alors dans la même transaction). `rechoisir` : remplacer des références déjà posées. */
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

/** Crée TOUT DE SUITE des assets manquants (deux au plus, déjà retenus : lib/h3ir/preparation.ts, `retenirManquants`) depuis la conversation d'un plan :
 * une proposition `assets-manquants`, appliquée sans relecture (« Itérer » : les assets que l'agent a décidé de créer). Rend les codes créés et la
 * proposition (source des prompts). */
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

// --- correction après visionnage (iteration-plan) -------------------------------------

const MAX_RETOUR_VISIONNAGE = 4000;


/** « Corriger après visionnage » (page d'un plan qui a un RENDU) : une proposition simple, affinable, calquée sur
 * la fiche d'un plan seul. `retour` = ce que l'utilisateur a vu (obligatoire) ; il devient la consigne de la
 * proposition. Routage par état du plan (décision 2026-10-02) : sans rendu terminé, refusé (jamais de correction à
 * l'aveugle) ; sans fiche, refusé (« écris-la d'abord »). La planche de vignettes est extraite par le worker à
 * l'exécution, jamais stockée. */
export async function genererIteration(
  conversationUuid: string,
  /** `planche` : joindre la planche de vignettes du rendu (jamais par défaut : case « Montrer au chef opérateur », bouton « Analyser »). */
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

/** « Itérer » : la fiche est TOUJOURS recompilée par Open H3 IR (2026-11-09) avec les DÉCISIONS de l'agent d'itération (intent complet, durée,
 * références ajoutées / retirées, créativité et style de mise en scène du plan). Rien n'est écrit ici : les décisions partent en surcharge du brief
 * (lib/h3ir/brief-plan.ts) et ne s'écrivent sur le plan qu'avec la fiche compilée, à l'application (postTraitement : `apres.description`,
 * `dureeGenerationSecondes`, `refs` du manifeste, `reglages`) ; si la compilation échoue, rien n'est écrit. Les références finales doivent toutes avoir
 * leur image : la demande « Itérer » (lib/demandes-db.ts) crée d'abord les assets manquants décidés et attend leurs images (vague 4a) ; appelée trop tôt,
 * la recompilation est refusée sans tâche lancée. */
export async function genererReecriturePlan(
  conversationUuid: string,
  options: { consigne: string; decisions: DecisionsIteration; demandeId?: number },
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

  const entree: EntreeH3ir = {
    planUuid: p.uuid,
    shots: null,
    director: null,
    creativity: null,
    ...(description ? { description } : {}),
    ...(duree != null ? { dureeSecondes: duree } : {}),
    ...(references ? { references } : {}),
    ...(reglagesPlan ? { reglagesPlan } : {}),
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
    options: { ...(description ? { descriptionNouvelle: description } : {}), ...(duree != null ? { dureeNouvelle: duree } : {}), ...(reglagesPlan ? { reglagesNouveaux: reglagesPlan } : {}) },
    demandeId: options.demandeId,
  });
  await db.update(propositions).set({ runId: run.id }).where(eq(propositions.id, propId));
  const [prop] = await db.select({ uuid: propositions.uuid }).from(propositions).where(eq(propositions.id, propId));
  return { ok: true, propositionUuid: prop!.uuid, runUuid: run.uuid };
}

/** Ce que la fenêtre de correction montre avant de lancer (rendu, fiche, corrections déjà tentées). */
export async function lireEtatIteration(projectId: number, planUuid: string): Promise<EtatIterationPlan | null> {
  if (!/^[0-9a-f-]{36}$/i.test(planUuid)) return null;
  return etatIterationPlan(db, projectId, planUuid);
}

/** Les assets CRÉÉS par une proposition de fiches (assets manquants) qui n'ont pas encore de prompt d'image. */
export async function assetsCreesSansPrompt(propositionId: number): Promise<{ id: number; code: string; type: string }[]> {
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

/** Après l'application d'une fiche, d'un inventaire ou d'un choix de références : « Continuer : écrire les prompts des assets créés ». Un LOT
 * `prompt-asset` (une sous-tâche par asset créé sans prompt, `asset:<code>`), posé dans la conversation du PROJET (seule portée où l'on modifie un asset
 * existant). Lancé sur clic de l'utilisateur, ou par la création d'un projet. Refusé si la conversation du projet a déjà une tâche en cours ou une
 * proposition en attente de revue (on ne la perd pas). La préparation d'un plan passe par `genererPromptsAssets` (lot détaché). */
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

/** Les propositions dont les créations d'assets attendent ensuite leurs prompts. */
const SKILLS_CREANT_DES_ASSETS = ["plan-h3", "fiches", "inventaire-assets", SKILL_REFERENCES_PLAN, SKILL_ASSETS_MANQUANTS];

/** Les prompts d'image de ces assets (préparation d'un plan, vague 4a) : un lot `prompt-asset` DÉTACHÉ (sans conversation : il ne remplace ni ne
 * rejette la proposition en revue dans la conversation du projet, et n'attend pas qu'elle soit libre). Ses tâches portent la demande (`demandeId`) : la
 * ligne de la demande les suit dans le panneau, elles passent avant le travail de fond. La demande applique le lot elle-même. Seuls les assets sans
 * prompt sont pris. */
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

/** Le lot `prompt-asset` lui-même : rattaché à la conversation du projet (`conv`, proposition courante) ou détaché (`conv` absent). */
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

/** Relance UNE sous-tâche d'un lot (échouée, annulée, ou à refaire), avec un retour libre
 * facultatif. Ses anciens changements restent jusqu'à ce que la nouvelle réponse les remplace ;
 * les autres sous-tâches ne bougent pas. */
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
    // Lot de fiches : la sous-tâche se relance avec SON moteur. Open H3 IR : la même entrée (le brief se relit à l'exécution) ; plan-h3 : le plan
    // tel qu'il est maintenant (répliques, registre, voisins).
    const [ancien] = await db.select({ skill: agentRuns.skill, entree: agentRuns.entree }).from(agentRuns).where(eq(agentRuns.id, sous.run.id));
    if (ancien?.skill === SKILL_H3IR) {
      cible = { skill: SKILL_H3IR, entree: (ancien.entree as object | null) ?? { planUuid }, options: null };
    } else {
      const e = await entreePlanH3(db, prop.projectId, planUuid, prop.consigne || CONSIGNE_FICHE, retour?.trim() || undefined);
      if (!e) return ERR("Le plan n'existe plus.");
      cible = { skill: "plan-h3", entree: e.entree, options: e.variante ? { variante: e.variante } : null };
    }
  } else if (codeAsset && prop.skill === "prompts-assets") {
    // Prompts des assets créés par les fiches : l'asset existe, on repart de lui (et de son parent).
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
    // Un groupe de scènes d'un inventaire découpé : la même entrée et les mêmes options (poignées des plans, groupes suivants), avec les assets que
    // les AUTRES groupes proposent maintenant.
    const [ancien] = await db.select({ entree: agentRuns.entree, options: agentRuns.options }).from(agentRuns).where(eq(agentRuns.id, sous.run.id));
    const autres = (await assetsACreer(db, prop.id, { saufSousTache: cle })).map((a) => ({ code: a.code, type: a.type, description: a.description }));
    const entree = { ...((ancien?.entree as object | null) ?? {}), assetsDejaProposes: autres, ...(retour?.trim() ? { retourUtilisateur: retour.trim() } : {}) };
    cible = { skill: "inventaire-assets", entree, options: (ancien?.options as { [cle: string]: unknown } | null) ?? null };
  } else {
    const sceneId = sceneIdDeCle(cle);
    const episodeId = episodeIdDeCle(cle);
    if (sceneId != null) {
      // Une scène du scénario : son traitement tel qu'il est maintenant, avec le retour libre.
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
      // Relecture : l'épisode tel qu'il est maintenant (ses plans ont pu changer depuis), avec le retour libre.
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

/** Annule un lot : les sous-tâches en attente sont annulées, celle qui tourne est interrompue ; les
 * résultats déjà écrits restent relisibles. */
export async function annulerLotProposition(propositionUuid: string): Promise<Resultat<{ resultat: ResultatAnnulationLot }>> {
  const prop = await propositionParUuid(propositionUuid);
  if (!prop || !prop.lot) return ERR("Lot introuvable.");
  return { ok: true, resultat: await annulerLot(propositionUuid) };
}

export async function appliquerSelection(propositionUuid: string, options: Parameters<typeof appliquerProposition>[1] = {}): Promise<ResultatApplication> {
  const prop = await propositionParUuid(propositionUuid);
  if (!prop) return { ok: false, erreur: "Proposition introuvable." };
  // Inventaire des assets : les références de plan qui citent un asset créé par la proposition s'écrivent dans la même transaction, APRÈS les
  // créations (lib/agents/inventaire-db.ts). Celles qui ne citaient que des assets existants sont déjà posées depuis le post-traitement.
  // Choix des références d'un plan (préparation, vague 4a) : les assets manquants sont créés, puis les références du skill (eux compris) s'écrivent sur le
  // plan dans la même transaction.
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

