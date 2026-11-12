import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { db } from "../../db";
import { agentConversations, agentRuns, assets, demandes, episodes, jobs, plans, propositions, scenes } from "../../db/schema";
import { appliquerSelection, cocherChangements, conversationParUuid, creerAssetsManquants, genererFiches, genererIteration, genererPromptsAssets, genererProposition, genererReecriturePlan, genererReferencesPlan, ouvrirConversation } from "../agents/service";
import { annulerLot } from "../agents/batches";
import { choisirProchaineIteration, precedentsDansLaChaine } from "../clips/chains";
import { cleNouvelAsset } from "../agents/sheets";
import { referencesApresDecisions } from "../h3ir/brief-clip";
import { choisirReferencesPlan } from "../h3ir/references-clip-db";
import { ecrireReferencesPlan } from "../h3ir/references-write";
import { deciderImages, deciderReferences, libelleAssets, libelleImages, libellePrompts } from "../h3ir/preparation";
import { assetsCreesParLeLot, attendUnPlanPrecedent, codesRefsVisuelles, ecrireReferencesDuSkill, etatImagesAssets, lancerImagesAssets } from "../h3ir/preparation-db";
import { ERREUR_ANNULEE } from "./cancellation";
import { demanderAnnulation } from "./cancellation-db";
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
  etapesIterationEnAttente,
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
} from "./requests";
import { decisionIteration } from "../clips/clip-sheet";
import { refusReferences } from "../h3ir/engine";
import { etatsRefsVisuelles } from "../h3ir/engine-db";
import { appliquerIterationEtGenererCore } from "../clips/iteration-application";
import { lireProposition } from "../agents/queries-agents";
import { cleLlm, cleVideo } from "./tasks";
import type { DecisionsAffichees, DecisionsIteration, Resultat } from "../agents/types";

/** The PILOT of requests (rules in lib/tasks/requests.ts). `piloterDemandes` is called at each turn of the worker's « installer » loop:
 * at most one transition per ongoing request, state in `demandes` (resumes on restart, nothing in memory). A single
 * loop runs it, so there is no race between two pilots. Never touches the GPU: it posts tasks, the lanes take them. */

type LigneDemande = typeof demandes.$inferSelect;
const ERR = (erreur: string) => ({ ok: false as const, erreur });

const lireEtapes = (d: LigneDemande): EtapeDemande[] => (Array.isArray(d.etapes) ? (d.etapes as EtapeDemande[]) : []);
const lireContexte = (d: LigneDemande): ContexteIteration => d.contexte as ContexteIteration;

const MAX_CONSIGNE = 4000;

/** « Itérer » a plan: ONE request (instruction → agent → rewrite if needed → render). A single iteration holds the place at a time (the GPU is shared):
 * if none is in progress it leaves at once, otherwise it waits (`en_attente`) in arrival order, its instruction editable until it leaves
 * (`modifierConsigneIteration`). Refused if the plan already has an iteration in progress or waiting. */
