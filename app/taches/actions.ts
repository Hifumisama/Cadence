"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { agentRuns, assetGenerations, creationsProjet, demandes, jobs, montageExports, propositions } from "@/db/schema";
import { annulerDemande } from "@/lib/tasks/requests-pilot";
import { and, inArray, isNull, notInArray, sql } from "drizzle-orm";
import { arreterCreation, idsRunsDeCreation } from "@/lib/agents/creation-db";
import { demanderAnnulation, viderFile as viderFileDb, type ResultatAnnulation } from "@/lib/tasks/cancellation-db";
import { analyserCle } from "@/lib/tasks/tasks";

// « Vu »: the user has seen a finished or failed task
// (header indicator). These actions reload no page: the indicator updates through
// its own polling. Never called during a render.

/** Marks tasks as seen (`image:<uuid>` / `video:<id>` / `llm:<uuid>`). Unknown
 * keys are ignored. */
export async function marquerVu(cles: string[]): Promise<{ ok: true }> {
  const maintenant = new Date();
  const uuids: string[] = [];
  const uuidsLlm: string[] = [];
  const uuidsLots: string[] = [];
  const idsRuns: number[] = [];
  const idsDemandes: number[] = [];
  const idsExports: number[] = [];
  const ids: number[] = [];
  for (const cle of cles.slice(0, 100)) {
    const a = analyserCle(cle);
    if (!a) continue;
    if (a.genre === "image") uuids.push(a.ref);
    else if (a.genre === "llm") uuidsLlm.push(a.ref);
    else if (a.genre === "lot") uuidsLots.push(a.ref);
    else if (a.genre === "creation") idsRuns.push(...(await idsRunsDeCreation(Number(a.ref))));
    else if (a.genre === "demande") idsDemandes.push(Number(a.ref));
    else if (a.genre === "montage") idsExports.push(Number(a.ref));
    else if (Number.isInteger(Number(a.ref))) ids.push(Number(a.ref));
  }
  if (idsDemandes.length > 0) await db.update(demandes).set({ vuAt: maintenant }).where(and(inArray(demandes.id, idsDemandes), isNull(demandes.vuAt)));
  if (idsExports.length > 0) await db.update(montageExports).set({ vuAt: maintenant }).where(and(inArray(montageExports.id, idsExports), isNull(montageExports.vuAt)));
  if (idsRuns.length > 0) {
    // A project's creation counts as seen when all its agent tasks do.
    await db.update(agentRuns).set({ vuAt: maintenant }).where(and(inArray(agentRuns.id, idsRuns), isNull(agentRuns.vuAt)));
  }
  if (uuids.length > 0) {
    await db
      .update(assetGenerations)
      .set({ vuAt: maintenant })
      .where(and(inArray(assetGenerations.uuid, uuids), isNull(assetGenerations.vuAt)));
  }
  if (uuidsLlm.length > 0) {
    await db.update(agentRuns).set({ vuAt: maintenant }).where(and(inArray(agentRuns.uuid, uuidsLlm), isNull(agentRuns.vuAt)));
  }
  if (uuidsLots.length > 0) {
    // A batch counts as seen when all its subtasks do.
    const props = await db.select({ id: propositions.id }).from(propositions).where(inArray(propositions.uuid, uuidsLots));
    if (props.length > 0) {
      await db
        .update(agentRuns)
        .set({ vuAt: maintenant })
        .where(and(inArray(agentRuns.propositionId, props.map((p) => p.id)), isNull(agentRuns.vuAt)));
    }
  }
  if (ids.length > 0) {
    await db.update(jobs).set({ vuAt: maintenant }).where(and(inArray(jobs.id, ids), isNull(jobs.vuAt)));
  }
  return { ok: true };
}

/** « Tout marquer comme vu » (mark all as seen): all finished tasks not yet seen. Active
 * tasks stay unseen: they will be marked when they end. */
