import { and, desc, eq } from "drizzle-orm";
import { db } from "../db";
import { agentConversations, agentRuns, demandes, episodes, jobs, plans, propositions, scenes } from "../db/schema";
import { appliquerSelection, cocherChangements, conversationParUuid, genererFiches, genererIteration, genererProposition, genererReecriturePlan, ouvrirConversation } from "./agents/service";
import { ERREUR_ANNULEE } from "./annulation";
import { demanderAnnulation } from "./annulation-db";
import {
  avancerEtapes,
  decisionAjoutPlan,
  decisionAjoutScene,
  decisionFichePlan,
  deciderIteration,
  etapeCouranteDemande,
  etapesAjoutPlan,
  etapesAjoutScene,
  etapesFichePlan,
  etapesIterationPlan,
  type CleEtapeIteration,
  type ContexteAjoutPlan,
  type ContexteAjoutScene,
  type ContexteFichePlan,
  type PlaceScene,
  type ContexteIteration,
  type EtapeDemande,
  type ObservationIteration,
  type StatutDemande,
} from "./demandes";
import { decisionIteration } from "./fiche-plan";
import { appliquerIterationEtGenererCore } from "./iteration-application";
import { lireProposition } from "./queries-agents";
import { cleLlm, cleVideo } from "./taches";
import type { Resultat } from "./agents/types";

/** Le PILOTE des demandes (règles dans lib/demandes.ts). `piloterDemandes` est appelé à chaque tour de la boucle « installateur » du
 * worker : une transition au plus par demande en cours, état dans `demandes` (reprise sur redémarrage, rien en mémoire). Une seule
 * boucle le fait tourner, donc pas de course entre deux pilotes. Ne touche jamais au GPU : il pose des tâches, les voies les prennent. */

export type LigneDemande = typeof demandes.$inferSelect;
const ERR = (erreur: string) => ({ ok: false as const, erreur });

const lireEtapes = (d: LigneDemande): EtapeDemande[] => (Array.isArray(d.etapes) ? (d.etapes as EtapeDemande[]) : []);
const lireContexte = (d: LigneDemande): ContexteIteration => d.contexte as ContexteIteration;

/** « Itérer » un plan : UNE demande (consigne → agent → réécriture si besoin → rendu). Refusée si le plan en a déjà une en cours. */
export async function lancerDemandeIteration(
  conversationUuid: string,
  options: { retour: string; renduId?: number | null; planche?: boolean; depuisNumero: number | null; reglages?: ContexteIteration["reglages"] },
): Promise<Resultat<{ demandeId: number; demandeUuid: string; runUuid: string; propositionUuid: string }>> {
  const conv = await conversationParUuid(conversationUuid);
  if (!conv) return ERR("Conversation introuvable.");
  if (conv.portee !== "plan" || conv.cibleId == null) return ERR("« Itérer » se demande depuis la page d'un plan.");
  const contexte: ContexteIteration = { consigne: options.retour.trim(), depuisNumero: options.depuisNumero, reglages: options.reglages ?? {} };
  let demande: { id: number; uuid: string };
  try {
    const [d] = await db
      .insert(demandes)
      .values({ projectId: conv.projectId, type: "iteration-plan", cibleType: "plan", cibleId: conv.cibleId, etapes: etapesIterationPlan(), contexte })
      .returning({ id: demandes.id, uuid: demandes.uuid });
    demande = d!;
  } catch {
    // L'index unique partiel : une demande est déjà en cours sur ce plan.
    return ERR("Une itération est déjà en cours sur ce plan : attends qu'elle finisse (ou annule-la depuis le panneau des tâches).");
  }
  const g = await genererIteration(conversationUuid, { retour: options.retour, renduId: options.renduId, planche: options.planche, demandeId: demande.id });
  if (!g.ok) {
    await db.delete(demandes).where(eq(demandes.id, demande.id)); // rien n'est parti : la demande n'a jamais existé
    return g;
  }
  await db.update(demandes).set({ contexte: { ...contexte, runUuid: g.runUuid }, updatedAt: new Date() }).where(eq(demandes.id, demande.id));
  return { ok: true, demandeId: demande.id, demandeUuid: demande.uuid, runUuid: g.runUuid, propositionUuid: g.propositionUuid };
}

