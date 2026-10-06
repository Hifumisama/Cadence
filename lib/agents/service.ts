import { and, asc, count, eq, inArray, isNull } from "drizzle-orm";
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
  repliques,
  scenes,
  seasons,
  voixFiches,
} from "../../db/schema";
import { chargerSkill } from "../llm/skills";
import { valider } from "../llm/validation";
import { estCleSection, sousSchemaSection } from "./brief";
import { abandonnerBrouillon, creerBriefPartiel, ecrireBrouillon, synchroniserClauseStyle } from "./brief-db";
import { accrocheEntretien } from "./accroche";
import { entreeNotes, ficheVersBrief } from "./fiche";
import { ficheCourante } from "./fiche-db";
import type { BriefContenu, CibleDemandee, EpisodePourScenario, MessageConversation, Portee, Position, Profondeur, Resultat, StatutChamp } from "./types";
import { PORTEES } from "./types";
import { controleDuree } from "./applicateurs/plan";
import { cocheParDefaut, groupeAffiche, raisonNonCochable } from "./cochage";
import { TYPE_AFFICHE } from "../affiches";
import { entreePromptAffiche } from "./affiche";
import { entreeCorrectionPlan, entreePromptAsset, entreePromptAssetCandidat, entreePromptVoixCandidat, entreeScenarioEpisode, lireBriefDuProjet, type EntreeSkill } from "./contexte";
import { candidatsRegistre, cleSousTacheAsset, codeDeCleAsset, type CandidatRegistre } from "./registre";
import { candidatsVoix, cleSousTacheVoix, codeDeCleVoix, type CandidatVoix } from "./voix-casting";
import { annulerLot, annulerRunsDePropositions, runsDuLot, type ResultatAnnulationLot } from "./lots";
import { cleSousTacheEpisode, dernieresSousTaches, episodeIdDeCle, estRunActif } from "./lots-pur";
import { appliquerProposition, enregistrerChangements } from "./proposition-db";
import { creerRun, tacheBloquante, type ButRun, type TacheBloquante } from "./runs";
import { squeletteDepuisBrief } from "./squelette";
import type { Avertissement, ResultatApplication } from "./types";
import { entreeIterationPlan, entreeInventaire, entreePlanH3, etatIterationPlan } from "./contexte";
import { cleSousTachePlan, planUuidDeCle } from "./fiches";
import type { EtatIterationPlan, PlanPourFiche } from "./types";
import { jobs, planDialogues, planPromptSections, planRefs } from "../../db/schema";
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
  if (portee === "saison" && cible.id != null) {
    const [s] = await db.select().from(seasons).where(and(eq(seasons.id, cible.id), eq(seasons.projectId, projectId)));
    return s ? { cibleId: s.id, libelle: `Saison ${s.numero} · ${s.titre}` } : { erreur: "Saison introuvable dans ce projet." };
  }
  if (portee === "episode" && cible.id != null) {
    const [e] = await db
      .select({ id: episodes.id, numero: episodes.numero, titre: episodes.titre })
      .from(episodes)
      .innerJoin(seasons, eq(seasons.id, episodes.seasonId))
      .where(and(eq(episodes.id, cible.id), eq(seasons.projectId, projectId)));
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
  if (portee === "saison") return libelle(await resoudreCible(projectId, "saison", { id: cibleId }), "Saison");
  if (portee === "episode") return libelle(await resoudreCible(projectId, "episode", { id: cibleId }), "Épisode");
  if (portee === "asset") return libelle(await resoudreCible(projectId, "asset", { id: cibleId }), "Asset");
  const [p] = await db.select({ titre: plans.titre }).from(plans).where(eq(plans.id, cibleId));
  return p ? `Plan · ${p.titre}` : "Plan";
}

// --- conversation -----------------------------------------------------------

const etapeInitiale = (p: Profondeur) => (p === "complete" ? "conversation" : "consigne");
/** L'agent ouvre l'entretien d'entrée (conversation complète) : trois pistes très différentes pour qui n'a pas d'idée (accroche.ts). */
const messagesInitiaux = (p: Profondeur): MessageConversation[] => (p === "complete" ? [{ role: "assistant", content: accrocheEntretien(), at: new Date().toISOString() }] : []);
const profondeurParDefaut = (portee: Portee): Profondeur => (portee === "projet" ? "complete" : "courte");

type ConversationRow = typeof agentConversations.$inferSelect;

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
  const [c] = await db
    .insert(agentConversations)
    .values({ projectId, portee, cibleId: r.cibleId, profondeur: p, etape: etapeInitiale(p), messages: messagesInitiaux(p) })
    .onConflictDoNothing()
    .returning({ uuid: agentConversations.uuid });
  if (c) return { ok: true, conversationUuid: c.uuid, reprise: false };
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
  const [c] = await db
    .insert(agentConversations)
    .values({ projectId, portee, cibleId: r.cibleId, profondeur: p, etape: etapeInitiale(p as Profondeur), messages: messagesInitiaux(p as Profondeur) })
    .returning({ uuid: agentConversations.uuid });
  return { ok: true, conversationUuid: c!.uuid };
}