export async function lancerDemandeIteration(
  conversationUuid: string,
  options: { retour: string; renduId?: number | null; planche?: boolean; depuisNumero: number | null; reglages?: ContexteIteration["reglages"] },
): Promise<Resultat<{ demandeId: number; demandeUuid: string; runUuid: string | null; propositionUuid: string | null; enAttente: boolean }>> {
  const conv = await conversationParUuid(conversationUuid);
  if (!conv) return ERR("Conversation introuvable.");
  if (conv.portee !== "plan" || conv.cibleId == null) return ERR("« Itérer » se demande depuis la page d'un plan.");
  const consigne = options.retour.trim();
  if (consigne.length > MAX_CONSIGNE) return ERR(`Ta consigne est trop longue (${MAX_CONSIGNE} caractères au plus).`);
  const contexte: ContexteIteration = { consigne, depuisNumero: options.depuisNumero, reglages: options.reglages ?? {} };

  const iterations = await db
    .select({ id: demandes.id, statut: demandes.statut, cibleId: demandes.cibleId })
    .from(demandes)
    .where(and(eq(demandes.type, "iteration-plan"), inArray(demandes.statut, ["en_cours", "en_attente"])));
  const dejaSurCePlan = iterations.find((d) => d.cibleId === conv.cibleId);
  if (dejaSurCePlan) {
    return ERR(
      dejaSurCePlan.statut === "en_attente"
        ? "Une itération de ce plan attend déjà son tour : modifie sa consigne depuis le panneau des tâches, ou annule-la."
        : "Une itération est déjà en cours sur ce plan : attends qu'elle finisse (ou annule-la depuis le panneau des tâches).",
    );
  }

  // Someone already holds the place: the request waits, with no task posted. Everything needed to start it is kept in its context.
  if (iterations.length > 0) {
    const [d] = await db
      .insert(demandes)
      .values({
        projectId: conv.projectId,
        type: "iteration-plan",
        cibleType: "plan",
        cibleId: conv.cibleId,
        statut: "en_attente",
        etapes: etapesIterationEnAttente(),
        contexte: { ...contexte, conversationUuid, renduId: options.renduId ?? null, planche: options.planche === true },
      })
      .returning({ id: demandes.id, uuid: demandes.uuid });
    return { ok: true, demandeId: d!.id, demandeUuid: d!.uuid, runUuid: null, propositionUuid: null, enAttente: true };
  }

  let demande: { id: number; uuid: string };
  try {
    const [d] = await db
      .insert(demandes)
      .values({ projectId: conv.projectId, type: "iteration-plan", cibleType: "plan", cibleId: conv.cibleId, etapes: etapesIterationPlan(), contexte })
      .returning({ id: demandes.id, uuid: demandes.uuid });
    demande = d!;
  } catch {
    // The partial unique index: a request (of another type) is already in progress on this plan.
    return ERR("Une demande est déjà en cours sur ce plan : attends qu'elle finisse (ou annule-la depuis le panneau des tâches).");
  }
  const g = await genererIteration(conversationUuid, { retour: options.retour, renduId: options.renduId, planche: options.planche, demandeId: demande.id });
  if (!g.ok) {
    await db.delete(demandes).where(eq(demandes.id, demande.id)); // nothing was sent: the request never existed
    return g;
  }
  await db.update(demandes).set({ contexte: { ...contexte, runUuid: g.runUuid }, updatedAt: new Date() }).where(eq(demandes.id, demande.id));
  return { ok: true, demandeId: demande.id, demandeUuid: demande.uuid, runUuid: g.runUuid, propositionUuid: g.propositionUuid, enAttente: false };
}

/** Changes the instruction of an iteration waiting its turn (once started, the instruction has gone to the agent: no longer editable). */
export async function modifierConsigneIteration(demandeId: number, texte: string): Promise<Resultat<object>> {
  const t = texte.trim();
  if (!t) return ERR("Écris d'abord ce que tu veux changer.");
  if (t.length > MAX_CONSIGNE) return ERR(`Ta consigne est trop longue (${MAX_CONSIGNE} caractères au plus).`);
  const [d] = await db.select().from(demandes).where(eq(demandes.id, demandeId));
  if (!d || d.type !== "iteration-plan") return ERR("Cette itération n'existe plus.");
  if (d.statut !== "en_attente") return ERR("Cette itération a déjà démarré : sa consigne est partie à l'agent, elle n'est plus modifiable.");
  // The condition on the status closes the window where the pilot starts it between the read and the write.
  const r = await db
    .update(demandes)
    .set({ contexte: { ...lireContexte(d), consigne: t }, updatedAt: new Date() })
    .where(and(eq(demandes.id, demandeId), eq(demandes.statut, "en_attente")))
    .returning({ id: demandes.id });
  return r.length ? { ok: true } : ERR("Cette itération vient de démarrer : sa consigne n'est plus modifiable.");
}

/** The active iteration of this plan (in progress or waiting), if there is one: its instruction and its step. The plan's page shows them IN ALL CIRCUMSTANCES,
 * from the validation of « Itérer » to the end of the render (the attempt does not exist yet during the agent and the recompilation; only the request carries the instruction). */
