import type { Position, PlaceScene, Resultat, BriefContenu, StatutChamp, Portee } from "./types";
import { type EntreeSkill, entreePromptAsset, entreeScenarioEpisode, entreeCorrectionPlan } from "./context";
import { db } from "../../db";
import { assets, plans, briefs, episodes, scenes, propositions } from "../../db/schema";
import { and, eq, inArray } from "drizzle-orm";
import { TYPE_AFFICHE } from "../posters/posters";
import { entreePromptAffiche } from "./poster";
import { squeletteDepuisBrief } from "./skeleton";
import { enregistrerChangements } from "./proposal-db";
import { creerRun } from "./runs";
import { ConversationRow, conversationParUuid } from "./service-conversation";
import { ERR, refusSiTacheActive } from "./service-shared";
import { genererScenarios } from "./service-episodes";
import { nouvelleProposition } from "./service-proposals";

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
