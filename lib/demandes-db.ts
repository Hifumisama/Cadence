import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "../db";
import { agentConversations, agentRuns, assets, demandes, episodes, jobs, plans, propositions, scenes } from "../db/schema";
import { appliquerSelection, cocherChangements, conversationParUuid, creerAssetsManquants, genererFiches, genererIteration, genererPromptsAssets, genererProposition, genererReecriturePlan, genererReferencesPlan, ouvrirConversation } from "./agents/service";
import { annulerLot } from "./agents/lots";
import { cleNouvelAsset } from "./agents/fiches";
import { referencesApresDecisions } from "./h3ir/brief-plan";
import { choisirReferencesPlan } from "./h3ir/references-plan-db";
import { ecrireReferencesPlan } from "./h3ir/references-ecriture";
import { deciderImages, deciderReferences, libelleAssets, libelleImages, libellePrompts } from "./h3ir/preparation";
import { assetsCreesParLeLot, attendUnPlanPrecedent, codesRefsVisuelles, ecrireReferencesDuSkill, etatImagesAssets, lancerImagesAssets } from "./h3ir/preparation-db";
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
  insererEtapesImagesIteration,
  renommerEtape,
  type CleEtapeIteration,
  type ContexteAjoutPlan,
  type ContexteAjoutScene,
  type ContexteFichePlan,
  type ParcoursFichePlan,
  type PlaceScene,
  type ContexteIteration,
  type EtapeDemande,
  type ObservationIteration,
  type StatutDemande,
} from "./demandes";
import { decisionIteration } from "./fiche-plan";
import { moteurParDefaut, refusReferences, type DemandeMoteur, type MoteurFiche } from "./h3ir/moteur";
import { etatsRefsVisuelles } from "./h3ir/moteur-db";
import { appliquerIterationEtGenererCore } from "./iteration-application";
import { lireProposition } from "./queries-agents";
import { cleLlm, cleVideo } from "./taches";
import type { DecisionsAffichees, DecisionsIteration, Resultat } from "./agents/types";

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
  options: { retour: string; renduId?: number | null; planche?: boolean; depuisNumero: number | null; reglages?: ContexteIteration["reglages"]; consignes?: string[] },
): Promise<Resultat<{ demandeId: number; demandeUuid: string; runUuid: string; propositionUuid: string }>> {
  const conv = await conversationParUuid(conversationUuid);
  if (!conv) return ERR("Conversation introuvable.");
  if (conv.portee !== "plan" || conv.cibleId == null) return ERR("« Itérer » se demande depuis la page d'un plan.");
  const contexte: ContexteIteration = { consigne: options.retour.trim(), depuisNumero: options.depuisNumero, reglages: options.reglages ?? {} };
  if (options.consignes && options.consignes.length > 1) contexte.consignes = options.consignes;
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

/** « Générer la fiche » d'un plan (pages Scénario et Plan, onglet « Brief Open H3 IR ») : UNE demande, enregistrée sans relecture (on la relit dans la
 * page du plan). Open H3 IR SEUL (vague 4a, lib/h3ir/preparation.ts) : un plan dont les références ont toutes leur image part tout de suite en
 * compilation (chemin rapide) ; sinon le pilote le PRÉPARE d'abord (références, assets manquants, prompts, images), tour après tour. La fiche compilée
 * peut remplacer une fiche existante (le clic vaut confirmation ; l'ancien prompt reste dans l'historique).
 * Options : `rechoisir` (rechoisir les références même si le plan en a déjà ; jamais par défaut), réglages Open H3 IR facultatifs (`shots`, `director`,
 * `creativity` : absents, ceux du plan, de sa scène ou du projet). `moteur: "plan-h3"` : retour arrière d'urgence (option interne, aucun bouton ; aussi
 * pour toute l'application par `CADENCE_MOTEUR_FICHE=plan-h3`), réservé aux plans sans fiche. */
export async function lancerDemandeFichePlan(projectId: number, planUuid: string, options: OptionsDemandeFiche = {}): Promise<Resultat<{ demandeId: number }>> {
  const [plan] = await db.select({ id: plans.id, titre: plans.titre, statut: plans.statut }).from(plans).where(and(eq(plans.uuid, planUuid), eq(plans.projectId, projectId)));
  if (!plan) return ERR("Plan introuvable.");
  const moteur: MoteurFiche = options.moteur === "plan-h3" ? "plan-h3" : options.moteur ? "h3ir" : moteurParDefaut();
  if (moteur === "plan-h3" && plan.statut !== "brouillon") return ERR("Ce plan a déjà une fiche (plan-h3 imposé n'écrit que les plans sans fiche).");
  let parcours: ParcoursFichePlan = "plan-h3";
  if (moteur === "h3ir") {
    const etat = (await etatsRefsVisuelles(projectId, [planUuid])).get(planUuid) ?? { total: 0, sansFichier: [] };
    parcours = !options.rechoisir && refusReferences(etat) == null ? "rapide" : "preparation";
  }
  const reglagesH3ir = { shots: options.shots ?? null, director: options.director ?? null, creativity: options.creativity ?? null };
  const ouverte = await ouvrirConversation(projectId, "plan", { uuid: planUuid }, "courte");
  if (!ouverte.ok) return ouverte;
  const contexte: ContexteFichePlan = {
    titre: plan.titre,
    planUuid,
    moteur,
    reglagesH3ir,
    ...(parcours === "preparation" ? { preparation: options.rechoisir ? { rechoisir: true } : {} } : {}),
  };
  let demande: { id: number };
  try {
    const [d] = await db.insert(demandes).values({ projectId, type: "fiche-plan", cibleType: "plan", cibleId: plan.id, etapes: etapesFichePlan(parcours), contexte }).returning({ id: demandes.id });
    demande = d!;
  } catch {
    // L'index unique partiel : une demande est déjà en cours sur ce plan.
    return ERR("Une demande est déjà en cours sur ce plan : attends qu'elle finisse (ou annule-la depuis le panneau des tâches).");
  }
  // Préparation : le pilote la mène (rien à poser maintenant). Chemin rapide ou plan-h3 : la tâche part tout de suite.
  if (parcours === "preparation") return { ok: true, demandeId: demande.id };
  const g = await genererFiches(ouverte.conversationUuid, { planUuids: [planUuid], demandeId: demande.id, moteur, reglagesH3ir });
  if (!g.ok) {
    await db.delete(demandes).where(eq(demandes.id, demande.id)); // rien n'est parti : la demande n'a jamais existé
    return g;
  }
  await db.update(demandes).set({ contexte: { ...contexte, ...(g.runUuid ? { runUuid: g.runUuid } : {}) }, updatedAt: new Date() }).where(eq(demandes.id, demande.id));
  return { ok: true, demandeId: demande.id };
}

export type OptionsDemandeFiche = {
  moteur?: DemandeMoteur;
  rechoisir?: boolean;
  shots?: number | null;
  director?: string | null;
  creativity?: string | null;
};

/** Les fiches de PLUSIEURS plans (« Écrire les fiches », et la création d'un projet) : une demande par plan, posées dans l'ORDRE DU SCÉNARIO (épisode,
 * puis `plans.ordre`) quel que soit l'ordre donné. Chaque plan est préparé puis compilé ; le choix des références suit l'ordre du scénario (un plan
 * attend que les plans d'avant aient leurs références : reprise du décor, assets créés par un plan visibles du suivant). Un plan refusé (demande déjà en
 * cours…) n'arrête pas les autres : ses raisons sont rendues. */
export async function lancerDemandesFiches(
  projectId: number,
  planUuids: string[],
  options: Omit<OptionsDemandeFiche, "moteur"> = {},
): Promise<{ lancees: number; demandeIds: number[]; erreurs: string[] }> {
  const voulus = [...new Set(planUuids)];
  const lus = voulus.length
    ? await db
        .select({ uuid: plans.uuid, numero: episodes.numero, ordre: plans.ordre, id: plans.id })
        .from(plans)
        .innerJoin(episodes, eq(episodes.id, plans.episodeId))
        .where(and(eq(plans.projectId, projectId), inArray(plans.uuid, voulus)))
    : [];
  const ordonnes = [...lus].sort((a, b) => a.numero - b.numero || a.ordre - b.ordre || a.id - b.id).map((p) => p.uuid);
  const erreurs: string[] = voulus.filter((u) => !ordonnes.includes(u)).map(() => "Plan introuvable.");
  const demandeIds: number[] = [];
  for (const uuid of ordonnes) {
    const r = await lancerDemandeFichePlan(projectId, uuid, options);
    if (r.ok) demandeIds.push(r.demandeId);
    else erreurs.push(r.erreur);
  }
  return { lancees: demandeIds.length, demandeIds, erreurs: [...new Set(erreurs)] };
}

/** Où en sont des demandes de fiche (la création d'un projet suit ainsi son lot) : statut, étape en cours, erreur, par demande. */
export async function etatDemandesFiches(demandeIds: number[]): Promise<{ id: number; planUuid: string; statut: StatutDemande; etape: string | null; erreur: string | null }[]> {
  if (demandeIds.length === 0) return [];
  const lignes = await db.select().from(demandes).where(inArray(demandes.id, demandeIds));
  return lignes.map((d) => ({
    id: d.id,
    planUuid: (d.contexte as ContexteFichePlan).planUuid,
    statut: d.statut as StatutDemande,
    etape: etapeCouranteDemande(lireEtapes(d))?.libelle ?? null,
    erreur: d.erreur,
  }));
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

// --- la fiche d'un plan : préparation puis compilation (vague 4a) -------------------------------------------------------------------------

type CtxPrep = NonNullable<ContexteFichePlan["preparation"]>;
const occupe = (erreur: string) => /déjà en cours/i.test(erreur);

/** Les codes des assets CRÉÉS par une proposition appliquée (ses créations, par leur clé `nouvel-asset-<code>`), qui existent au registre. */
async function codesCreesPar(projectId: number, propositionUuid: string): Promise<string[]> {
  const lue = await lireProposition(propositionUuid);
  const codes = (lue?.groupes ?? []).flatMap((g) => g.changements).filter((c) => c.cibleType === "asset" && c.operation === "creer").map((c) => (c.cle ?? "").replace(PREFIXE_NOUVEL_ASSET, "")).filter(Boolean);
  if (codes.length === 0) return [];
  return (await db.select({ code: assets.code }).from(assets).where(and(eq(assets.projectId, projectId), inArray(assets.code, codes)))).map((a) => a.code);
}
const PREFIXE_NOUVEL_ASSET = cleNouvelAsset("");

/** Coche tout ce qui passe (ni bloqué ni refusé) d'une proposition et l'applique sans relecture. */
async function appliquerToutCeQuiPasse(propositionUuid: string, confirmeEcrasement: boolean): Promise<Resultat> {
  const lue = await lireProposition(propositionUuid);
  const ids = (lue?.groupes ?? []).flatMap((g) => g.changements).filter((c) => !c.bloque && !c.refuseRaison).map((c) => c.id);
  if (ids.length) {
    const coche = await cocherChangements(propositionUuid, { ids }, true);
    if (!coche.ok) return coche;
  }
  const a = await appliquerSelection(propositionUuid, { confirmeEcrasement });
  return a.ok ? { ok: true } : ERR(a.erreur);
}

/** Étape `references` : garder celles du plan, écrire celles du code, ou attendre / appliquer la tâche `references-plan` (doute). */
async function avancerReferences(d: LigneDemande, ctx: ContexteFichePlan, etapes: EtapeDemande[]): Promise<boolean> {
  const prep: CtxPrep = ctx.preparation ?? {};
  const finir = async (crees: string[], note: string | null) => {
    let e = avancerEtapes(renommerEtape(etapes, "references", "Choix des références"), "references", "fait");
    e = crees.length ? avancerEtapes(renommerEtape(e, "assets", libelleAssets(crees.length)), "assets", "fait") : avancerEtapes(e, "assets", "passe");
    await ecrire(d, { etapes: e, contexte: { ...ctx, preparation: { ...prep, assetsCrees: crees }, ...(note ? { notes: [...(ctx.notes ?? []), note] } : {}) } });
    return true;
  };

  if (prep.referencesRunUuid) {
    const [run] = await db.select().from(agentRuns).where(eq(agentRuns.uuid, prep.referencesRunUuid));
    if (!run) return echouer(d, "La tâche de choix des références n'existe plus.");
    if (run.statut === "en_attente" || run.statut === "en_cours") return false;
    if (run.statut === "annulee" || (run.statut === "echoue" && run.erreur === ERREUR_ANNULEE)) return annuler(d);
    if (run.statut !== "termine") return echouer(d, `Le choix des références a échoué : ${run.erreur ?? "erreur inconnue"}`);
    const [prop] = run.propositionId ? await db.select({ id: propositions.id, uuid: propositions.uuid, statut: propositions.statut, resume: propositions.resume }).from(propositions).where(eq(propositions.id, run.propositionId)) : [];
    if (!prop) return echouer(d, "La proposition du choix des références est introuvable.");
    if (prop.statut === "en_generation") return false;
    if (prop.statut === "appliquee" || prop.statut === "partielle") return finir(await codesCreesPar(d.projectId, prop.uuid), prop.resume || null);
    if (prop.statut !== "prete") return echouer(d, "Le choix des références a été abandonné (proposition rejetée).");
    // Toutes les créations refusées ou bloquées par un contrôle : les références du skill (sans ces assets) s'écrivent quand même.
    const passables = ((await lireProposition(prop.uuid))?.groupes ?? []).flatMap((g) => g.changements).filter((c) => !c.bloque && !c.refuseRaison);
    if (passables.length === 0) {
      await ecrireReferencesDuSkill(db, prop.id, run.id);
      return finir([], `${prop.resume ? `${prop.resume} ` : ""}Les assets manquants proposés ont été refusés par un contrôle : à créer à la main si besoin.`);
    }
    const a = await appliquerToutCeQuiPasse(prop.uuid, false);
    if (!a.ok) return echouer(d, `Les assets manquants n'ont pas pu être créés : ${a.erreur}`);
    return finir(await codesCreesPar(d.projectId, prop.uuid), prop.resume || null);
  }

  const existantes = (await etatsRefsVisuelles(d.projectId, [ctx.planUuid])).get(ctx.planUuid)?.total ?? 0;
  const rechoisir = prep.rechoisir === true;
  const garde = existantes > 0 && !rechoisir;
  const attente = garde ? false : await attendUnPlanPrecedent(d.cibleId);
  const choix = garde || attente ? null : await choisirReferencesPlan(db, d.cibleId);
  const decision = deciderReferences({ existantes, rechoisir, precedentEnAttente: attente, choix: choix ? { suffit: choix.suffit, references: choix.references.map((r) => r.code) } : null });
  switch (decision.action) {
    case "attendre": {
      const libelle = "Choix des références (après le plan précédent)";
      if (etapes.find((e) => e.cle === "references")?.libelle === libelle) return false;
      await ecrire(d, { etapes: renommerEtape(etapes, "references", libelle) });
      return true;
    }
    case "garder": {
      const e = avancerEtapes(avancerEtapes(renommerEtape(etapes, "references", "Références déjà posées"), "references", "passe"), "assets", "passe");
      await ecrire(d, { etapes: e });
      return true;
    }
    case "ecrire": {
      const r = await ecrireReferencesPlan(db, d.cibleId, decision.codes, { remplacer: rechoisir });
      if (!r.ok && r.raison !== "deja-des-references") return echouer(d, "Aucune référence d'image n'a pu être écrite pour ce plan.");
      return finir([], r.ok ? `Références choisies par le code : ${decision.codes.join(", ")}.` : null);
    }
    case "skill": {
      const conv = await ouvrirConversation(d.projectId, "plan", { uuid: ctx.planUuid }, "courte");
      if (!conv.ok) return echouer(d, conv.erreur);
      const g = await genererReferencesPlan(conv.conversationUuid, { demandeId: d.id, rechoisir, assetsProposesParLeLot: await assetsCreesParLeLot(d.projectId, d.id) });
      if (!g.ok) return occupe(g.erreur) ? false : echouer(d, g.erreur);
      await ecrire(d, { contexte: { ...ctx, runUuid: g.runUuid, preparation: { ...prep, referencesRunUuid: g.runUuid } } });
      return true;
    }
    case "echec":
      return echouer(d, decision.erreur);
  }
}

/** Les étapes `prompts` et `images`, communes à la fiche d'un plan et à « Itérer » : `codes` = les références attendues (celles du plan, ou celles
 * qu'auront les décisions) ; `prep` / `ecrirePrep` : l'état gardé dans la demande ; `lancerSuite` : la compilation, quand toutes les images sont là
 * (rend false si sa conversation est occupée : on réessaie au tour suivant). */
async function avancerPromptsImages(
  d: LigneDemande,
  etapes: EtapeDemande[],
  cle: "prompts" | "images",
  codes: string[],
  prep: { promptsPropositionUuid?: string; imagesLancees?: string[] },
  ecrirePrep: (maj: { etapes?: EtapeDemande[]; prep?: { promptsPropositionUuid?: string; imagesLancees?: string[] } }) => Promise<void>,
  lancerSuite: (etapes: EtapeDemande[]) => Promise<boolean>,
): Promise<boolean> {
  if (cle === "prompts") {
    if (prep.promptsPropositionUuid) {
      const lue = await lireProposition(prep.promptsPropositionUuid);
      if (!lue) return echouer(d, "Le lot des prompts d'assets est introuvable.");
      if (lue.statut === "en_generation") return false;
      if (lue.statut === "prete") {
        const a = await appliquerToutCeQuiPasse(prep.promptsPropositionUuid, true);
        if (!a.ok) return echouer(d, `Les prompts d'assets n'ont pas pu être écrits : ${a.erreur}`);
      } else if (lue.statut !== "appliquee" && lue.statut !== "partielle") {
        return echouer(d, `Les prompts d'assets n'ont pas pu être écrits : ${lue.erreur ?? "le lot a échoué"}.`);
      }
      await ecrirePrep({ etapes: avancerEtapes(etapes, "prompts", "fait") });
      return true;
    }
    const dec = deciderImages(await etatImagesAssets(d.projectId, codes, d.createdAt));
    if (dec.action === "echec") return echouer(d, dec.erreur);
    if (dec.action !== "prompts") {
      await ecrirePrep({ etapes: avancerEtapes(etapes, "prompts", "passe") });
      return true;
    }
    const ids = (await db.select({ id: assets.id }).from(assets).where(and(eq(assets.projectId, d.projectId), inArray(assets.code, dec.codes)))).map((a) => a.id);
    const g = await genererPromptsAssets(d.projectId, ids, { demandeId: d.id });
    if (!g.ok) return echouer(d, g.erreur);
    await ecrirePrep({ etapes: renommerEtape(etapes, "prompts", libellePrompts(g.nbSousTaches)), prep: { ...prep, promptsPropositionUuid: g.propositionUuid } });
    return true;
  }

  // images
  const dec = deciderImages(await etatImagesAssets(d.projectId, codes, d.createdAt));
  switch (dec.action) {
    case "echec":
      return echouer(d, dec.erreur);
    case "prompts":
      return echouer(d, `Pas de prompt d'image pour ${dec.codes.join(", ")} : écris-le dans sa fiche d'asset (ou importe son image), puis relance.`);
    case "pret":
      return lancerSuite(avancerEtapes(renommerEtape(etapes, "images", libelleImages(dec.total, dec.total)), "images", "fait"));
    case "attendre": {
      const lancees = dec.aLancer.length ? await lancerImagesAssets(d.projectId, dec.aLancer) : { lancees: 0, ecartes: [] };
      const libelle = libelleImages(dec.faites, dec.total);
      const changeLibelle = etapes.find((e) => e.cle === "images")?.libelle !== libelle;
      if (lancees.lancees === 0 && !changeLibelle) return false;
      const deja = prep.imagesLancees ?? [];
      const nouvelles = dec.aLancer.filter((c) => !lancees.ecartes.some((e) => e.code === c) && !deja.includes(c));
      await ecrirePrep({ etapes: renommerEtape(etapes, "images", libelle), prep: { ...prep, imagesLancees: [...deja, ...nouvelles] } });
      return true;
    }
  }
}

const echouer = async (d: LigneDemande, erreur: string): Promise<boolean> => {
  await ecrire(d, { statut: "echoue", erreur: erreur.slice(0, 500) });
  return true;
};
const annuler = async (d: LigneDemande): Promise<boolean> => {
  await ecrire(d, { statut: "annulee", erreur: null });
  return true;
};

/** La compilation Open H3 IR de la fiche d'un plan préparé : la tâche part, l'étape `compilation` devient l'étape en cours. */
async function poserCompilation(d: LigneDemande, ctx: ContexteFichePlan, etapes: EtapeDemande[]): Promise<boolean> {
  const conv = await ouvrirConversation(d.projectId, "plan", { uuid: ctx.planUuid }, "courte");
  if (!conv.ok) return echouer(d, conv.erreur);
  const g = await genererFiches(conv.conversationUuid, { planUuids: [ctx.planUuid], demandeId: d.id, moteur: "h3ir", reglagesH3ir: ctx.reglagesH3ir ?? {} });
  if (!g.ok) return occupe(g.erreur) ? false : echouer(d, g.erreur);
  await ecrire(d, { etapes, contexte: { ...ctx, moteur: "h3ir", ...(g.runUuid ? { runUuid: g.runUuid } : {}) } });
  return true;
}

/** Un tour d'une fiche de plan. Préparation (Open H3 IR) : références → assets → prompts → images → compilation ; plan-h3 (retour arrière d'urgence) et
 * demandes d'avant la vague 4a : l'agent écrit la fiche, elle est enregistrée. */
async function avancerFichePlan(d: LigneDemande): Promise<boolean> {
  const etapes = lireEtapes(d);
  const ctx = d.contexte as ContexteFichePlan;
  const courante = etapeCouranteDemande(etapes);
  if (!courante) {
    await ecrire(d, { statut: "termine" });
    return true;
  }
  switch (courante.cle) {
    case "references":
      return avancerReferences(d, ctx, etapes);
    case "assets":
      await ecrire(d, { etapes: avancerEtapes(etapes, "assets", "passe") });
      return true;
    case "prompts":
    case "images": {
      const codes = await codesRefsVisuelles(d.cibleId);
      if (codes.length === 0) return echouer(d, "Ce plan n'a aucune image de référence, et aucune n'a pu être choisie : nomme dans sa description qui ou quoi est à l'image (ou ajoute une référence à la main), puis relance « Générer la fiche ».");
      const prep: CtxPrep = ctx.preparation ?? {};
      return avancerPromptsImages(
        d,
        etapes,
        courante.cle,
        codes,
        prep,
        (maj) => ecrire(d, { ...(maj.etapes ? { etapes: maj.etapes } : {}), ...(maj.prep ? { contexte: { ...ctx, preparation: { ...prep, ...maj.prep } } } : {}) }),
        (suite) => poserCompilation(d, { ...ctx, preparation: prep }, suite),
      );
    }
    default:
      return avancerTacheFiche(d, ctx, etapes, courante.cle);
  }
}

/** La tâche qui écrit la fiche : compilation Open H3 IR (`compilation`), ou plan-h3 et anciennes demandes (`agent` puis `ecriture`). Même attente que les
 * ajouts ; la proposition prête, on enregistre la fiche (et, pour plan-h3, les assets manquants qu'elle cite). */
async function avancerTacheFiche(d: LigneDemande, ctx: ContexteFichePlan, etapes: EtapeDemande[], cle: string): Promise<boolean> {
  const enCompilation = cle === "compilation";
  const [run] = ctx.runUuid ? await db.select().from(agentRuns).where(eq(agentRuns.uuid, ctx.runUuid)) : [];
  if (!run) return echouer(d, "La tâche de l'agent n'existe plus.");
  if (run.statut === "en_attente" || run.statut === "en_cours") return false;
  if (run.statut === "annulee" || (run.statut === "echoue" && run.erreur === ERREUR_ANNULEE)) return annuler(d);
  const prefixe = enCompilation ? "La compilation Open H3 IR a échoué : " : "";
  if (run.statut !== "termine") return echouer(d, `${prefixe}${run.erreur ?? "L'agent a échoué."}`);
  const [prop] = run.propositionId ? await db.select({ uuid: propositions.uuid }).from(propositions).where(eq(propositions.id, run.propositionId)) : [];
  if (!prop) return echouer(d, `${prefixe}La proposition de l'agent est introuvable.`);
  const lue = await lireProposition(prop.uuid);
  const decision = decisionFichePlan(lue);
  const fini = enCompilation ? avancerEtapes(etapes, "compilation", "fait") : avancerEtapes(avancerEtapes(etapes, "agent", "fait"), "ecriture", "fait");
  // Demandes d'avant la vague 4a (repli plan-h3 puis compilation) : la compilation n'est plus enchaînée ; « Générer la fiche » la refera.
  const suite = async () => {
    const legacy = !enCompilation && ctx.enchainerH3ir;
    await ecrire(d, {
      statut: "termine",
      etapes: legacy ? avancerEtapes(fini, "compilation", "passe") : fini,
      erreur: null,
      ...(legacy ? { contexte: { ...ctx, enchainerH3ir: false, notes: [...(ctx.notes ?? []), "Fiche écrite par plan-h3 ; « Générer la fiche » la recompilera avec Open H3 IR."] } } : {}),
    });
    return true;
  };
  switch (decision.action) {
    case "attendre":
      return false;
    case "echec":
      return echouer(d, `${prefixe}${decision.erreur}`);
    case "fait":
      return suite();
    case "appliquer": {
      // La fiche et les assets qu'elle cite sont retenus ; tout autre changement glissé dans la proposition reste décoché.
      const tous = (lue?.groupes ?? []).flatMap((g) => g.changements.map((c) => c.id));
      const decoche = await cocherChangements(prop.uuid, { ids: tous }, false);
      const coche = decoche.ok ? await cocherChangements(prop.uuid, { ids: decision.changementIds }, true) : decoche;
      if (!coche.ok) return echouer(d, `${prefixe}${coche.erreur}`);
      // Open H3 IR remplace la fiche existante sans redemander : le clic de l'utilisateur vaut confirmation, et l'ancien prompt est gardé dans l'historique.
      const a = await appliquerSelection(prop.uuid, { confirmeEcrasement: ctx.moteur === "h3ir" });
      if (!a.ok) return echouer(d, `${prefixe}${a.erreur}`);
      return suite();
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
  // Assets créés, prompts et images attendus avant la recompilation (vague 4a) : même mécanique que la fiche d'un plan.
  if (cur.cle === "assets") {
    await ecrire(d, { etapes: avancerEtapes(etapes, "assets", "passe") });
    return true;
  }
  if (cur.cle === "prompts" || cur.cle === "images") return avancerImagesIteration(d, ctx, etapes, cur.cle);
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
      const r = await appliquerIterationEtGenererCore(d.cibleId, propositionUuid, { consigne: ctx.consigne, depuisNumero: ctx.depuisNumero, demandeId: d.id, notes: ctx.notesAgent ?? [] }, ctx.reglages ?? {});
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
      // Toujours recompiler (2026-11-09) : les décisions de l'agent (intent, durée, références, réglages) partent en surcharge d'Open H3 IR et ne
      // s'écrivent qu'avec la fiche compilée. Vague 4a : les assets manquants décidés (deux au plus) sont créés tout de suite et ajoutés aux
      // références ; si une référence finale n'a pas d'image, ses prompts et ses images passent d'abord (étapes insérées), la recompilation suit seule.
      const vus = { ...ctx, decisions: decision.affichage, notesAgent: decision.notes };
      const { manquants, ...base } = decision.decisions;
      let crees: string[] = [];
      if (manquants?.length) {
        const c = await creerAssetsManquants(conversationUuid, manquants);
        if (!c.ok) {
          await ecrire(d, { statut: "echoue", erreur: c.erreur, contexte: vus });
          return true;
        }
        crees = c.crees;
      }
      const ajouter = [...new Set([...(base.references?.ajouter ?? []), ...crees])];
      const aRecompiler: DecisionsIteration = ajouter.length || base.references?.retirer.length ? { ...base, references: { ajouter, retirer: base.references?.retirer ?? [] } } : base;
      const [plan] = await db.select({ uuid: plans.uuid }).from(plans).where(eq(plans.id, d.cibleId));
      const finales = plan ? await referencesApresDecisions(d.projectId, plan.uuid, aRecompiler.references ?? {}) : null;
      if (finales && finales.inconnus.length === 0 && finales.sansImage.length > 0) {
        const e = avancerEtapes(insererEtapesImagesIteration(etapes, crees.length), "agent", "fait");
        await ecrire(d, { etapes: e, contexte: { ...vus, decisionsARecompiler: aRecompiler, preparation: { assetsCrees: crees } } });
        return true;
      }
      const g = await genererReecriturePlan(conversationUuid, { consigne: ctx.consigne, decisions: aRecompiler, demandeId: d.id });
      if (!g.ok) {
        if (/déjà en cours/i.test(g.erreur)) return false; // la conversation est prise par autre chose : au prochain tour
        await ecrire(d, { statut: "echoue", erreur: g.erreur, contexte: vus });
        return true;
      }
      await ecrire(d, { etapes: avancerEtapes(etapes, "agent", "fait"), contexte: { ...vus, runUuid: g.runUuid } });
      return true;
    }
  }
}

/** « Itérer » en attente d'images (vague 4a) : prompts puis images des références que les décisions donneront au plan ; quand elles sont là, la
 * recompilation part avec les décisions gardées (`decisionsARecompiler`). Une image en échec arrête l'itération en nommant l'asset ; le plan reste
 * inchangé, les décisions restent visibles. */
async function avancerImagesIteration(d: LigneDemande, ctx: ContexteIteration, etapes: EtapeDemande[], cle: "prompts" | "images"): Promise<boolean> {
  const dec = ctx.decisionsARecompiler;
  if (!dec) return echouer(d, "Les décisions de l'agent sont introuvables : relance « Itérer ».");
  const [plan] = await db.select({ uuid: plans.uuid }).from(plans).where(eq(plans.id, d.cibleId));
  if (!plan) return echouer(d, "Plan introuvable.");
  const finales = await referencesApresDecisions(d.projectId, plan.uuid, dec.references ?? {});
  if (!finales) return echouer(d, "Plan introuvable.");
  const prep = ctx.preparation ?? {};
  return avancerPromptsImages(
    d,
    etapes,
    cle,
    finales.codes,
    prep,
    (maj) => ecrire(d, { ...(maj.etapes ? { etapes: maj.etapes } : {}), ...(maj.prep ? { contexte: { ...ctx, preparation: { ...prep, ...maj.prep } } } : {}) }),
    async (suite) => {
      const conv = await ouvrirConversation(d.projectId, "plan", { uuid: plan.uuid }, "courte");
      if (!conv.ok) return echouer(d, conv.erreur);
      const g = await genererReecriturePlan(conv.conversationUuid, { consigne: ctx.consigne, decisions: dec, demandeId: d.id });
      if (!g.ok) return /déjà en cours/i.test(g.erreur) ? false : echouer(d, g.erreur);
      await ecrire(d, { etapes: suite, contexte: { ...ctx, runUuid: g.runUuid } });
      return true;
    },
  );
}

/** Annule la demande : elle passe à « annulée » tout de suite (le pilote ne la touche plus) et la tâche en cours est annulée avec elle
 * (en file : retirée ; en cours : le worker l'interrompt). Ce qui est déjà écrit n'est pas défait. */
export async function annulerDemande(demandeId: number): Promise<"annulee" | "rien"> {
  const [d] = await db.select().from(demandes).where(eq(demandes.id, demandeId));
  if (!d || d.statut !== "en_cours") return "rien";
  await ecrire(d, { statut: "annulee", erreur: null });
  const ctx = lireContexte(d);
  const cur = etapeCouranteDemande(lireEtapes(d));
  const lotPrompts = (d.contexte as { preparation?: { promptsPropositionUuid?: string } }).preparation?.promptsPropositionUuid;
  if (cur?.cle === "rendu" && ctx.jobId != null) await demanderAnnulation(cleVideo(ctx.jobId));
  else if (cur?.cle === "prompts" && lotPrompts) await annulerLot(lotPrompts);
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
  /** « Itérer » : ce que l'agent a décidé de changer (avant → après), dès qu'il a répondu. */
  decisions: DecisionsAffichees | null;
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
    decisions: d.type === "iteration-plan" ? (ctx.decisions ?? null) : null,
  };
}