export async function iterationDuPlan(planId: number): Promise<{ demandeId: number; statut: "en_cours" | "en_attente"; consigne: string; etape: string | null } | null> {
  const [d] = await db
    .select()
    .from(demandes)
    .where(and(eq(demandes.type, "iteration-plan"), eq(demandes.cibleType, "plan"), eq(demandes.cibleId, planId), inArray(demandes.statut, ["en_cours", "en_attente"])))
    .orderBy(asc(demandes.statut), desc(demandes.id)) // « en_attente » before « en_cours » alphabetically: only one can be in progress, we prefer that one if both exist
    .limit(2);
  if (!d) return null;
  return { demandeId: d.id, statut: d.statut as "en_cours" | "en_attente", consigne: lireContexte(d).consigne, etape: d.statut === "en_cours" ? (etapeCouranteDemande(lireEtapes(d))?.libelle ?? null) : null };
}

/** The iteration of this plan waiting its turn, if there is one: the plan's page leads back to it (the instruction is corrected there, until it leaves). */
export async function iterationEnAttenteDuPlan(planId: number): Promise<{ demandeId: number; consigne: string } | null> {
  const [d] = await db
    .select()
    .from(demandes)
    .where(and(eq(demandes.type, "iteration-plan"), eq(demandes.cibleType, "plan"), eq(demandes.cibleId, planId), eq(demandes.statut, "en_attente")))
    .limit(1);
  return d ? { demandeId: d.id, consigne: lireContexte(d).consigne } : null;
}

/** Moves up (−1) or down (+1) a waiting iteration in the queue by swapping its arrival date with its neighbour: the queue's order (the worker's pilot as well as the panel) is that of
 * `created_at`, so there is nothing else to store. No effect at the end of the queue or if one of the two has started. */
export async function deplacerIterationEnAttente(demandeId: number, sens: -1 | 1): Promise<Resultat<object>> {
  return db.transaction(async (tx) => {
    const file = await tx
      .select({ id: demandes.id, createdAt: demandes.createdAt })
      .from(demandes)
      .where(and(eq(demandes.type, "iteration-plan"), eq(demandes.statut, "en_attente")))
      .orderBy(asc(demandes.createdAt), asc(demandes.id));
    const i = file.findIndex((x) => x.id === demandeId);
    if (i < 0) return ERR("Cette itération a déjà démarré ou n'est plus en file.");
    const voisine = file[i + sens];
    if (!voisine) return { ok: true as const };
    const moi = file[i]!;
    // Identical dates (same instant): we shift by one millisecond so that the swap really changes the order.
    const dateMoi = moi.createdAt.getTime() === voisine.createdAt.getTime() ? new Date(voisine.createdAt.getTime() + sens) : voisine.createdAt;
    await tx.update(demandes).set({ createdAt: dateMoi }).where(and(eq(demandes.id, moi.id), eq(demandes.statut, "en_attente")));
    await tx.update(demandes).set({ createdAt: moi.createdAt }).where(and(eq(demandes.id, voisine.id), eq(demandes.statut, "en_attente")));
    return { ok: true as const };
  });
}

/** Starts the oldest waiting iteration when none is in progress any more: this is where the agent's task is posted, with the
 * instruction as it IS AT THIS MOMENT (editable until then). A failure (plan without a render…) ends it in error without blocking the following ones. */
