import { type ContexteAjoutPlan, etapesAjoutPlan, type PlaceScene, type ContexteAjoutScene, etapesAjoutScene, etapeCouranteDemande, decisionAjoutPlan, avancerEtapes, decisionAjoutScene } from "./requests";
import type { Resultat } from "../agents/types";
import { db } from "../../db";
import { episodes, demandes, scenes, agentRuns, propositions, plans } from "../../db/schema";
import { and, eq, desc } from "drizzle-orm";
import { ouvrirConversation } from "../agents/service-conversation";
import { genererProposition } from "../agents/service-dispatch";
import { ERREUR_ANNULEE } from "./cancellation";
import { lireProposition } from "../agents/queries-agents";
import { cocherChangements, appliquerSelection } from "../agents/service-proposals";
import { CONSIGNE_SCENE_LIBRE, ERR, LigneDemande, ecrire, lireEtapes } from "./requests-shared";

/** « Ajouter un plan » (Screenplay page): ONE request (the agent writes the clip → it is added to the scene, without review: we re-read it in its sheet).
 * Only one at a time per film (the target is the episode, the partial unique index does the rest). */
export async function lancerDemandeAjoutPlan(
  projectId: number,
  episodeId: number,
  options: { consigne: string; position: ContexteAjoutPlan["position"]; sceneId: number | null; scene: string },
): Promise<Resultat<{ demandeId: number }>> {
  const consigne = options.consigne.trim();
  if (!consigne) return ERR("Décris le plan à ajouter.");
  const [ep] = await db.select({ id: episodes.id }).from(episodes).where(and(eq(episodes.id, episodeId), eq(episodes.projectId, projectId)));
  if (!ep) return ERR("Épisode introuvable.");
  const ouverte = await ouvrirConversation(projectId, "episode", { id: episodeId }, "courte");
  if (!ouverte.ok) return ouverte;
  const contexte: ContexteAjoutPlan = { consigne, sceneId: options.sceneId, scene: options.scene, position: options.position };
  let demande: { id: number };
  try {
    const [d] = await db.insert(demandes).values({ projectId, type: "ajout-plan", cibleType: "episode", cibleId: episodeId, etapes: etapesAjoutPlan(), contexte }).returning({ id: demandes.id });
    demande = d!;
  } catch {
    // The partial unique index: a clip is already being written for this film.
    return ERR("Un plan est déjà en cours d'écriture : attends qu'il finisse (ou annule-le depuis le panneau des tâches).");
  }
  const g = await genererProposition(ouverte.conversationUuid, { consigne, position: options.position, ...(options.sceneId != null ? { sceneId: options.sceneId } : {}), demandeId: demande.id });
  if (!g.ok) {
    await db.delete(demandes).where(eq(demandes.id, demande.id)); // nothing was sent: the request never existed
    return g;
  }
  await db.update(demandes).set({ contexte: { ...contexte, ...(g.runUuid ? { runUuid: g.runUuid } : {}) }, updatedAt: new Date() }).where(eq(demandes.id, demande.id));
  return { ok: true, demandeId: demande.id };
}

/** « Nouvelle scène » (Screenplay page): ONE request (the agent writes the scene and its clips → they are added to the film, without review). Same target as
 * adding a clip: only one request of this kind at a time per film. Without an instruction, the agent proposes the natural continuation of the neighbouring scenes. */
