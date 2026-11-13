import { and, asc, count, eq, inArray, isNotNull } from "drizzle-orm";
import { db } from "../../db";
import { agentConversations, agentRuns, propositionChangements, propositions } from "../../db/schema";
import type { Tx } from "../clips/clip-order";
import {
  comptesLot,
  dernieresSousTaches,
  erreurDuLot,
  episodeIdDeCle,
  statutPropositionDuLot,
  type RunLot,
  type StatutRun,
} from "./batches-pure";
import { resumeAutomatique } from "./proposal-db";
import type { CibleType, Operation, VueLot, VueSousTache } from "./types";

/** Batches of the agent system, database side: read a proposal's subtasks, decide its
 * status when one of them ends, cancel the batch. The pure rules are in
 * lib/agents/batches-pure.ts. Used by the service, the worker (post-processing) and the header. */

type DbOuTx = typeof db | Tx;

export function versRunLot(r: typeof agentRuns.$inferSelect): RunLot {
  return {
    id: r.id,
    uuid: r.uuid,
    cle: r.cleSousTache!,
    libelle: r.libelleSousTache,
    statut: r.statut as StatutRun,
    progressionJetons: r.progressionJetons,
    erreur: r.erreur,
    createdAt: r.createdAt,
    startedAt: r.startedAt,
    finishedAt: r.finishedAt,
    vuAt: r.vuAt,
    annulationDemandeeAt: r.annulationDemandeeAt,
  };
}

/** All tasks (re-runs included) of a batch proposal, from oldest to newest. */
export async function runsDuLot(d: DbOuTx, propositionId: number): Promise<RunLot[]> {
  const lignes = await d
    .select()
    .from(agentRuns)
    .where(and(eq(agentRuns.propositionId, propositionId), isNotNull(agentRuns.cleSousTache)))
    .orderBy(asc(agentRuns.id));
  return lignes.map(versRunLot);
}

/** Decides and sets the status of a batch's proposal from its subtasks. To call at
 * EACH subtask end (succeeded, failed, cancelled) and at worker startup. `runTermineId`:
 * the task whose result is being written in the current transaction (its "terminé" status
 * is not yet set there). Never touches an applied or rejected proposal. */
export async function finaliserLot(d: DbOuTx, propositionId: number, options: { runTermineId?: number } = {}): Promise<string | null> {
  const [prop] = await d.select().from(propositions).where(eq(propositions.id, propositionId));
  if (!prop || !prop.lot) return null;
  if (prop.statut !== "en_generation" && prop.statut !== "prete" && prop.statut !== "echouee") return prop.statut;

  const runs = (await runsDuLot(d, propositionId)).map((r) => (r.id === options.runTermineId ? { ...r, statut: "termine" as StatutRun } : r));
  const c = comptesLot(runs);
  const voulu = statutPropositionDuLot(c);

  if (voulu === "en_generation") {
    if (prop.statut !== "en_generation") await d.update(propositions).set({ statut: "en_generation", erreur: null }).where(eq(propositions.id, propositionId));
    return "en_generation";
  }

  if (voulu === "prete") {
    const lignes = await d
      .select({ operation: propositionChangements.operation, cibleType: propositionChangements.cibleType, refuseRaison: propositionChangements.refuseRaison })
      .from(propositionChangements)
      .where(eq(propositionChangements.propositionId, propositionId));
    const base = resumeAutomatique(lignes.map((l) => ({ operation: l.operation as Operation, cibleType: l.cibleType as CibleType, refuseRaison: l.refuseRaison })));
    const aRelancer = c.echecs + c.annulees;
    const resume = `${c.terminees} sous-tâche${c.terminees > 1 ? "s" : ""} sur ${c.total} terminée${c.terminees > 1 ? "s" : ""}. ${base}${aRelancer > 0 ? ` ${aRelancer} à relancer.` : ""}`;
    await d.update(propositions).set({ statut: "prete", erreur: null, resume }).where(eq(propositions.id, propositionId));
    if (prop.conversationId != null) {
      await d.update(agentConversations).set({ etape: "proposition", updatedAt: new Date() }).where(eq(agentConversations.id, prop.conversationId));
    }
    return "prete";
  }

  if (voulu === "annulee") {
    await d.update(propositions).set({ statut: "annulee", erreur: null }).where(eq(propositions.id, propositionId));
    await revenirApresLot(d, prop.conversationId, propositionId);
    return "annulee";
  }

  await d.update(propositions).set({ statut: "echouee", erreur: erreurDuLot(runs) }).where(eq(propositions.id, propositionId));
  return "echouee";
}

/** The conversation leaves the "proposition" step of an abandoned batch: back to the instruction (short)
 * or to the "appliqué" step (complete: that is where "Continuer" is offered). */
async function revenirApresLot(d: DbOuTx, conversationId: number | null, propositionId: number): Promise<void> {
  if (conversationId == null) return;
  const [conv] = await d.select().from(agentConversations).where(eq(agentConversations.id, conversationId));
  if (!conv || conv.propositionId !== propositionId) return;
  await d
    .update(agentConversations)
    .set({ propositionId: null, etape: conv.profondeur === "complete" ? "applique" : "consigne", updatedAt: new Date() })
    .where(eq(agentConversations.id, conversationId));
}

