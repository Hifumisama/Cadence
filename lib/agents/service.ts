import { and, eq, inArray, isNull } from "drizzle-orm";
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
import type { BriefContenu, CibleDemandee, MessageConversation, Portee, Position, Profondeur, Resultat, StatutChamp } from "./types";
import { PORTEES } from "./types";
import { controleDuree } from "./applicateurs/plan";
import { cocheParDefaut, groupeAffiche, raisonNonCochable } from "./cochage";
import { entreeCorrectionPlan, entreePromptAsset, entreeScenarioEpisode, type EntreeSkill } from "./contexte";
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
    if (portee === "projet") await db.delete(briefs).where(and(eq(briefs.projectId, projectId), eq(briefs.statut, "brouillon")));
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
  if (b) await db.delete(briefs).where(eq(briefs.id, b.id));
  await db
    .update(agentConversations)
    .set({ etape: "conversation", briefPret: false, propositionId: null, updatedAt: new Date() })
    .where(eq(agentConversations.id, conv.id));
  return { ok: true };
}

export async function modifierChampBrief(projectId: number, section: string, valeur: unknown): Promise<Resultat> {
  if (!estCleSection(section)) return ERR(`Section de brief inconnue : « ${section} ».`);
  const [b] = await db.select().from(briefs).where(eq(briefs.projectId, projectId));
  if (!b) return ERR("Ce projet n'a pas de brief.");
  const sous = sousSchemaSection(chargerSkill("brief-projet").schema, section);
  if (sous) {
    const v = valider({ $schema: "https://json-schema.org/draft/2020-12/schema", ...sous }, valeur);
    if (!v.ok) return ERR(`Valeur invalide pour « ${section} » : ${v.erreurs.join(" ; ")}`);
  }
  await db
    .update(briefs)
    .set({
      contenu: { ...(b.contenu as Record<string, unknown>), [section]: valeur },
      statuts: { ...(b.statuts as Record<string, StatutChamp>), [section]: "fourni" },
      version: b.version + 1,
      updatedAt: new Date(),
    })
    .where(eq(briefs.id, b.id));
  return { ok: true };
}

// --- proposition ------------------------------------------------------------

async function nouvelleProposition(conv: ConversationRow, p: { skill: string; consigne: string; contexte: unknown[]; parentId?: number | null; retour?: string | null }): Promise<number> {
  // Une seule proposition courante : la précédente, si elle attend encore, est rejetée.
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

  // Profondeur complète : le squelette se construit en code depuis le brief.
  if (conv.profondeur === "complete") {
    const [brief] = await db.select().from(briefs).where(eq(briefs.projectId, conv.projectId));
    if (!brief) return ERR("Génère d'abord le brief.");
    const [projet] = await db.select({ clauseStyle: projects.clauseStyle }).from(projects).where(eq(projects.id, conv.projectId));
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
      clauseStyle: projet?.clauseStyle ?? "",
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

  const consigne = (options.consigne ?? conv.consigne).trim();
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
  await db.update(propositions).set({ statut: "rejetee" }).where(eq(propositions.id, prop.id));
  if (prop.conversationId != null) {
    const [conv] = await db.select().from(agentConversations).where(eq(agentConversations.id, prop.conversationId));
    if (conv && conv.propositionId === prop.id) {
      await db
        .update(agentConversations)
        .set({ propositionId: null, etape: conv.profondeur === "complete" ? "brief" : "consigne", updatedAt: new Date() })
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

export async function appliquerSelection(propositionUuid: string, options: { confirmeEcrasement?: boolean } = {}): Promise<ResultatApplication> {
  const prop = await propositionParUuid(propositionUuid);
  if (!prop) return { ok: false, erreur: "Proposition introuvable." };
  return appliquerProposition(prop.id, options);
}

