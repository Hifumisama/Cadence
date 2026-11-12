import { and, desc, eq, inArray, isNull, ne, notInArray, or, sql } from "drizzle-orm";
import { db } from "../../db";
import { agentRuns, assetGenerations, jobs, plans, propositions } from "../../db/schema";
import { ERREUR_ANNULEE, statutPlanApresAnnulation } from "./cancellation";
import { annulerEnAttenteDesLots, annulerLot } from "../agents/batches";
import { balayerEssaisSansTache } from "../agents/asset-attempt";
import { analyserCle } from "./tasks";

// Database access for cancellation, shared by the server action (app/taches/actions.ts)
// and the worker. The pure rules live in lib/tasks/cancellation.ts. Each UPDATE is
// guarded by the expected status: a task the worker has just taken (or just
// finished) is not overwritten by a cancellation arriving too late.

export type ResultatAnnulation = "annulee" | "demandee" | "deja" | "rien";

/** « Vider la file »: cancels EVERYTHING that waits (images, sounds, videos, agent calls, batch
 * subtasks). What is running continues: we interrupt nothing, we only remove what has not
 * started (nothing is lost, everything relaunches). A removed video puts its clip back into its
 * previous state. Returns the number of cancelled tasks. */
export async function viderFile(): Promise<number> {
  const maintenant = new Date();
  const images = await db
    .update(assetGenerations)
    .set({ statut: "annulee", finishedAt: maintenant, erreur: null })
    .where(eq(assetGenerations.statut, "en_attente"))
    .returning({ id: assetGenerations.id });
  const videos = await db
    .update(jobs)
    .set({ statut: "echoue", erreur: ERREUR_ANNULEE, finishedAt: maintenant })
    .where(eq(jobs.statut, "en_attente"))
    .returning({ planId: jobs.planId });
  for (const v of videos) await restaurerStatutPlan(v.planId);
  // Batch subtasks go through their own logic (batch status recalculated); the other
  // agent calls, directly.
  const lots = await annulerEnAttenteDesLots();
  const lotsIds = (await db.select({ id: propositions.id }).from(propositions).where(eq(propositions.lot, true))).map((p) => p.id);
  const seuls = await db
    .update(agentRuns)
    .set({ statut: "annulee", finishedAt: maintenant, erreur: null })
    .where(
      and(
        eq(agentRuns.statut, "en_attente"),
        lotsIds.length > 0 ? or(isNull(agentRuns.propositionId), notInArray(agentRuns.propositionId, lotsIds)) : sql`true`,
      ),
    )
    .returning({ id: agentRuns.id });
  await balayerEssaisSansTache(db);
  return images.length + videos.length + lots + seuls.length;
}

/** Requests the cancellation of a task (`image:<uuid>` / `video:<id>`). Idempotent:
 * asking again changes nothing. Pending → cancelled immediately; in progress → the
 * flag is set and the worker interrupts ComfyUI; finished, failed or already
 * cancelled → nothing. */
export async function demanderAnnulation(cle: string): Promise<ResultatAnnulation> {
  const a = analyserCle(cle);
  if (!a) return "rien";
  const maintenant = new Date();

  // A project's creation is stopped by the installer (app/taches/actions.ts: annulerTache), never here.
  if (a.genre === "creation" || a.genre === "demande") return "rien"; // the request is cancelled via `annulerDemande` (app/taches/actions.ts)
  // A montage export is not cancelled (a few seconds of ffmpeg); above all, its id is NOT a video job id.
  if (a.genre === "montage") return "rien";

  // An agent batch: all its pending subtasks are cancelled, the one running is interrupted.
  if (a.genre === "lot") {
    const r = await annulerLot(a.ref);
    return r === "annule" ? "annulee" : r === "demande" ? "demandee" : "rien";
  }

  if (a.genre === "image") {
    const directe = await db
      .update(assetGenerations)
      .set({ statut: "annulee", finishedAt: maintenant, erreur: null })
      .where(and(eq(assetGenerations.uuid, a.ref), eq(assetGenerations.statut, "en_attente")))
      .returning({ id: assetGenerations.id });
    if (directe.length > 0) return "annulee";
    const pose = await db
      .update(assetGenerations)
      .set({ annulationDemandeeAt: maintenant })
      .where(and(eq(assetGenerations.uuid, a.ref), eq(assetGenerations.statut, "en_cours"), isNull(assetGenerations.annulationDemandeeAt)))
      .returning({ id: assetGenerations.id });
    if (pose.length > 0) return "demandee";
    const [g] = await db.select({ statut: assetGenerations.statut, drapeau: assetGenerations.annulationDemandeeAt }).from(assetGenerations).where(eq(assetGenerations.uuid, a.ref));
    return g?.statut === "en_cours" && g.drapeau ? "deja" : "rien";
  }

  if (a.genre === "llm") {
    const directe = await db
      .update(agentRuns)
      .set({ statut: "annulee", finishedAt: maintenant, erreur: null })
      .where(and(eq(agentRuns.uuid, a.ref), eq(agentRuns.statut, "en_attente")))
      .returning({ id: agentRuns.id });
    if (directe.length > 0) {
      await balayerEssaisSansTache(db);
      return "annulee";
    }
    const pose = await db
      .update(agentRuns)
      .set({ annulationDemandeeAt: maintenant })
      .where(and(eq(agentRuns.uuid, a.ref), eq(agentRuns.statut, "en_cours"), isNull(agentRuns.annulationDemandeeAt)))
      .returning({ id: agentRuns.id });
    if (pose.length > 0) return "demandee";
    const [r] = await db.select({ statut: agentRuns.statut, drapeau: agentRuns.annulationDemandeeAt }).from(agentRuns).where(eq(agentRuns.uuid, a.ref));
    return r?.statut === "en_cours" && r.drapeau ? "deja" : "rien";
  }

  const id = Number(a.ref);
  if (!Number.isInteger(id)) return "rien";
  const directe = await db
    .update(jobs)
    .set({ statut: "echoue", erreur: ERREUR_ANNULEE, finishedAt: maintenant })
    .where(and(eq(jobs.id, id), eq(jobs.statut, "en_attente")))
    .returning({ planId: jobs.planId });
  if (directe.length > 0) {
    await restaurerStatutPlan(directe[0]!.planId);
    return "annulee";
  }
  const pose = await db
    .update(jobs)
    .set({ annulationDemandeeAt: maintenant })
    .where(and(eq(jobs.id, id), eq(jobs.statut, "en_cours"), isNull(jobs.annulationDemandeeAt)))
    .returning({ id: jobs.id });
  if (pose.length > 0) return "demandee";
  const [j] = await db.select({ statut: jobs.statut, drapeau: jobs.annulationDemandeeAt }).from(jobs).where(eq(jobs.id, id));
  return j?.statut === "en_cours" && j.drapeau ? "deja" : "rien";
}