export async function reinitialiser(conversationUuid: string): Promise<Resultat> {
  const conv = await conversationParUuid(conversationUuid);
  if (!conv) return ERR("Conversation introuvable.");
  await arreterTravaux(conv.id);
  if (conv.portee === "projet") await db.delete(briefs).where(and(eq(briefs.projectId, conv.projectId), eq(briefs.statut, "brouillon")));
  await db
    .update(agentConversations)
    .set({ messages: messagesInitiaux(conv.profondeur as Profondeur), consigne: "", briefPret: false, resteADefinir: [], fiche: null, propositionId: null, etape: etapeInitiale(conv.profondeur as Profondeur), updatedAt: new Date() })
    .where(eq(agentConversations.id, conv.id));
  return { ok: true };
}

export async function envoyerMessage(conversationUuid: string, texte: string): Promise<Resultat<{ runUuid: string }>> {
  const conv = await conversationParUuid(conversationUuid);
  if (!conv) return ERR("Conversation introuvable.");
  if (conv.profondeur !== "complete") return ERR("Cette conversation est courte : donne une consigne et génère la proposition.");
  const message = texte.trim();
  if (!message) return ERR("Le message est vide.");
  if (message.length > MAX_MESSAGE) return ERR(`Message trop long (${MAX_MESSAGE} caractères au plus).`);
  // Un tour OU l'écriture du briefing (la première version part seule, et vaut qu'on l'attende) bloquent l'envoi.
  { const refus = await refusSiTacheActive(conv.id, "L'agent est déjà en train de répondre : attends sa réponse.", ["tour", "brief"]); if (refus) return refus; }

  const messages = [...((conv.messages as MessageConversation[]) ?? []), { role: "user" as const, content: message, at: new Date().toISOString() }];
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
  const sous = sousSchemaSection(chargerSkill("brief-projet").schema, section);
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

async function entreePourConversation(conv: ConversationRow, consigne: string, position?: Position, retour?: string): Promise<{ entree: EntreeSkill; options: Record<string, unknown> } | { erreur: string }> {
  const cibleId = conv.cibleId;
  if (conv.portee === "asset" && cibleId != null) {
    // L'affiche d'un projet, d'une saison ou d'un épisode est un asset caché : son propre skill, même parcours de revue.
    const [cibleAsset] = await db.select({ type: assets.type }).from(assets).where(and(eq(assets.id, cibleId), eq(assets.projectId, conv.projectId)));
    if (cibleAsset?.type === TYPE_AFFICHE) {
      const a = await entreePromptAffiche(db, conv.projectId, cibleId, consigne, retour);
      return a ? { entree: a, options: {} } : { erreur: "Affiche introuvable." };
    }
    const e = await entreePromptAsset(db, conv.projectId, cibleId, consigne, retour);
    return e ? { entree: e, options: { variante: e.variante } } : { erreur: "Asset introuvable." };
  }
  if (conv.portee === "episode" && cibleId != null) {
    const e = await entreeScenarioEpisode(db, conv.projectId, cibleId, consigne, { position, retour });
    return e ? { entree: e, options: { ...(position ? { position, sceneVoisineId: e.sceneVoisineId } : {}) } } : { erreur: "Épisode introuvable." };
  }
  if (conv.portee === "plan" && cibleId != null) {
    const [p] = await db.select({ uuid: plans.uuid }).from(plans).where(eq(plans.id, cibleId));
    const e = p ? await entreeCorrectionPlan(db, conv.projectId, p.uuid, consigne, retour) : null;
    return e ? { entree: e, options: {} } : { erreur: "Plan introuvable." };
  }
  return { erreur: `La portée « ${conv.portee} » ne se génère pas en profondeur courte : ouvre une conversation complète.` };
}

export async function genererProposition(conversationUuid: string, options: { consigne?: string; position?: Position } = {}): Promise<Resultat<{ propositionUuid: string; runUuid: string | null }>> {
  const conv = await conversationParUuid(conversationUuid);
  if (!conv) return ERR("Conversation introuvable.");
  { const refus = await refusSiTacheActive(conv.id, "Une tâche de l'agent est déjà en cours sur cette conversation."); if (refus) return refus; }

  // Écrire les scénarios depuis le projet ou une saison : un LOT (une sous-tâche par épisode).
  if (conv.profondeur === "courte" && (conv.portee === "projet" || conv.portee === "saison")) {
    const r = await genererScenarios(conversationUuid, { consigne: options.consigne });
    return r.ok ? { ok: true, propositionUuid: r.propositionUuid, runUuid: null } : r;
  }

  // Profondeur complète : le squelette se construit en code depuis le brief.
  if (conv.profondeur === "complete") {
    const [brief] = await db.select().from(briefs).where(eq(briefs.projectId, conv.projectId));
    if (!brief || brief.statut === "partiel") return ERR("Génère d'abord le brief.");
    const saisons = await db.select({ id: seasons.id, numero: seasons.numero, titre: seasons.titre }).from(seasons).where(eq(seasons.projectId, conv.projectId));
    const lignesEps = saisons.length
      ? await db
          .select({ id: episodes.id, seasonId: episodes.seasonId, numero: episodes.numero, titre: episodes.titre, resume: episodes.resume })
          .from(episodes)
          .where(inArray(episodes.seasonId, saisons.map((s) => s.id)))
      : [];
    // Un épisode « vide » (ni plan, ni scène, ni résumé) est réutilisé par le squelette plutôt
    // que doublé : un OneShot naît déjà avec sa saison et son épisode techniques.
    const idsEps = lignesEps.map((e) => e.id);
    const avecPlans = new Set(idsEps.length ? (await db.select({ id: plans.episodeId }).from(plans).where(inArray(plans.episodeId, idsEps))).map((r) => r.id) : []);
    const avecScenes = new Set(idsEps.length ? (await db.select({ id: scenes.episodeId }).from(scenes).where(inArray(scenes.episodeId, idsEps))).map((r) => r.id) : []);
    const eps = lignesEps.map((e) => ({ ...e, vide: !e.resume.trim() && !avecPlans.has(e.id) && !avecScenes.has(e.id) }));
    const bruts = squeletteDepuisBrief(brief.contenu as BriefContenu, brief.statuts as Record<string, StatutChamp>, {
      saisons,
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
  const e = await entreePourConversation(conv, consigne, options.position);
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

  const optionsParent = (runParent.options ?? null) as { modele?: string; variante?: string; position?: Position; sceneVoisineId?: number | null } | null;
  const entree = {
    ...(runParent.entree as Record<string, unknown>),
    retourUtilisateur: texte,
    propositionPrecedente: runParent.resultat ?? null,
  };
  const propId = await nouvelleProposition(conv, { skill: parent.skill, consigne: parent.consigne, contexte: (parent.contexte as unknown[]) ?? [], parentId: parent.id, retour: texte });
  const run = await creerRun(db, { skill: parent.skill, entree, but: "proposition", projectId: conv.projectId, conversationId: conv.id, propositionId: propId, options: optionsParent });
  await db.update(propositions).set({ runId: run.id }).where(eq(propositions.id, propId));
  const [nouvelle] = await db.select({ uuid: propositions.uuid }).from(propositions).where(eq(propositions.id, propId));
  return { ok: true, propositionUuid: nouvelle!.uuid, runUuid: run.uuid };
}

// --- scénarios d'épisodes : un LOT (une sous-tâche par épisode) -------------------

const CONSIGNE_SCENARIO = "Écris le scénario complet de cet épisode.";

/** Les épisodes d'un projet (ou d'une saison) proposables à l'écriture de leur scénario, dans
 * l'ordre, avec ce qu'ils contiennent déjà : « vide » = ni plan ni scène (le squelette tout juste
 * appliqué). */
export async function episodesPourScenarios(projectId: number, saisonId: number | null): Promise<EpisodePourScenario[]> {
  const lignes = await db
    .select({ id: episodes.id, numero: episodes.numero, titre: episodes.titre, saisonNumero: seasons.numero })
    .from(episodes)
    .innerJoin(seasons, eq(seasons.id, episodes.seasonId))
    .where(and(eq(seasons.projectId, projectId), saisonId != null ? eq(seasons.id, saisonId) : undefined))
    .orderBy(asc(seasons.numero), asc(episodes.numero));
  if (lignes.length === 0) return [];
  const ids = lignes.map((l) => l.id);
  const parPlans = new Map((await db.select({ id: plans.episodeId, n: count() }).from(plans).where(inArray(plans.episodeId, ids)).groupBy(plans.episodeId)).map((r) => [r.id, Number(r.n)]));
  const parScenes = new Map((await db.select({ id: scenes.episodeId, n: count() }).from(scenes).where(inArray(scenes.episodeId, ids)).groupBy(scenes.episodeId)).map((r) => [r.id, Number(r.n)]));
  return lignes.map((l) => {
    const nbPlans = parPlans.get(l.id) ?? 0;
    const nbScenes = parScenes.get(l.id) ?? 0;
    return { id: l.id, numero: l.numero, titre: l.titre, saisonNumero: l.saisonNumero, vide: nbPlans === 0 && nbScenes === 0, nbPlans, nbScenes };
  });
}

/** « Écrire les scénarios » depuis le projet ou une saison : une proposition EN LOT, une sous-tâche
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
  if (conv.portee !== "projet" && conv.portee !== "saison") return ERR("Écrire les scénarios se demande depuis le projet ou une saison ; pour un seul épisode, ouvre-le.");
  { const refus = await refusSiTacheActive(conv.id, "Une tâche de l'agent est déjà en cours sur cette conversation."); if (refus) return refus; }
  const brief = await lireBriefDuProjet(db, conv.projectId);
  if (!brief || brief.statut === "partiel") return ERR("Écris d'abord le brief du projet : l'agent s'appuie dessus pour chaque épisode.");

  const dispo = await episodesPourScenarios(conv.projectId, conv.portee === "saison" ? conv.cibleId : null);
  if (dispo.length === 0) return ERR("Ce projet n'a pas encore d'épisode : applique d'abord le squelette.");
  const voulus = options.episodeIds ?? dispo.filter((e) => e.vide).map((e) => e.id);
  if (voulus.length === 0) return ERR("Tous les épisodes ont déjà du contenu : choisis ceux à (ré)écrire.");
  const choisis = dispo.filter((e) => voulus.includes(e.id));
  if (choisis.length !== new Set(voulus).size) return ERR("Un des épisodes choisis n'est pas dans cette portée.");

  const consigne = (options.consigne ?? "").trim() || CONSIGNE_SCENARIO;
  const plusieursSaisons = new Set(choisis.map((e) => e.saisonNumero)).size > 1;
  const sousTaches: { e: EpisodePourScenario; entree: NonNullable<Awaited<ReturnType<typeof entreeScenarioEpisode>>> }[] = [];
  for (const e of choisis) {
    const entree = await entreeScenarioEpisode(db, conv.projectId, e.id, consigne);
    if (entree) sousTaches.push({ e, entree });
  }
  if (sousTaches.length === 0) return ERR("Aucun épisode lisible.");

  const contexte = [
    { type: "brief" as const, libelle: `Brief du projet (${brief.statut})`, ref: "*" },
    { type: "episode" as const, libelle: `${sousTaches.length} épisode${sousTaches.length > 1 ? "s" : ""} à écrire, un par un` },
    ...sousTaches[0]!.entree.contexte.filter((c) => c.type === "brief" || c.type === "registre"),
  ];
  const propId = await nouvelleProposition(conv, { skill: "scenarios", consigne, contexte, lot: true });
  for (const { e, entree } of sousTaches) {
    await creerRun(db, {
      skill: "scenario-episode",
      entree: entree.entree,
      but: "proposition",
      projectId: conv.projectId,
      conversationId: conv.id,
      propositionId: propId,
      cleSousTache: cleSousTacheEpisode(e.id),
      libelleSousTache: `${plusieursSaisons ? `Saison ${e.saisonNumero} · ` : ""}Épisode ${e.numero} · ${e.titre}`,
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
    .select({ id: assets.id, code: assets.code, type: assets.type, description: assets.description, promptGeneration: assets.promptGeneration, statut: assets.statut })
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
  const propId = await nouvelleProposition(conv, { skill: "inventaire-assets", consigne, contexte: e.contexte });
  const run = await creerRun(db, {
    skill: "inventaire-assets",
    entree: e.entree,
    but: "proposition",
    projectId: conv.projectId,
    conversationId: conv.id,
    propositionId: propId,
  });
  await db.update(propositions).set({ runId: run.id }).where(eq(propositions.id, propId));
  const [prop] = await db.select({ uuid: propositions.uuid }).from(propositions).where(eq(propositions.id, propId));
  return { ok: true, propositionUuid: prop!.uuid, runUuid: run.uuid };
}

const CONSIGNE_VOIX = "Écris l'instruction de timbre (Voice Design) de cette voix, à partir du personnage et de ses répliques.";

/** Les voix à créer : un personnage qui parle (au moins une réplique) sans voix, et la voix off si des
 * répliques la réclament. Vide tant que les scénarios n'ont écrit aucune réplique. */
export async function candidatsVoixDuProjet(projectId: number): Promise<CandidatVoix[]> {
  const lesAssets = await db.select({ id: assets.id, code: assets.code, type: assets.type, description: assets.description }).from(assets).where(and(eq(assets.projectId, projectId), horsAffiches)).orderBy(asc(assets.code));
  const fiches = await db
    .select({ assetCode: assets.code, personnageId: voixFiches.personnageId })
    .from(voixFiches)
    .innerJoin(assets, eq(assets.id, voixFiches.assetId))
    .where(eq(assets.projectId, projectId));
  const lues = await db
    .select({ locuteurId: repliques.locuteurId, voixId: repliques.voixId, locuteurTexte: repliques.locuteurTexte, texte: repliques.texte })
    .from(repliques)
    .where(eq(repliques.projectId, projectId))
    .orderBy(asc(repliques.episodeId), asc(repliques.ordre), asc(repliques.id));
  return candidatsVoix(
    lesAssets.filter((a) => a.type === "personnage").map((a) => ({ id: a.id, code: a.code, description: a.description ?? "" })),
    fiches,
    lesAssets.filter((a) => a.type === "voix").map((a) => ({ id: a.id, code: a.code })),
    lues,
  );
}

/** Étape « casting des voix » : UN lot de sous-tâches `prompt-voix`, une par voix manquante (personnage
 * qui parle sans voix, voix off), l'une après l'autre. Chaque sous-tâche propose la CRÉATION de la voix
 * (asset VOICE_* et fiche de casting) avec l'instruction de timbre ; l'utilisateur relit et coche. Depuis
 * la conversation du PROJET. Le son se génère à part, et la voix s'édite au casting vocal. */
export async function genererVoix(
  conversationUuid: string,
  options: { cles?: string[]; consigne?: string } = {},
): Promise<Resultat<{ propositionUuid: string; nbSousTaches: number }>> {
  const conv = await conversationParUuid(conversationUuid);
  if (!conv) return ERR("Conversation introuvable.");
  if (conv.portee !== "projet") return ERR("Le casting des voix se crée depuis le projet : ouvre l'agent sur le projet.");
  { const refus = await refusSiTacheActive(conv.id, "Une tâche de l'agent est déjà en cours sur cette conversation."); if (refus) return refus; }
  const brief = await lireBriefDuProjet(db, conv.projectId);
  if (!brief || brief.statut === "partiel") return ERR("Écris d'abord le brief du projet.");

  const candidats = await candidatsVoixDuProjet(conv.projectId);
  if (candidats.length === 0) return ERR("Aucune voix à créer : chaque personnage qui parle a déjà la sienne (ou aucune réplique n'est écrite).");
  const voulus = options.cles ?? candidats.filter((c) => c.aTraiter).map((c) => c.cle);
  if (voulus.length === 0) return ERR("Rien à créer : coche au moins une voix.");
  const choisis = candidats.filter((c) => voulus.includes(c.cle));
  if (choisis.length !== new Set(voulus).size) return ERR("Une des voix choisies n'est plus à créer.");
  const bloquee = choisis.find((c) => c.bloque);
  if (bloquee) return ERR(bloquee.bloque!);

  const consigne = (options.consigne ?? "").trim() || CONSIGNE_VOIX;
  const sousTaches: { c: CandidatVoix; e: EntreeSkill }[] = [];
  for (const c of choisis) sousTaches.push({ c, e: await entreePromptVoixCandidat(db, conv.projectId, c, consigne) });

  const contexte = [
    { type: "brief" as const, libelle: `Brief du projet (${brief.statut})`, ref: "*" },
    { type: "voix" as const, libelle: `${sousTaches.length} voix à écrire, une par une` },
  ];
  const propId = await nouvelleProposition(conv, { skill: "voix", consigne, contexte, lot: true });
  for (const { c, e } of sousTaches) {
    await creerRun(db, {
      skill: "prompt-voix",
      entree: e.entree,
      but: "proposition",
      projectId: conv.projectId,
      conversationId: conv.id,
      propositionId: propId,
      cleSousTache: cleSousTacheVoix(c.personnageCode ?? "off"),
      libelleSousTache: c.libelle,
    });
  }
  const [prop] = await db.select({ uuid: propositions.uuid }).from(propositions).where(eq(propositions.id, propId));
  return { ok: true, propositionUuid: prop!.uuid, nbSousTaches: sousTaches.length };
}

// --- étape 3 : les fiches de plan (plan-h3) ------------------------------------------

const CONSIGNE_FICHE = "Écris la fiche de plan complète.";
const CONSIGNE_PROMPTS_CREES =
  "Écris le prompt de génération de cet asset (image de référence) à partir de sa description canonique ; s'il dérive d'un parent, pars de lui quand c'est pertinent.";

/** Les plans d'une portée (projet, saison, épisode ou un plan) proposables à l'écriture de leur fiche, dans
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
      seasonId: episodes.seasonId,
      epNumero: episodes.numero,
      epTitre: episodes.titre,
      saisonNumero: seasons.numero,
    })
    .from(plans)
    .innerJoin(episodes, eq(episodes.id, plans.episodeId))
    .innerJoin(seasons, eq(seasons.id, episodes.seasonId))
    .where(eq(plans.projectId, projectId))
    .orderBy(asc(seasons.numero), asc(episodes.numero), asc(plans.ordre), asc(plans.id));
  // Le rang affiché est celui du plan dans SON épisode (F03 : une position, jamais un identifiant).
  const rangs = new Map<number, number>();
  const parEpisode = new Map<number, number>();
  for (const p of tous) {
    const n = (parEpisode.get(p.episodeId) ?? 0) + 1;
    parEpisode.set(p.episodeId, n);
    rangs.set(p.id, n);
  }
  const lignes = tous.filter((p) =>
    portee === "plan" ? p.id === cibleId : portee === "episode" ? p.episodeId === cibleId : portee === "saison" ? p.seasonId === cibleId : true,
  );
  if (lignes.length === 0) return [];
  const ids = lignes.map((p) => p.id);
  const [remplies, refs, dialogues, rendus, lesScenes] = await Promise.all([
    db.select({ planId: planPromptSections.planId }).from(planPromptSections).where(and(inArray(planPromptSections.planId, ids), sql`length(trim(${planPromptSections.contenu})) > 0`)),
    db.select({ planId: planRefs.planId, n: count() }).from(planRefs).where(and(inArray(planRefs.planId, ids), inArray(planRefs.type, ["picture", "audio"]))).groupBy(planRefs.planId),
    db.select({ planId: planDialogues.planId, n: count() }).from(planDialogues).where(inArray(planDialogues.planId, ids)).groupBy(planDialogues.planId),
    db.select({ planId: jobs.planId }).from(jobs).where(and(inArray(jobs.planId, ids), eq(jobs.statut, "termine"), isNotNull(jobs.cheminSortie))),
    db.select({ id: scenes.id, titre: scenes.titre }).from(scenes).where(inArray(scenes.episodeId, [...new Set(lignes.map((p) => p.episodeId))])),
  ]);
  const avecSections = new Set(remplies.map((r) => r.planId));
  const nbRefs = new Map(refs.map((r) => [r.planId, Number(r.n)]));
  const nbRepliques = new Map(dialogues.map((r) => [r.planId, Number(r.n)]));
  const avecRendu = new Set(rendus.map((r) => r.planId));
  const titreScene = new Map(lesScenes.map((s) => [s.id, s.titre]));
  const plusieursSaisons = new Set(lignes.map((p) => p.saisonNumero)).size > 1;
  return lignes.map((p) => ({
    uuid: p.uuid,
    titre: p.titre,
    rang: rangs.get(p.id) ?? 0,
    episodeId: p.episodeId,
    episodeLibelle: `${plusieursSaisons ? `Saison ${p.saisonNumero} · ` : ""}Épisode ${p.epNumero} · ${p.epTitre}`,
    sceneTitre: p.sceneId != null ? (titreScene.get(p.sceneId) ?? null) : null,
    dureeSecondes: p.duree,
    aDesSections: avecSections.has(p.id),
    nbRefs: nbRefs.get(p.id) ?? 0,
    aUnRendu: p.statut === "previsualise" || p.statut === "termine" || avecRendu.has(p.id),
    nbRepliques: nbRepliques.get(p.id) ?? 0,
    sansIntention: !(p.description ?? "").trim(),
  }));
}

/** Étape 3 : « écrire la fiche » d'un plan (portée `plan` : une proposition simple, affinable) ou les fiches
 * des plans d'un épisode, d'une saison ou du projet (un LOT : une sous-tâche `plan-h3` par plan, clé
 * `plan:<uuid>`, l'une après l'autre dans la file). Par défaut, les plans SANS fiche ; `planUuids` choisit
 * (et permet de réécrire une fiche : elle ira dans la section « risque d'écrasement », décochée). Écrire une
 * fiche remplace ensemble ses six sections ET ses références ; les répliques liées restent celles du plan. */
export async function genererFiches(
  conversationUuid: string,
  options: { planUuids?: string[]; consigne?: string } = {},
): Promise<Resultat<{ propositionUuid: string; nbSousTaches: number }>> {
  const conv = await conversationParUuid(conversationUuid);
  if (!conv) return ERR("Conversation introuvable.");
  const portee = conv.portee as Portee;
  if (portee === "asset") return ERR("Les fiches s'écrivent depuis un plan, un épisode, une saison ou le projet.");
  { const refus = await refusSiTacheActive(conv.id, "Une tâche de l'agent est déjà en cours sur cette conversation."); if (refus) return refus; }

  const dispo = await plansPourFiches(conv.projectId, portee, conv.cibleId);
  if (dispo.length === 0) return ERR(portee === "plan" ? "Plan introuvable." : "Aucun plan dans cette portée : écris d'abord le scénario.");
  const voulus = options.planUuids ?? (portee === "plan" ? dispo.map((p) => p.uuid) : dispo.filter((p) => !p.aDesSections).map((p) => p.uuid));
  if (voulus.length === 0) return ERR(options.planUuids ? "Coche au moins un plan." : "Tous les plans ont déjà une fiche : choisis ceux à réécrire.");
  const choisis = dispo.filter((p) => voulus.includes(p.uuid));
  if (choisis.length !== new Set(voulus).size) return ERR("Un des plans choisis n'est pas dans cette portée.");
  const consigne = (options.consigne ?? "").trim() || CONSIGNE_FICHE;

  if (portee === "plan") {
    // Un seul plan : une proposition simple (« affiner » rejoue le skill avec le retour).
    const e = await entreePlanH3(db, conv.projectId, choisis[0]!.uuid, consigne);
    if (!e) return ERR("Plan introuvable.");
    const propId = await nouvelleProposition(conv, { skill: "plan-h3", consigne, contexte: e.contexte });
    const run = await creerRun(db, { skill: "plan-h3", entree: e.entree, but: "proposition", projectId: conv.projectId, conversationId: conv.id, propositionId: propId, options: e.variante ? { variante: e.variante } : null });
    await db.update(propositions).set({ runId: run.id }).where(eq(propositions.id, propId));
    const [prop] = await db.select({ uuid: propositions.uuid }).from(propositions).where(eq(propositions.id, propId));
    return { ok: true, propositionUuid: prop!.uuid, nbSousTaches: 1 };
  }

  const plusieursEpisodes = new Set(choisis.map((p) => p.episodeId)).size > 1;
  const sousTaches: { p: PlanPourFiche; e: EntreeSkill }[] = [];
  for (const p of choisis) {
    const e = await entreePlanH3(db, conv.projectId, p.uuid, consigne);
    if (e) sousTaches.push({ p, e });
  }
  if (sousTaches.length === 0) return ERR("Aucun plan lisible.");
  const contexte = [
    { type: "plan" as const, libelle: `${sousTaches.length} fiche${sousTaches.length > 1 ? "s" : ""} de plan à écrire, une par une` },
    ...sousTaches[0]!.e.contexte.filter((x) => x.type === "brief" || x.type === "registre" || x.type === "projet"),
  ];
  const propId = await nouvelleProposition(conv, { skill: "fiches", consigne, contexte, lot: true });
  for (const { p, e } of sousTaches) {
    await creerRun(db, {
      skill: "plan-h3",
      entree: e.entree,
      but: "proposition",
      projectId: conv.projectId,
      conversationId: conv.id,
      propositionId: propId,
      options: e.variante ? { variante: e.variante } : null,
      cleSousTache: cleSousTachePlan(p.uuid),
      libelleSousTache: `${plusieursEpisodes ? `${p.episodeLibelle} · ` : ""}Plan ${String(p.rang).padStart(2, "0")} · ${p.titre}`,
    });
  }
  const [prop] = await db.select({ uuid: propositions.uuid }).from(propositions).where(eq(propositions.id, propId));
  return { ok: true, propositionUuid: prop!.uuid, nbSousTaches: sousTaches.length };
}

// --- correction après visionnage (iteration-plan) -------------------------------------

const MAX_RETOUR_VISIONNAGE = 4000;

/** « Corriger après visionnage » (page d'un plan qui a un RENDU) : une proposition simple, affinable, calquée sur
 * la fiche d'un plan seul. `retour` = ce que l'utilisateur a vu (obligatoire) ; il devient la consigne de la
 * proposition. Routage par état du plan (décision 2026-10-02) : sans rendu terminé, refusé (jamais de correction à
 * l'aveugle) ; sans fiche, refusé (« écris-la d'abord »). La planche de vignettes est extraite par le worker à
 * l'exécution, jamais stockée. */
export async function genererIteration(conversationUuid: string, options: { retour: string }): Promise<Resultat<{ propositionUuid: string; runUuid: string }>> {
  const conv = await conversationParUuid(conversationUuid);
  if (!conv) return ERR("Conversation introuvable.");
  if (conv.portee !== "plan" || conv.cibleId == null) return ERR("La correction après visionnage se demande depuis la page d'un plan.");
  const retour = (options.retour ?? "").trim();
  if (!retour) return ERR("Dis ce que tu as vu dans le rendu : c'est le point de départ du diagnostic.");
  if (retour.length > MAX_RETOUR_VISIONNAGE) return ERR(`Ton retour est trop long (${MAX_RETOUR_VISIONNAGE} caractères au plus).`);
  { const refus = await refusSiTacheActive(conv.id, "Une tâche de l'agent est déjà en cours sur ce plan."); if (refus) return refus; }
  const [p] = await db.select({ uuid: plans.uuid }).from(plans).where(eq(plans.id, conv.cibleId));
  if (!p) return ERR("Plan introuvable.");
  const e = await entreeIterationPlan(db, conv.projectId, p.uuid, retour);
  if ("erreur" in e) return ERR(e.erreur);
  const propId = await nouvelleProposition(conv, { skill: "iteration-plan", consigne: retour, contexte: e.contexte });
  const run = await creerRun(db, { skill: "iteration-plan", entree: e.entree, but: "proposition", projectId: conv.projectId, conversationId: conv.id, propositionId: propId });
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
  return lus.filter((a) => !(a.prompt ?? "").trim() && a.type !== "voix").map((a) => ({ id: a.id, code: a.code, type: a.type }));
}

/** Après l'application d'une fiche : « Continuer : écrire les prompts des assets créés ». Un LOT `prompt-asset`
 * (une sous-tâche par asset créé sans prompt, `asset:<code>`), posé dans la conversation du PROJET (seule
 * portée où l'on modifie un asset existant). Lancé sur clic de l'utilisateur, jamais tout seul. Refusé si la
 * conversation du projet a déjà une tâche en cours ou une proposition en attente de revue (on ne la perd pas). */
export async function genererPromptsAssetsCrees(
  propositionUuid: string,
  options: { consigne?: string } = {},
): Promise<Resultat<{ conversationUuid: string; propositionUuid: string; nbSousTaches: number }>> {
  const source = await propositionParUuid(propositionUuid);
  if (!source) return ERR("Proposition introuvable.");
  if (source.skill !== "plan-h3" && source.skill !== "fiches" && source.skill !== "inventaire-assets") return ERR("Cette proposition n'a pas créé d'assets à décrire (fiches de plan ou inventaire).");
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
  const sousTaches: { code: string; e: EntreeSkill }[] = [];
  for (const a of aEcrire) {
    const e = await entreePromptAsset(db, source.projectId, a.id, consigne);
    if (e) sousTaches.push({ code: a.code, e });
  }
  if (sousTaches.length === 0) return ERR("Aucun asset lisible.");
  const contexte = [{ type: "registre" as const, libelle: `${sousTaches.length} asset${sousTaches.length > 1 ? "s" : ""} créé${sousTaches.length > 1 ? "s" : ""} par les fiches, un par un` }];
  const propId = await nouvelleProposition(conv, { skill: "prompts-assets", consigne, contexte, lot: true });
  for (const { code, e } of sousTaches) {
    await creerRun(db, {
      skill: "prompt-asset",
      entree: e.entree,
      but: "proposition",
      projectId: source.projectId,
      conversationId: conv.id,
      propositionId: propId,
      cleSousTache: cleSousTacheAsset(code),
      libelleSousTache: code,
      options: e.variante ? { variante: e.variante } : null,
    });
  }
  const [prop] = await db.select({ uuid: propositions.uuid }).from(propositions).where(eq(propositions.id, propId));
  return { ok: true, conversationUuid: conv.uuid, propositionUuid: prop!.uuid, nbSousTaches: sousTaches.length };
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
  let cible: { skill: string; entree: object; options: { variante?: string } | null };
  const codeAsset = codeDeCleAsset(cle);
  const cleVoix = codeDeCleVoix(cle);
  const planUuid = planUuidDeCle(cle);
  if (planUuid) {
    // Lot de fiches : le plan tel qu'il est maintenant (répliques, registre, voisins).
    const e = await entreePlanH3(db, prop.projectId, planUuid, prop.consigne || CONSIGNE_FICHE, retour?.trim() || undefined);
    if (!e) return ERR("Le plan n'existe plus.");
    cible = { skill: "plan-h3", entree: e.entree, options: e.variante ? { variante: e.variante } : null };
  } else if (codeAsset && prop.skill === "prompts-assets") {
    // Prompts des assets créés par les fiches : l'asset existe, on repart de lui (et de son parent).
    const [a] = await db.select({ id: assets.id }).from(assets).where(and(eq(assets.projectId, prop.projectId), eq(assets.code, codeAsset)));
    const e = a ? await entreePromptAsset(db, prop.projectId, a.id, prop.consigne || CONSIGNE_PROMPTS_CREES, retour?.trim() || undefined) : null;
    if (!e) return ERR("L'asset n'existe plus.");
    cible = { skill: "prompt-asset", entree: e.entree, options: e.variante ? { variante: e.variante } : null };
  } else if (cleVoix) {
    const cand = (await candidatsVoixDuProjet(prop.projectId)).find((c) => c.cle === cle);
    if (!cand) return ERR("Cette voix n'est plus à créer (elle existe, ou plus aucune réplique ne la réclame).");
    const e = await entreePromptVoixCandidat(db, prop.projectId, cand, prop.consigne || CONSIGNE_VOIX, retour?.trim() || undefined);
    cible = { skill: "prompt-voix", entree: e.entree, options: null };
  } else if (codeAsset) {
    const cand = (await candidatsDuProjet(prop.projectId)).find((c) => c.code === codeAsset);
    if (!cand) return ERR("Cet asset n'est plus décrit par le brief.");
    const e = await entreePromptAssetCandidat(db, prop.projectId, cand, prop.consigne || CONSIGNE_REGISTRE, retour?.trim() || undefined);
    if (!e) return ERR("L'asset n'existe plus.");
    cible = { skill: "prompt-asset", entree: e.entree, options: e.variante ? { variante: e.variante } : null };
  } else {
    const episodeId = episodeIdDeCle(cle);
    if (episodeId == null) return ERR("Sous-tâche non relançable.");
    const entree = await entreeScenarioEpisode(db, prop.projectId, episodeId, prop.consigne || CONSIGNE_SCENARIO, { retour: retour?.trim() || undefined });
    if (!entree) return ERR("L'épisode n'existe plus.");
    cible = { skill: "scenario-episode", entree: entree.entree, options: null };
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

export async function appliquerSelection(propositionUuid: string, options: { confirmeEcrasement?: boolean } = {}): Promise<ResultatApplication> {
  const prop = await propositionParUuid(propositionUuid);
  if (!prop) return { ok: false, erreur: "Proposition introuvable." };
  return appliquerProposition(prop.id, options);
}