/** « Ajouter un plan » (page Scénario) : UNE demande (l'agent écrit le plan → il est ajouté à la scène, sans relecture : on le relit dans sa fiche).
 * Une seule à la fois par film (la cible est l'épisode, l'index unique partiel fait le reste). */
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
    // L'index unique partiel : un plan est déjà en cours d'écriture pour ce film.
    return ERR("Un plan est déjà en cours d'écriture : attends qu'il finisse (ou annule-le depuis le panneau des tâches).");
  }
  const g = await genererProposition(ouverte.conversationUuid, { consigne, position: options.position, ...(options.sceneId != null ? { sceneId: options.sceneId } : {}), demandeId: demande.id });
  if (!g.ok) {
    await db.delete(demandes).where(eq(demandes.id, demande.id)); // rien n'est parti : la demande n'a jamais existé
    return g;
  }
  await db.update(demandes).set({ contexte: { ...contexte, ...(g.runUuid ? { runUuid: g.runUuid } : {}) }, updatedAt: new Date() }).where(eq(demandes.id, demande.id));
  return { ok: true, demandeId: demande.id };
}

/** « Nouvelle scène » (page Scénario) : UNE demande (l'agent écrit la scène et ses plans → ils sont ajoutés au film, sans relecture). Même cible que
 * l'ajout d'un plan : une seule demande de ce genre à la fois par film. Sans consigne, l'agent propose la suite naturelle des scènes voisines. */
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
    // L'index unique partiel : un plan ou une scène est déjà en cours d'écriture pour ce film.
    return ERR("Un ajout est déjà en cours d'écriture : attends qu'il finisse (ou annule-le depuis le panneau des tâches).");
  }
  const g = await genererProposition(ouverte.conversationUuid, { consigne: consigne || CONSIGNE_SCENE_LIBRE, place: options.place, demandeId: demande.id });
  if (!g.ok) {
    await db.delete(demandes).where(eq(demandes.id, demande.id)); // rien n'est parti : la demande n'a jamais existé
    return g;
  }
  await db.update(demandes).set({ contexte: { ...contexte, ...(g.runUuid ? { runUuid: g.runUuid } : {}) }, updatedAt: new Date() }).where(eq(demandes.id, demande.id));
  return { ok: true, demandeId: demande.id };
}

/** « Générer la fiche » d'un plan (pages Scénario et Plan) : UNE demande (l'agent `plan-h3` écrit la fiche → elle est enregistrée sans relecture, on la
 * relit dans la page du plan). Réservée aux plans sans fiche : réécrire une fiche existante passe par « Itérer ». */
export async function lancerDemandeFichePlan(projectId: number, planUuid: string): Promise<Resultat<{ demandeId: number }>> {
  const [plan] = await db.select({ id: plans.id, titre: plans.titre, statut: plans.statut }).from(plans).where(and(eq(plans.uuid, planUuid), eq(plans.projectId, projectId)));
  if (!plan) return ERR("Plan introuvable.");
  if (plan.statut !== "brouillon") return ERR("Ce plan a déjà une fiche.");
  const ouverte = await ouvrirConversation(projectId, "plan", { uuid: planUuid }, "courte");
  if (!ouverte.ok) return ouverte;
  const contexte: ContexteFichePlan = { titre: plan.titre, planUuid };
  let demande: { id: number };
  try {
    const [d] = await db.insert(demandes).values({ projectId, type: "fiche-plan", cibleType: "plan", cibleId: plan.id, etapes: etapesFichePlan(), contexte }).returning({ id: demandes.id });
    demande = d!;
  } catch {
    // L'index unique partiel : une demande est déjà en cours sur ce plan.
    return ERR("Une demande est déjà en cours sur ce plan : attends qu'elle finisse (ou annule-la depuis le panneau des tâches).");
  }
  const g = await genererFiches(ouverte.conversationUuid, { planUuids: [planUuid], demandeId: demande.id });
  if (!g.ok) {
    await db.delete(demandes).where(eq(demandes.id, demande.id)); // rien n'est parti : la demande n'a jamais existé
    return g;
  }
  await db.update(demandes).set({ contexte: { ...contexte, ...(g.runUuid ? { runUuid: g.runUuid } : {}) }, updatedAt: new Date() }).where(eq(demandes.id, demande.id));
  return { ok: true, demandeId: demande.id };
}

/** Le briefing quand l'auteur n'en a pas donné : l'agent propose lui-même la scène qui s'enchaîne. */
const CONSIGNE_SCENE_LIBRE = "Propose la scène qui s'enchaîne naturellement entre les deux scènes voisines, à partir du brief.";

async function ecrire(d: LigneDemande, maj: { etapes?: EtapeDemande[]; contexte?: ContexteIteration | ContexteAjoutPlan | ContexteAjoutScene | ContexteFichePlan; statut?: StatutDemande; erreur?: string | null }): Promise<void> {
  const fin = maj.statut && maj.statut !== "en_cours";
  await db
    .update(demandes)
    .set({
      ...(maj.etapes ? { etapes: maj.etapes } : {}),
      ...(maj.contexte ? { contexte: maj.contexte } : {}),
      ...(maj.statut ? { statut: maj.statut } : {}),
      ...(maj.erreur !== undefined ? { erreur: maj.erreur } : {}),
      ...(fin ? { finishedAt: new Date() } : {}),
      updatedAt: new Date(),
    })
    .where(and(eq(demandes.id, d.id), eq(demandes.statut, "en_cours"))); // une demande annulée entre-temps ne se rouvre pas
}