export async function annulationDemandeeImage(generationId: number): Promise<boolean> {
  const [g] = await db.select({ d: assetGenerations.annulationDemandeeAt }).from(assetGenerations).where(eq(assetGenerations.id, generationId));
  return g?.d != null;
}

export async function annulationDemandeeLlm(runId: number): Promise<boolean> {
  const [r] = await db.select({ d: agentRuns.annulationDemandeeAt }).from(agentRuns).where(eq(agentRuns.id, runId));
  return r?.d != null;
}

/** Marks an LLM call cancelled (the worker has cut the connection): neither error nor retry. */
export async function finirAnnulationLlm(runId: number): Promise<void> {
  await db
    .update(agentRuns)
    .set({ statut: "annulee", erreur: null, finishedAt: new Date(), progressionJetons: null })
    .where(and(eq(agentRuns.id, runId), inArray(agentRuns.statut, ["en_attente", "en_cours"])));
  await balayerEssaisSansTache(db);
}

export async function annulationDemandeeVideo(jobId: number): Promise<boolean> {
  const [j] = await db.select({ d: jobs.annulationDemandeeAt }).from(jobs).where(eq(jobs.id, jobId));
  return j?.d != null;
}

/** Marks an image generation cancelled (the worker has finished interrupting) and
 * resets progress and preview. Neither replay nor error message. */
export async function finirAnnulationImage(generationId: number): Promise<void> {
  await db
    .update(assetGenerations)
    .set({
      statut: "annulee",
      erreur: null,
      finishedAt: new Date(),
      progressionValeur: null,
      progressionMax: null,
      etapeLibelle: null,
      apercuFichier: null,
      apercuAt: null,
    })
    .where(and(eq(assetGenerations.id, generationId), inArray(assetGenerations.statut, ["en_attente", "en_cours"])));
}

/** Marks a video job cancelled: `echoue` + « Annulée », WITHOUT touching the attempt
 * (F04: only a render failure consumes one, and a cancellation is not replayed); the clip goes back to the state of its last success. */
export async function finirAnnulationVideo(jobId: number): Promise<void> {
  const fini = await db
    .update(jobs)
    .set({ statut: "echoue", erreur: ERREUR_ANNULEE, finishedAt: new Date() })
    .where(and(eq(jobs.id, jobId), inArray(jobs.statut, ["en_attente", "en_cours"])))
    .returning({ planId: jobs.planId });
  if (fini.length > 0) await restaurerStatutPlan(fini[0]!.planId);
}

/** The clip goes back to the state of its last success, unless another job of the clip
 * is still active (it then keeps control of the status). */
async function restaurerStatutPlan(planId: number): Promise<void> {
  const actifs = await db
    .select({ id: jobs.id })
    .from(jobs)
    .where(and(eq(jobs.planId, planId), inArray(jobs.statut, ["en_attente", "en_cours"])));
  if (actifs.length > 0) return;
  const precedents = await db
    .select({ statut: jobs.statut, activerUpscale: jobs.activerUpscale })
    .from(jobs)
    .where(and(eq(jobs.planId, planId), ne(jobs.erreur, ERREUR_ANNULEE)))
    .orderBy(desc(jobs.id));
  const statut = statutPlanApresAnnulation(precedents);
  await db
    .update(plans)
    .set({ statut, updatedAt: new Date() })
    .where(and(eq(plans.id, planId), inArray(plans.statut, ["en_attente", "en_cours", "rejoue"])));
}