export async function lancerDemandeAjoutScene(
  projectId: number,
  episodeId: number,
  options: { consigne: string; place: PlaceScene; apres: string },
): Promise<Resultat<{ demandeId: number }>> {
  const [ep] = await db.select({ id: episodes.id }).from(episodes).where(and(eq(episodes.id, episodeId), eq(episodes.projectId, projectId)));
  if (!ep) return ERR("Épisode introuvable.");
  if ("apresSceneId" in options.place) {
    const [sc] = await db.select({ id: scenes.id }).from(scenes).where(and(eq(scenes.id, options.place.apresSceneId), eq(scenes.episodeId, episodeId)));
    if (!sc) return ERR("La scène de repère n'existe plus : recharge la page.");
  }
  const consigne = options.consigne.trim();
  const ouverte = await ouvrirConversation(projectId, "episode", { id: episodeId }, "courte");
  if (!ouverte.ok) return ouverte;
  const contexte: ContexteAjoutScene = { consigne, place: options.place, apres: options.apres };
  let demande: { id: number };
  try {
    const [d] = await db.insert(demandes).values({ projectId, type: "ajout-scene", cibleType: "episode", cibleId: episodeId, etapes: etapesAjoutScene(), contexte }).returning({ id: demandes.id });
    demande = d!;
  } catch {
    // The partial unique index: a clip or a scene is already being written for this film.
    return ERR("Un ajout est déjà en cours d'écriture : attends qu'il finisse (ou annule-le depuis le panneau des tâches).");
  }
  const g = await genererProposition(ouverte.conversationUuid, { consigne: consigne || CONSIGNE_SCENE_LIBRE, place: options.place, demandeId: demande.id });
  if (!g.ok) {
    await db.delete(demandes).where(eq(demandes.id, demande.id)); // nothing was sent: the request never existed
    return g;
  }
  await db.update(demandes).set({ contexte: { ...contexte, ...(g.runUuid ? { runUuid: g.runUuid } : {}) }, updatedAt: new Date() }).where(eq(demandes.id, demande.id));
  return { ok: true, demandeId: demande.id };
}

/** One turn of a clip addition: as long as the agent writes, we wait; once its proposal is ready, we apply only the change that creates the clip. */
export async function avancerAjoutPlan(d: LigneDemande): Promise<boolean> {
  const etapes = lireEtapes(d);
  const ctx = d.contexte as ContexteAjoutPlan;
  if (!etapeCouranteDemande(etapes)) {
    await ecrire(d, { statut: "termine" });
    return true;
  }
  const [run] = ctx.runUuid ? await db.select().from(agentRuns).where(eq(agentRuns.uuid, ctx.runUuid)) : [];
  if (!run) {
    await ecrire(d, { statut: "echoue", erreur: "La tâche de l'agent n'existe plus." });
    return true;
  }
  if (run.statut === "en_attente" || run.statut === "en_cours") return false;
  if (run.statut === "annulee" || (run.statut === "echoue" && run.erreur === ERREUR_ANNULEE)) {
    await ecrire(d, { statut: "annulee", erreur: null });
    return true;
  }
  if (run.statut !== "termine") {
    await ecrire(d, { statut: "echoue", erreur: run.erreur ?? "L'agent a échoué." });
    return true;
  }
  const [prop] = run.propositionId ? await db.select({ uuid: propositions.uuid }).from(propositions).where(eq(propositions.id, run.propositionId)) : [];
  if (!prop) {
    await ecrire(d, { statut: "echoue", erreur: "La proposition de l'agent est introuvable." });
    return true;
  }
  const decision = decisionAjoutPlan(await lireProposition(prop.uuid));
  switch (decision.action) {
    case "attendre":
      return false;
    case "echec":
      await ecrire(d, { statut: "echoue", erreur: decision.erreur });
      return true;
    case "fait":
      await ecrire(d, { statut: "termine", etapes: avancerEtapes(avancerEtapes(etapes, "agent", "fait"), "ajout", "fait") });
      return true;
    case "appliquer": {
      // Only the clip is added: any other change slipped into the proposal (a scene, an asset) stays unticked.
      const decoche = await cocherChangements(prop.uuid, { ids: decision.changementIds }, false);
      const coche = decoche.ok ? await cocherChangements(prop.uuid, { ids: [decision.planChangementId] }, true) : decoche;
      if (!coche.ok) {
        await ecrire(d, { statut: "echoue", erreur: coche.erreur });
        return true;
      }
      const a = await appliquerSelection(prop.uuid, { confirmeEcrasement: false });
      if (!a.ok) {
        await ecrire(d, { statut: "echoue", erreur: a.erreur });
        return true;
      }
      const [cree] = await db.select({ uuid: plans.uuid }).from(plans).where(and(eq(plans.episodeId, d.cibleId), eq(plans.titre, decision.titre))).orderBy(desc(plans.id)).limit(1);
      await ecrire(d, {
        statut: "termine",
        etapes: avancerEtapes(avancerEtapes(etapes, "agent", "fait"), "ajout", "fait"),
        contexte: { ...ctx, titre: decision.titre, ...(cree ? { planUuid: cree.uuid } : {}) },
        erreur: null,
      });
      return true;
    }
  }
}