export async function marquerToutVu(): Promise<{ ok: true }> {
  const maintenant = new Date();
  await db
    .update(assetGenerations)
    .set({ vuAt: maintenant })
    .where(and(isNull(assetGenerations.vuAt), notInArray(assetGenerations.statut, ["en_attente", "en_cours"])));
  await db
    .update(jobs)
    .set({ vuAt: maintenant })
    .where(and(isNull(jobs.vuAt), notInArray(jobs.statut, ["en_attente", "en_cours"])));
  await db
    .update(agentRuns)
    .set({ vuAt: maintenant })
    .where(and(isNull(agentRuns.vuAt), notInArray(agentRuns.statut, ["en_attente", "en_cours"])));
  await db.update(demandes).set({ vuAt: maintenant }).where(and(isNull(demandes.vuAt), notInArray(demandes.statut, ["en_cours"])));
  await db.update(montageExports).set({ vuAt: maintenant }).where(and(isNull(montageExports.vuAt), notInArray(montageExports.statut, ["en_attente", "en_cours"])));
  return { ok: true };
}

/** Cancels a task (`image:<uuid>` / `video:<id>` / `llm:<uuid>` / `lot:<uuid de la proposition>`). Pending:
 * cancelled immediately. In progress: the flag is set; the worker interrupts
 * ComfyUI (after checking in /queue that it is indeed this prompt) or cuts the
 * connection to the LLM server, then marks the task cancelled.
 * Finished, failed or already cancelled: no effect. Idempotent. */
export async function annulerTache(cle: string): Promise<{ ok: true; resultat: ResultatAnnulation }> {
  // The « Conception » line of the header groups a project's whole creation: cancelling it means stopping the installer
  // (otherwise it would immediately relaunch the cut task). What has already been written is not undone.
  const a = analyserCle(cle);
  if (a?.genre === "creation") {
    const projectId = Number(a.ref);
    const r = await arreterCreation(projectId);
    revalidatePath(`/p/${projectId}/creation`);
    return { ok: true, resultat: r.ok ? "annulee" : "rien" };
  }
  // A request (iterate a clip…): it is cancelled along with the task of its current step; what has already been written is not undone.
  if (a?.genre === "demande") {
    const r = await annulerDemande(Number(a.ref));
    revalidatePath("/", "layout");
    return { ok: true, resultat: r };
  }
  return { ok: true, resultat: await demanderAnnulation(cle) };
}

/** « Vider la file » (empty the queue): cancels everything that WAITS (images, sounds, videos, agent calls,
 * batch subtasks). What is running continues; nothing is interrupted, everything relaunches. Returns the
 * number of tasks removed. */
export async function viderFile(): Promise<{ ok: true; annulees: number }> {
  return { ok: true, annulees: await viderFileDb() };
}

const ACTIFS = ["en_attente", "en_cours"] as const;

/** Removes FINISHED, FAILED or CANCELLED tasks from the panel's list (✕). Nothing is
 * deleted: the task is only hidden (and marked seen); a generation's candidate stays
 * readable in its asset's popup. Active tasks cannot be removed (cancel them instead). */