async function demarrerProchaineIteration(): Promise<boolean> {
  const [enCours] = await db.select({ id: demandes.id }).from(demandes).where(and(eq(demandes.type, "iteration-plan"), eq(demandes.statut, "en_cours"))).limit(1);
  if (enCours) return false;
  const file = await db.select().from(demandes).where(and(eq(demandes.type, "iteration-plan"), eq(demandes.statut, "en_attente"))).orderBy(asc(demandes.createdAt), asc(demandes.id));
  if (file.length === 0) return false;
  // Arrival order, except that a clip in « suite » starts again from its predecessor's render: if it is also queued, it goes after it (lib/clips/chains.ts).
  const plansEnFile = await db.select({ id: plans.id, episodeId: plans.episodeId, ordre: plans.ordre, liaison: plans.liaison }).from(plans).where(inArray(plans.episodeId, db.select({ e: plans.episodeId }).from(plans).where(inArray(plans.id, file.map((f) => f.cibleId)))));
  const precedentsDe = (planId: number) => {
    const p = plansEnFile.find((x) => x.id === planId);
    return p ? precedentsDansLaChaine(plansEnFile.filter((x) => x.episodeId === p.episodeId), planId) : [];
  };
  const d = choisirProchaineIteration(file.map((f) => ({ ...f, planId: f.cibleId })), precedentsDe);
  if (!d) return false;
  const ctx = lireContexte(d);
  // Taking the place first (condition on the status: a cancellation in the meantime wins); the partial unique index says whether the plan is taken by another request.
  let pris: { id: number }[];
  try {
    pris = await db
      .update(demandes)
      .set({ statut: "en_cours", etapes: etapesIterationPlan(), updatedAt: new Date() })
      .where(and(eq(demandes.id, d.id), eq(demandes.statut, "en_attente")))
      .returning({ id: demandes.id });
  } catch {
    return false; // the plan has another request in progress: we retry at the next turn
  }
  if (pris.length === 0) return false;
  const echec = async (erreur: string) => {
    await db.update(demandes).set({ statut: "echoue", erreur: erreur.slice(0, 500), finishedAt: new Date(), updatedAt: new Date() }).where(eq(demandes.id, d.id));
    return true;
  };
  if (!ctx.conversationUuid) return echec("Cette itération n'a pas gardé sa conversation : relance « Itérer ».");
  const g = await genererIteration(ctx.conversationUuid, { retour: ctx.consigne, renduId: ctx.renduId, planche: ctx.planche, demandeId: d.id });
  if (!g.ok) return echec(g.erreur);
  await db.update(demandes).set({ contexte: { ...ctx, runUuid: g.runUuid }, updatedAt: new Date() }).where(eq(demandes.id, d.id));
  return true;
}

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

/** « Générer la fiche » of a clip (Screenplay and Clip pages, « Brief Open H3 IR » tab): ONE request, saved without review (we re-read it in the
 * clip's page). Open H3 IR ALONE (wave 4a, lib/h3ir/preparation.ts): a clip whose references all have their image goes at once to
 * compilation (fast path); otherwise the pilot PREPARES it first (references, missing assets, prompts, images), turn after turn. The compiled sheet
 * may replace an existing sheet (the click is confirmation; the old prompt stays in the history).
 * Options: `rechoisir` (re-choose the references even if the clip already has some; never by default), optional Open H3 IR settings (`shots`, `director`,
 * `creativity`: absent, those of the clip, its scene or the project). */
