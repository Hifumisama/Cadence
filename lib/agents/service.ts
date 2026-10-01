import { and, asc, count, eq, inArray, isNull } from "drizzle-orm";
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
  seasons,
} from "../../db/schema";
import { chargerSkill } from "../llm/skills";
import { valider } from "../llm/validation";
import { estCleSection, sousSchemaSection } from "./brief";
import { abandonnerBrouillon, creerBriefPartiel, synchroniserClauseStyle } from "./brief-db";
import type { BriefContenu, CibleDemandee, EpisodePourScenario, MessageConversation, Portee, Position, Profondeur, Resultat, StatutChamp } from "./types";
import { PORTEES } from "./types";
import { controleDuree } from "./applicateurs/plan";
import { cocheParDefaut, groupeAffiche, raisonNonCochable } from "./cochage";
import { entreeCorrectionPlan, entreePromptAsset, entreePromptAssetCandidat, entreeScenarioEpisode, lireBriefDuProjet, type EntreeSkill } from "./contexte";
import { candidatsRegistre, cleSousTacheAsset, codeDeCleAsset, type CandidatRegistre } from "./registre";
import { annulerLot, annulerRunsDePropositions, runsDuLot, type ResultatAnnulationLot } from "./lots";
import { cleSousTacheEpisode, dernieresSousTaches, episodeIdDeCle, estRunActif } from "./lots-pur";
import { appliquerProposition, enregistrerChangements } from "./proposition-db";
import { creerRun, tacheActive } from "./runs";
import { squeletteDepuisBrief } from "./squelette";
import type { Avertissement, ResultatApplication } from "./types";

/** Logique serveur du système d'agents : conversations, brief, propositions. Aucune dépendance à
 * Next (les actions de app/agents/actions.ts n'en sont que des enveloppes) : le script
 * d'essai et les tests l'appellent directement. Voir app/agents/actions.ts pour le contrat. */

const ERR = (erreur: string) => ({ ok: false as const, erreur });
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
      .select({ id: assets.id, code: assets.code })
      .from(assets)
      .where(and(eq(assets.projectId, projectId), cible.code ? eq(assets.code, cible.code) : eq(assets.id, cible.id!)));
    return a ? { cibleId: a.id, libelle: a.code } : { erreur: "Asset introuvable dans ce projet." };
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
async function arreterTravaux(conversationId: number): Promise<void> {
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
    .values({ projectId, portee, cibleId: r.cibleId, profondeur: p, etape: etapeInitiale(p) })
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
    .values({ projectId, portee, cibleId: r.cibleId, profondeur: p, etape: etapeInitiale(p as Profondeur) })
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
    .set({ messages: [], consigne: "", briefPret: false, propositionId: null, etape: etapeInitiale(conv.profondeur as Profondeur), updatedAt: new Date() })
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
  if (await tacheActive(conv.id, ["tour", "brief"])) return ERR("L'agent est déjà en train de répondre : attends sa réponse.");

  const messages = [...((conv.messages as MessageConversation[]) ?? []), { role: "user" as const, content: message, at: new Date().toISOString() }];
  const run = await db.transaction(async (tx) => {
    await tx.update(agentConversations).set({ messages, briefPret: false, etape: "conversation", updatedAt: new Date() }).where(eq(agentConversations.id, conv.id));
    return creerRun(tx, {
      skill: "conversation-agent",
      entree: messages.map((m) => ({ role: m.role, content: m.content })),
      but: "tour",
      projectId: conv.projectId,
      conversationId: conv.id,
    });
  });
  return { ok: true, runUuid: run.uuid };
}

// --- brief ------------------------------------------------------------------

export async function genererBrief(conversationUuid: string): Promise<Resultat<{ runUuid: string }>> {
  const conv = await conversationParUuid(conversationUuid);
  if (!conv) return ERR("Conversation introuvable.");
  if (conv.profondeur !== "complete") return ERR("Le brief ne se génère que dans une conversation complète.");
  const messages = (conv.messages as MessageConversation[]) ?? [];
  if (!messages.some((m) => m.role === "user")) return ERR("Parle d'abord de ton projet à l'agent.");
  const [existant] = await db.select({ statut: briefs.statut }).from(briefs).where(eq(briefs.projectId, conv.projectId));
  if (existant?.statut === "valide") return ERR("Ce projet a déjà un brief validé : modifie-le section par section.");
  if (await tacheActive(conv.id, ["tour", "brief"])) return ERR("Une réponse de l'agent est déjà en cours.");

  const entree = [
    ...messages.map((m) => ({ role: m.role, content: m.content })),
    {
      role: "user" as const,
      content:
        "Rédige maintenant le brief complet à partir de tout ce qui a été dit, sans poser de question : ce que je n'ai pas tranché est une invention (inventions) ou une question ouverte (questionsOuvertes). Remplis `statuts`.",
    },
  ];
  const run = await creerRun(db, { skill: "brief-projet", entree, but: "brief", projectId: conv.projectId, conversationId: conv.id });
  await db.update(agentConversations).set({ updatedAt: new Date() }).where(eq(agentConversations.id, conv.id));
  return { ok: true, runUuid: run.uuid };
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
  if (await tacheActive(conv.id)) return ERR("Une tâche de l'agent est déjà en cours sur cette conversation.");

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
  if (await tacheActive(conv.id)) return ERR("Une tâche de l'agent est déjà en cours sur cette conversation.");

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
  if (await tacheActive(conv.id)) return ERR("Une tâche de l'agent est déjà en cours sur cette conversation.");
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
    .where(eq(assets.projectId, projectId));
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
  if (await tacheActive(conv.id)) return ERR("Une tâche de l'agent est déjà en cours sur cette conversation.");
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
  if (codeAsset) {
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