/** One turn of a new scene: same wait as a clip addition; once the proposal is ready, we apply only the scene and its clips. */
export async function avancerAjoutScene(d: LigneDemande): Promise<boolean> {
  const etapes = lireEtapes(d);
  const ctx = d.contexte as ContexteAjoutScene;
  if (!etapeCouranteDemande(etapes)) {
    await ecrire(d, { statut: "termine" });
    return true;
  }
  const [run] = ctx.runUuid ? await db.select().from(agentRuns).where(eq(agentRuns.uuid, ctx.runUuid)) : [];
  if (!run) {
    await ecrire(d, { statut: "echoue", erreur: "La tâche de l'agent n'existe plus." });
    return true;
  }
  if (run.statut === "en_attente" || run.statut === "en_cours") return false;
  if (run.statut === "annulee" || (run.statut === "echoue" && run.erreur === ERREUR_ANNULEE)) {
    await ecrire(d, { statut: "annulee", erreur: null });
    return true;
  }
  if (run.statut !== "termine") {
    await ecrire(d, { statut: "echoue", erreur: run.erreur ?? "L'agent a échoué." });
    return true;
  }
  const [prop] = run.propositionId ? await db.select({ uuid: propositions.uuid }).from(propositions).where(eq(propositions.id, run.propositionId)) : [];
  if (!prop) {
    await ecrire(d, { statut: "echoue", erreur: "La proposition de l'agent est introuvable." });
    return true;
  }
  const decision = decisionAjoutScene(await lireProposition(prop.uuid));
  switch (decision.action) {
    case "attendre":
      return false;
    case "echec":
      await ecrire(d, { statut: "echoue", erreur: decision.erreur });
      return true;
    case "fait":
      await ecrire(d, { statut: "termine", etapes: avancerEtapes(avancerEtapes(etapes, "agent", "fait"), "ajout", "fait") });
      return true;
    case "appliquer": {
      // Only the scene and its clips are added: any other change slipped into the proposal (an asset) stays unticked.
      const decoche = await cocherChangements(prop.uuid, { ids: decision.tous }, false);
      const coche = decoche.ok ? await cocherChangements(prop.uuid, { ids: decision.changementIds }, true) : decoche;
      if (!coche.ok) {
        await ecrire(d, { statut: "echoue", erreur: coche.erreur });
        return true;
      }
      const a = await appliquerSelection(prop.uuid, { confirmeEcrasement: false });
      if (!a.ok) {
        await ecrire(d, { statut: "echoue", erreur: a.erreur });
        return true;
      }
      const [creee] = await db.select({ id: scenes.id }).from(scenes).where(and(eq(scenes.episodeId, d.cibleId), eq(scenes.titre, decision.titre))).orderBy(desc(scenes.id)).limit(1);
      await ecrire(d, {
        statut: "termine",
        etapes: avancerEtapes(avancerEtapes(etapes, "agent", "fait"), "ajout", "fait"),
        contexte: { ...ctx, titre: decision.titre, ...(creee ? { sceneId: creee.id } : {}) },
        erreur: null,
      });
      return true;
    }
  }
}