/** Batch proposals still "en génération" with no active task left (worker
 * stopped, task cancelled in the meantime): their status is caught up. At worker startup. */
export async function finaliserLotsOrphelins(d: DbOuTx = db): Promise<number> {
  const ouvertes = await d.select({ id: propositions.id }).from(propositions).where(and(eq(propositions.lot, true), eq(propositions.statut, "en_generation")));
  let n = 0;
  for (const p of ouvertes) {
    const avant = "en_generation";
    const apres = await finaliserLot(d, p.id);
    if (apres && apres !== avant) n++;
  }
  return n;
}

/** Stops agent tasks: pending ones are cancelled, running ones receive the cancellation
 * flag (the worker cuts the connection to the LLM server). */
export async function annulerRunsDePropositions(d: DbOuTx, propositionIds: number[]): Promise<void> {
  if (propositionIds.length === 0) return;
  const maintenant = new Date();
  await d
    .update(agentRuns)
    .set({ statut: "annulee", finishedAt: maintenant, erreur: null })
    .where(and(inArray(agentRuns.propositionId, propositionIds), eq(agentRuns.statut, "en_attente")));
  await d
    .update(agentRuns)
    .set({ annulationDemandeeAt: maintenant })
    .where(and(inArray(agentRuns.propositionId, propositionIds), eq(agentRuns.statut, "en_cours")));
}

/** "Vider la file": the PENDING subtasks of all batches are cancelled; those that are
 * running continue (unlike `annulerLot`). A batch with no running subtask has its
 * status decided right away (`prete` if it has a result, `annulee` otherwise). Returns the number
 * of subtasks cancelled. */
export async function annulerEnAttenteDesLots(): Promise<number> {
  const lots = await db.select({ id: propositions.id }).from(propositions).where(eq(propositions.lot, true));
  if (lots.length === 0) return 0;
  const ids = lots.map((l) => l.id);
  const annulees = await db
    .update(agentRuns)
    .set({ statut: "annulee", finishedAt: new Date(), erreur: null })
    .where(and(inArray(agentRuns.propositionId, ids), eq(agentRuns.statut, "en_attente")))
    .returning({ propositionId: agentRuns.propositionId });
  const touches = [...new Set(annulees.map((a) => a.propositionId).filter((x): x is number => x != null))];
  for (const pid of touches) {
    const encore = await db
      .select({ id: agentRuns.id })
      .from(agentRuns)
      .where(and(eq(agentRuns.propositionId, pid), eq(agentRuns.statut, "en_cours")))
      .limit(1);
    if (encore.length === 0) await finaliserLot(db, pid);
  }
  return annulees.length;
}

export type ResultatAnnulationLot = "annule" | "demande" | "rien";

/** Cancels a batch: pending subtasks are cancelled right away, the running one is
 * interrupted (flag). What is already finished stays readable: the proposal becomes `prete`
 * if there is at least one result, `annulee` otherwise. Idempotent. */
export async function annulerLot(propositionUuid: string): Promise<ResultatAnnulationLot> {
  if (!/^[0-9a-f-]{36}$/i.test(propositionUuid)) return "rien";
  const [prop] = await db.select().from(propositions).where(eq(propositions.uuid, propositionUuid));
  if (!prop || !prop.lot) return "rien";
  const runs = await runsDuLot(db, prop.id);
  const actifs = dernieresSousTaches(runs).filter((x) => x.run.statut === "en_attente" || x.run.statut === "en_cours");
  if (actifs.length === 0) return "rien";
  const enCours = actifs.some((x) => x.run.statut === "en_cours");
  await annulerRunsDePropositions(db, [prop.id]);
  // With no subtask running, nothing is waiting anymore: the status is decided right away.
  if (!enCours) await finaliserLot(db, prop.id);
  return enCours ? "demande" : "annule";
}

/** A batch's view for the popup: one line per subtask (the last one set for each key). */
export async function vueLot(propositionId: number, positionsFile: Map<number, number>): Promise<VueLot | null> {
  const runs = await runsDuLot(db, propositionId);
  if (runs.length === 0) return null;
  const comptes = await db
    .select({ sousTache: propositionChangements.sousTache, n: count() })
    .from(propositionChangements)
    .where(eq(propositionChangements.propositionId, propositionId))
    .groupBy(propositionChangements.sousTache);
  const parCle = new Map(comptes.map((c) => [c.sousTache ?? "", Number(c.n)]));
  const sousTaches: VueSousTache[] = dernieresSousTaches(runs).map(({ run, relancee }) => ({
    cle: run.cle,
    libelle: run.libelle ?? run.cle,
    episodeId: episodeIdDeCle(run.cle),
    runUuid: run.uuid,
    statut: run.statut as VueSousTache["statut"],
    progressionJetons: run.statut === "en_cours" ? run.progressionJetons : null,
    erreur: run.statut === "echoue" ? run.erreur : null,
    positionFile: run.statut === "en_attente" ? (positionsFile.get(run.id) ?? null) : null,
    nbChangements: parCle.get(run.cle) ?? 0,
    relancee,
  }));
  const c = comptesLot(runs);
  return { sousTaches, total: c.total, terminees: c.terminees, echecs: c.echecs, annulees: c.annulees, actives: c.actives };
}