export async function lancerDemandeFichePlan(projectId: number, planUuid: string, options: OptionsDemandeFiche = {}): Promise<Resultat<{ demandeId: number }>> {
  const [plan] = await db.select({ id: plans.id, titre: plans.titre, statut: plans.statut }).from(plans).where(and(eq(plans.uuid, planUuid), eq(plans.projectId, projectId)));
  if (!plan) return ERR("Plan introuvable.");
  const etat = (await etatsRefsVisuelles(projectId, [planUuid])).get(planUuid) ?? { total: 0, sansFichier: [] };
  const parcours: ParcoursFichePlan = !options.rechoisir && refusReferences(etat) == null ? "rapide" : "preparation";
  const reglagesH3ir = { shots: options.shots ?? null, director: options.director ?? null, creativity: options.creativity ?? null };
  const ouverte = await ouvrirConversation(projectId, "plan", { uuid: planUuid }, "courte");
  if (!ouverte.ok) return ouverte;
  const contexte: ContexteFichePlan = {
    titre: plan.titre,
    planUuid,
    reglagesH3ir,
    ...(parcours === "preparation" ? { preparation: options.rechoisir ? { rechoisir: true } : {} } : {}),
  };
  let demande: { id: number };
  try {
    const [d] = await db.insert(demandes).values({ projectId, type: "fiche-plan", cibleType: "plan", cibleId: plan.id, etapes: etapesFichePlan(parcours), contexte }).returning({ id: demandes.id });
    demande = d!;
  } catch {
    // The partial unique index: a request is already in progress on this plan.
    return ERR("Une demande est déjà en cours sur ce plan : attends qu'elle finisse (ou annule-la depuis le panneau des tâches).");
  }
  // Preparation: the pilot leads it (nothing to post now). Fast path: the task leaves at once.
  if (parcours === "preparation") return { ok: true, demandeId: demande.id };
  const g = await genererFiches(ouverte.conversationUuid, { planUuids: [planUuid], demandeId: demande.id, reglagesH3ir });
  if (!g.ok) {
    await db.delete(demandes).where(eq(demandes.id, demande.id)); // nothing was sent: the request never existed
    return g;
  }
  await db.update(demandes).set({ contexte: { ...contexte, ...(g.runUuid ? { runUuid: g.runUuid } : {}) }, updatedAt: new Date() }).where(eq(demandes.id, demande.id));
  return { ok: true, demandeId: demande.id };
}

export type OptionsDemandeFiche = {
  rechoisir?: boolean;
  shots?: number | null;
  director?: string | null;
  creativity?: string | null;
};

/** The sheets of SEVERAL clips (« Écrire les fiches », and a project's creation): one request per clip, posted in the SCREENPLAY ORDER (episode,
 * then `plans.ordre`) whatever order is given. Each clip is prepared then compiled; the choice of references follows the screenplay order (a clip
 * waits for the clips before it to have their references: set continuity, assets created by a clip are visible to the next). A clip refused (request already
 * in progress…) does not stop the others: its reasons are returned. */
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

/** Where the sheet requests stand (a project's creation thus follows its batch): status, current step, error, per request. */
export async function etatDemandesFiches(demandeIds: number[]): Promise<{ id: number; planUuid: string; statut: Exclude<StatutDemande, "en_attente">; etape: string | null; erreur: string | null }[]> {
  if (demandeIds.length === 0) return [];
  const lignes = await db.select().from(demandes).where(inArray(demandes.id, demandeIds));
  return lignes.map((d) => ({
    id: d.id,
    planUuid: (d.contexte as ContexteFichePlan).planUuid,
    statut: d.statut as Exclude<StatutDemande, "en_attente">,
    etape: etapeCouranteDemande(lireEtapes(d))?.libelle ?? null,
    erreur: d.erreur,
  }));
}

/** The briefing when the author gave none: the agent itself proposes the scene that follows on. */
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
    .where(and(eq(demandes.id, d.id), eq(demandes.statut, "en_cours"))); // a request cancelled in the meantime does not reopen
}

/** One turn of the pilot: moves each ongoing request by one transition. Never rejects (a request that crashes ends in failure
 * with its message, the others continue). Returns how many requests are in progress and how many have moved. */