/** Un tour du pilote : fait avancer chaque demande en cours d'une transition. Ne rejette jamais (une demande qui plante passe en échec
 * avec son message, les autres continuent). Renvoie combien de demandes sont en cours et combien ont bougé. */
export async function piloterDemandes(): Promise<{ actives: number; touchees: number }> {
  const lignes = await db.select().from(demandes).where(eq(demandes.statut, "en_cours"));
  let touchees = 0;
  for (const d of lignes) {
    try {
      if (await avancer(d)) touchees += 1;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[worker] Demande ${d.id} (${d.type}) : ${message}`);
      await ecrire(d, { statut: "echoue", erreur: message.slice(0, 500) });
      touchees += 1;
    }
  }
  return { actives: lignes.length, touchees };
}

async function observer(d: LigneDemande, cle: CleEtapeIteration, ctx: ContexteIteration): Promise<{ obs: ObservationIteration; propositionUuid: string | null; conversationUuid: string | null }> {
  if (cle === "rendu") {
    const [j] = ctx.jobId != null ? await db.select({ statut: jobs.statut, erreur: jobs.erreur }).from(jobs).where(eq(jobs.id, ctx.jobId)) : [];
    return { obs: { tache: j ? { genre: "job", statut: j.statut, erreur: j.erreur } : null, decision: null }, propositionUuid: null, conversationUuid: null };
  }
  const [r] = ctx.runUuid ? await db.select().from(agentRuns).where(eq(agentRuns.uuid, ctx.runUuid)) : [];
  if (!r) return { obs: { tache: null, decision: null }, propositionUuid: null, conversationUuid: null };
  const tache = { genre: "run" as const, statut: r.statut, erreur: r.erreur };
  const [prop] = r.propositionId ? await db.select({ uuid: propositions.uuid }).from(propositions).where(eq(propositions.id, r.propositionId)) : [];
  const [conv] = r.conversationId ? await db.select({ uuid: agentConversations.uuid }).from(agentConversations).where(eq(agentConversations.id, r.conversationId)) : [];
  const decision = r.statut === "termine" && prop ? decisionIteration(await lireProposition(prop.uuid)) : null;
  return { obs: { tache, decision }, propositionUuid: prop?.uuid ?? null, conversationUuid: conv?.uuid ?? null };
}

/** Un tour d'un ajout de plan : tant que l'agent écrit, on attend ; sa proposition prête, on n'applique que le changement qui crée le plan. */
async function avancerAjoutPlan(d: LigneDemande): Promise<boolean> {
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
      // Seul le plan est ajouté : tout autre changement glissé dans la proposition (une scène, un asset) reste décoché.
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

/** Un tour d'une nouvelle scène : même attente que l'ajout d'un plan ; la proposition prête, on n'applique que la scène et ses plans. */
async function avancerAjoutScene(d: LigneDemande): Promise<boolean> {
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
      // Seules la scène et ses plans sont ajoutés : tout autre changement glissé dans la proposition (un asset) reste décoché.
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

/** Un tour d'une fiche de plan : même attente que les ajouts ; la proposition prête, on enregistre la fiche et les assets manquants qu'elle cite. */
async function avancerFichePlan(d: LigneDemande): Promise<boolean> {
  const etapes = lireEtapes(d);
  const ctx = d.contexte as ContexteFichePlan;
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
  const lue = await lireProposition(prop.uuid);
  const decision = decisionFichePlan(lue);
  const fini = avancerEtapes(avancerEtapes(etapes, "agent", "fait"), "ecriture", "fait");
  switch (decision.action) {
    case "attendre":
      return false;
    case "echec":
      await ecrire(d, { statut: "echoue", erreur: decision.erreur });
      return true;
    case "fait":
      await ecrire(d, { statut: "termine", etapes: fini });
      return true;
    case "appliquer": {
      // La fiche et les assets qu'elle cite sont retenus ; tout autre changement glissé dans la proposition reste décoché.
      const tous = (lue?.groupes ?? []).flatMap((g) => g.changements.map((c) => c.id));
      const decoche = await cocherChangements(prop.uuid, { ids: tous }, false);
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
      await ecrire(d, { statut: "termine", etapes: fini, erreur: null });
      return true;
    }
  }
}

async function avancer(d: LigneDemande): Promise<boolean> {
  if (d.type === "fiche-plan") return avancerFichePlan(d);
  if (d.type === "ajout-plan") return avancerAjoutPlan(d);
  if (d.type === "ajout-scene") return avancerAjoutScene(d);
  if (d.type !== "iteration-plan") return false;
  const etapes = lireEtapes(d);
  const ctx = lireContexte(d);
  const cur = etapeCouranteDemande(etapes);
  if (!cur) {
    await ecrire(d, { statut: "termine" });
    return true;
  }
  const cle = cur.cle as CleEtapeIteration;
  const { obs, propositionUuid, conversationUuid } = await observer(d, cle, ctx);
  const decision = deciderIteration(cle, obs);

  switch (decision.type) {
    case "attendre":
      return false;
    case "annuler":
      await ecrire(d, { statut: "annulee", erreur: null });
      return true;
    case "echouer":
      await ecrire(d, { statut: "echoue", erreur: decision.erreur });
      return true;
    case "terminer":
      await ecrire(d, { statut: "termine", etapes: avancerEtapes(etapes, "rendu", "fait"), erreur: null });
      return true;
    case "appliquer": {
      if (!propositionUuid) {
        await ecrire(d, { statut: "echoue", erreur: "La proposition de cette étape est introuvable." });
        return true;
      }
      const r = await appliquerIterationEtGenererCore(d.cibleId, propositionUuid, { consigne: ctx.consigne, depuisNumero: ctx.depuisNumero, demandeId: d.id }, ctx.reglages ?? {});
      if (!r.ok) {
        await ecrire(d, { statut: "echoue", erreur: r.erreur });
        return true;
      }
      // Appliquée + rendu créé : la correction n'a pas eu besoin de réécriture si on était encore à l'étape « agent ».
      await ecrire(d, { etapes: avancerEtapes(etapes, cle, "fait", cle === "agent" ? ["reecriture"] : []), contexte: { ...ctx, jobId: r.jobId, numeroRendu: r.numeroRendu, notes: r.notes } });
      return true;
    }
    case "reecrire": {
      if (!conversationUuid) {
        await ecrire(d, { statut: "echoue", erreur: "Conversation introuvable." });
        return true;
      }
      const g = await genererReecriturePlan(conversationUuid, {
        consigne: ctx.consigne,
        description: decision.description,
        ...(decision.dureeSecondes ? { dureeSecondes: decision.dureeSecondes } : {}),
        demandeId: d.id,
      });
      if (!g.ok) {
        if (/déjà en cours/i.test(g.erreur)) return false; // la conversation est prise par autre chose : au prochain tour
        await ecrire(d, { statut: "echoue", erreur: g.erreur });
        return true;
      }
      await ecrire(d, { etapes: avancerEtapes(etapes, "agent", "fait"), contexte: { ...ctx, runUuid: g.runUuid } });
      return true;
    }
  }
}

/** Annule la demande : elle passe à « annulée » tout de suite (le pilote ne la touche plus) et la tâche en cours est annulée avec elle
 * (en file : retirée ; en cours : le worker l'interrompt). Ce qui est déjà écrit n'est pas défait. */
export async function annulerDemande(demandeId: number): Promise<"annulee" | "rien"> {
  const [d] = await db.select().from(demandes).where(eq(demandes.id, demandeId));
  if (!d || d.statut !== "en_cours") return "rien";
  await ecrire(d, { statut: "annulee", erreur: null });
  const ctx = lireContexte(d);
  const cur = etapeCouranteDemande(lireEtapes(d));
  if (cur?.cle === "rendu" && ctx.jobId != null) await demanderAnnulation(cleVideo(ctx.jobId));
  else if (ctx.runUuid) await demanderAnnulation(cleLlm(ctx.runUuid));
  return "annulee";
}

/** Ce que la page d'un plan lit pour suivre sa demande (sondage). */
export type VueDemande = {
  statut: StatutDemande;
  etapes: EtapeDemande[];
  /** Étape en cours (libellé), null quand c'est fini. */
  etapeLibelle: string | null;
  erreur: string | null;
  /** Le rendu créé (étape « rendu » atteinte) : la page peut accuser le lancement. */
  numeroRendu: number | null;
  notes: string[];
};

export async function lireDemandeVue(demandeId: number): Promise<VueDemande | null> {
  const [d] = await db.select().from(demandes).where(eq(demandes.id, demandeId));
  if (!d) return null;
  const ctx = lireContexte(d);
  const etapes = lireEtapes(d);
  return {
    statut: d.statut as StatutDemande,
    etapes,
    etapeLibelle: etapeCouranteDemande(etapes)?.libelle ?? null,
    erreur: d.erreur,
    numeroRendu: ctx.jobId != null ? (ctx.numeroRendu ?? null) : null,
    notes: ctx.notes ?? [],
  };
}

