import { type Portee, type CibleDemandee, PORTEES, type Profondeur, type MessageConversation, type Resultat, type StatutChamp } from "./types";
import { db } from "../../db";
import { projects, episodes, plans, assets, agentConversations, agentRuns, propositions, briefs } from "../../db/schema";
import { eq, and, isNull, inArray } from "drizzle-orm";
import { TYPE_AFFICHE } from "../posters/posters";
import { accrocheEntretien } from "./hook";
import { type Fiche, entreeNotes, ficheVersBrief } from "./sheet";
import { ouvertureConcue, lireConception } from "../projects/design-db";
import { creerRun } from "./runs";
import { choixActif, selectionValide, formulerReponse } from "./choice";
import { ficheCourante } from "./sheet-db";
import { ecrireBrouillon, creerBriefPartiel, synchroniserClauseStyle } from "./brief-db";
import { estCleSection, SECTIONS_FIGEES_PAR_LA_CONCEPTION, sousSchemaSection, SCHEMA_BRIEF } from "./brief";
import { valider } from "../llm/validation";
import { ERR, refusSiTacheActive } from "./service-shared";

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

export type ConversationRow = typeof agentConversations.$inferSelect;

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
    .set({ statut: "annulee" })
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