export async function piloterDemandes(): Promise<{ actives: number; touchees: number }> {
  let touchees = 0;
  try {
    if (await demarrerProchaineIteration()) touchees += 1;
  } catch (err) {
    console.error(`[worker] Démarrage d'une itération en attente : ${err instanceof Error ? err.message : String(err)}`);
  }
  const lignes = await db.select().from(demandes).where(eq(demandes.statut, "en_cours"));
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

/** One turn of a clip addition: as long as the agent writes, we wait; once its proposal is ready, we apply only the change that creates the clip. */
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

// --- the sheet of a clip: preparation then compilation (wave 4a) -------------------------------------------------------------------------

type CtxPrep = NonNullable<ContexteFichePlan["preparation"]>;
const occupe = (erreur: string) => /déjà en cours/i.test(erreur);

/** The codes of the assets CREATED by an applied proposal (its creations, by their key `nouvel-asset-<code>`), which exist in the registry. */
async function codesCreesPar(projectId: number, propositionUuid: string): Promise<string[]> {
  const lue = await lireProposition(propositionUuid);
  const codes = (lue?.groupes ?? []).flatMap((g) => g.changements).filter((c) => c.cibleType === "asset" && c.operation === "creer").map((c) => (c.cle ?? "").replace(PREFIXE_NOUVEL_ASSET, "")).filter(Boolean);
  if (codes.length === 0) return [];
  return (await db.select({ code: assets.code }).from(assets).where(and(eq(assets.projectId, projectId), inArray(assets.code, codes)))).map((a) => a.code);
}
const PREFIXE_NOUVEL_ASSET = cleNouvelAsset("");

/** Ticks everything that passes (neither blocked nor refused) in a proposal and applies it without review. */
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

/** Step `references`: keep the clip's own, write those from the code, or wait / apply the `references-plan` task (doubt). */
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
    // All creations refused or blocked by a check: the skill's references (without these assets) are written anyway.
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

/** The `prompts` and `images` steps, common to a clip's sheet and to « Itérer »: `codes` = the expected references (those of the clip, or those
 * the decisions will have); `prep` / `ecrirePrep`: the state kept in the request; `lancerSuite`: the compilation, once all the images are there
 * (returns false if its conversation is busy: we retry at the next turn). */
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

/** The Open H3 IR compilation of a prepared clip's sheet: the task leaves, the `compilation` step becomes the current step. */
async function poserCompilation(d: LigneDemande, ctx: ContexteFichePlan, etapes: EtapeDemande[]): Promise<boolean> {
  const conv = await ouvrirConversation(d.projectId, "plan", { uuid: ctx.planUuid }, "courte");
  if (!conv.ok) return echouer(d, conv.erreur);
  const g = await genererFiches(conv.conversationUuid, { planUuids: [ctx.planUuid], demandeId: d.id, reglagesH3ir: ctx.reglagesH3ir ?? {} });
  if (!g.ok) return occupe(g.erreur) ? false : echouer(d, g.erreur);
  await ecrire(d, { etapes, contexte: { ...ctx, ...(g.runUuid ? { runUuid: g.runUuid } : {}) } });
  return true;
}

/** One turn of a clip sheet: references → assets → prompts → images → Open H3 IR compilation. */
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
      return avancerTacheFiche(d, ctx, etapes);
  }
}