export async function retirerTaches(cles: string[]): Promise<{ ok: true }> {
  const maintenant = new Date();
  const uuids: string[] = [];
  const uuidsLlm: string[] = [];
  const uuidsLots: string[] = [];
  const idsRuns: number[] = [];
  const idsDemandes: number[] = [];
  const idsExports: number[] = [];
  const ids: number[] = [];
  for (const cle of cles.slice(0, 100)) {
    const a = analyserCle(cle);
    if (!a) continue;
    if (a.genre === "image") uuids.push(a.ref);
    else if (a.genre === "llm") uuidsLlm.push(a.ref);
    else if (a.genre === "lot") uuidsLots.push(a.ref);
    else if (a.genre === "creation") idsRuns.push(...(await idsRunsDeCreation(Number(a.ref))));
    else if (a.genre === "demande") idsDemandes.push(Number(a.ref));
    else if (a.genre === "montage") idsExports.push(Number(a.ref));
    else if (Number.isInteger(Number(a.ref))) ids.push(Number(a.ref));
  }
  const marque = { masqueAt: maintenant, vuAt: sql`coalesce(vu_at, ${maintenant.toISOString()}::timestamp)` };
  if (idsDemandes.length > 0) await db.update(demandes).set(marque).where(and(inArray(demandes.id, idsDemandes), notInArray(demandes.statut, ["en_cours"])));
  if (idsExports.length > 0) await db.update(montageExports).set(marque).where(and(inArray(montageExports.id, idsExports), notInArray(montageExports.statut, [...ACTIFS])));
  if (idsRuns.length > 0) {
    // Creation tasks: hidden, like those of a batch (nothing is deleted, the progress page stays).
    await db.update(agentRuns).set(marque).where(and(inArray(agentRuns.id, idsRuns), notInArray(agentRuns.statut, [...ACTIFS])));
  }
  if (uuids.length > 0) {
    await db.update(assetGenerations).set(marque).where(and(inArray(assetGenerations.uuid, uuids), notInArray(assetGenerations.statut, [...ACTIFS])));
  }
  if (uuidsLlm.length > 0) {
    await db.update(agentRuns).set(marque).where(and(inArray(agentRuns.uuid, uuidsLlm), notInArray(agentRuns.statut, [...ACTIFS])));
  }
  if (uuidsLots.length > 0) {
    const props = await db.select({ id: propositions.id }).from(propositions).where(inArray(propositions.uuid, uuidsLots));
    if (props.length > 0) {
      await db
        .update(agentRuns)
        .set(marque)
        .where(and(inArray(agentRuns.propositionId, props.map((p) => p.id)), notInArray(agentRuns.statut, [...ACTIFS])));
    }
  }
  if (ids.length > 0) {
    await db.update(jobs).set(marque).where(and(inArray(jobs.id, ids), notInArray(jobs.statut, [...ACTIFS])));
  }
  return { ok: true };
}

/** « Vider la liste » (empty the list): hides at once all finished tasks of a category, `terminees`
 * (succeeded) or `echecs` (failed and cancelled). Active tasks are never touched. */
export async function viderListe(categorie: "terminees" | "echecs"): Promise<{ ok: true }> {
  const maintenant = new Date();
  const marque = { masqueAt: maintenant, vuAt: sql`coalesce(vu_at, ${maintenant.toISOString()}::timestamp)` };
  const statutsGen = categorie === "terminees" ? ["termine"] : ["echoue", "annulee"];
  // `jobs.statut` is a Postgres enum without « annulee » (a cancelled video is `echoue`).
  const statutsJob = categorie === "terminees" ? (["termine"] as const) : (["echoue"] as const);
  await db.update(assetGenerations).set(marque).where(and(isNull(assetGenerations.masqueAt), inArray(assetGenerations.statut, statutsGen)));
  await db.update(agentRuns).set(marque).where(and(isNull(agentRuns.masqueAt), inArray(agentRuns.statut, statutsGen)));
  // The « Conception » line goes with all its tasks (including the succeeded ones of a creation that failed or was stopped).
  const creations = await db
    .select({ projectId: creationsProjet.projectId })
    .from(creationsProjet)
    .where(inArray(creationsProjet.statut, categorie === "terminees" ? ["termine"] : ["echoue", "arretee"]));
  const idsRuns = (await Promise.all(creations.map((c) => idsRunsDeCreation(c.projectId)))).flat();
  if (idsRuns.length > 0) await db.update(agentRuns).set(marque).where(and(inArray(agentRuns.id, idsRuns), notInArray(agentRuns.statut, [...ACTIFS])));
  await db.update(jobs).set(marque).where(and(isNull(jobs.masqueAt), inArray(jobs.statut, [...statutsJob])));
  await db.update(demandes).set(marque).where(and(isNull(demandes.masqueAt), inArray(demandes.statut, statutsGen)));
  await db.update(montageExports).set(marque).where(and(isNull(montageExports.masqueAt), inArray(montageExports.statut, statutsGen)));
  return { ok: true };
}