/** The task that compiles the sheet (`compilation` step). Same wait as the additions; once the proposal is ready, we record the sheet. */
async function avancerTacheFiche(d: LigneDemande, ctx: ContexteFichePlan, etapes: EtapeDemande[]): Promise<boolean> {
  const [run] = ctx.runUuid ? await db.select().from(agentRuns).where(eq(agentRuns.uuid, ctx.runUuid)) : [];
  if (!run) return echouer(d, "La tâche de l'agent n'existe plus.");
  if (run.statut === "en_attente" || run.statut === "en_cours") return false;
  if (run.statut === "annulee" || (run.statut === "echoue" && run.erreur === ERREUR_ANNULEE)) return annuler(d);
  const prefixe = "La compilation Open H3 IR a échoué : ";
  if (run.statut !== "termine") return echouer(d, `${prefixe}${run.erreur ?? "L'agent a échoué."}`);
  const [prop] = run.propositionId ? await db.select({ uuid: propositions.uuid }).from(propositions).where(eq(propositions.id, run.propositionId)) : [];
  if (!prop) return echouer(d, `${prefixe}La proposition de l'agent est introuvable.`);
  const lue = await lireProposition(prop.uuid);
  const decision = decisionFichePlan(lue);
  const fini = avancerEtapes(etapes, "compilation", "fait");
  const suite = async () => {
    await ecrire(d, { statut: "termine", etapes: fini, erreur: null });
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
      // The sheet and the assets it cites are kept; any other change slipped into the proposal stays unticked.
      const tous = (lue?.groupes ?? []).flatMap((g) => g.changements.map((c) => c.id));
      const decoche = await cocherChangements(prop.uuid, { ids: tous }, false);
      const coche = decoche.ok ? await cocherChangements(prop.uuid, { ids: decision.changementIds }, true) : decoche;
      if (!coche.ok) return echouer(d, `${prefixe}${coche.erreur}`);
      // Open H3 IR replaces the existing sheet without asking again: the user's click is confirmation, and the old prompt is kept in the history.
      const a = await appliquerSelection(prop.uuid, { confirmeEcrasement: true });
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
  // Assets created, prompts and images expected before the recompilation (wave 4a): same mechanism as a clip's sheet.
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
      // Applied + render created: the correction did not need a rewrite if we were still at the « agent » step.
      await ecrire(d, { etapes: avancerEtapes(etapes, cle, "fait", cle === "agent" ? ["reecriture"] : []), contexte: { ...ctx, jobId: r.jobId, numeroRendu: r.numeroRendu, notes: r.notes } });
      return true;
    }
    case "reecrire": {
      if (!conversationUuid) {
        await ecrire(d, { statut: "echoue", erreur: "Conversation introuvable." });
        return true;
      }
      // Always recompile (2026-11-09): the agent's decisions (intent, duration, references, settings) go as an override to Open H3 IR and are only
      // written with the compiled sheet. Wave 4a: the missing assets decided (two at most) are created at once and added to the references;
      // if a final reference has no image, its prompts and images go first (inserted steps), the recompilation follows by itself.
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
      const g = await genererReecriturePlan(conversationUuid, { consigne: ctx.consigne, decisions: aRecompiler, demandeId: d.id, depuisNumero: ctx.depuisNumero });
      if (!g.ok) {
        if (/déjà en cours/i.test(g.erreur)) return false; // the conversation is taken by something else: at the next turn
        await ecrire(d, { statut: "echoue", erreur: g.erreur, contexte: vus });
        return true;
      }
      await ecrire(d, { etapes: avancerEtapes(etapes, "agent", "fait"), contexte: { ...vus, runUuid: g.runUuid } });
      return true;
    }
  }
}

/** « Itérer » waiting for images (wave 4a): prompts then images of the references the decisions will give the clip; once they are there, the
 * recompilation leaves with the kept decisions (`decisionsARecompiler`). A failed image stops the iteration, naming the asset; the clip stays
 * unchanged, the decisions stay visible. */
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
      const g = await genererReecriturePlan(conv.conversationUuid, { consigne: ctx.consigne, decisions: dec, demandeId: d.id, depuisNumero: ctx.depuisNumero });
      if (!g.ok) return /déjà en cours/i.test(g.erreur) ? false : echouer(d, g.erreur);
      await ecrire(d, { etapes: suite, contexte: { ...ctx, runUuid: g.runUuid } });
      return true;
    },
  );
}

/** Cancels the request: it goes to « annulée » at once (the pilot no longer touches it) and the task in progress is cancelled with it
 * (queued: removed; in progress: the worker interrupts it). What has already been written is not undone. */
export async function annulerDemande(demandeId: number): Promise<"annulee" | "rien"> {
  const [d] = await db.select().from(demandes).where(eq(demandes.id, demandeId));
  if (d?.statut === "en_attente") {
    // It posted no task: there is nothing to interrupt.
    await db.update(demandes).set({ statut: "annulee", erreur: null, finishedAt: new Date(), updatedAt: new Date() }).where(and(eq(demandes.id, d.id), eq(demandes.statut, "en_attente")));
    return "annulee";
  }
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

/** What a clip's page reads to follow its request (polling). */
export type VueDemande = {
  statut: StatutDemande;
  etapes: EtapeDemande[];
  /** Current step (label), null when it is finished. */
  etapeLibelle: string | null;
  erreur: string | null;
  /** The render created (`rendu` step reached): the page can acknowledge the launch. */
  numeroRendu: number | null;
  notes: string[];
  /** « Itérer »: what the agent decided to change (before → after), as soon as it has answered. */
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

