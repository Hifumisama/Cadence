import { and, asc, count, eq, lt } from "drizzle-orm";
import { db } from "../../db";
import { agentRuns, assetGenerations } from "../../db/schema";
import type { Tx } from "../clips/clip-order";
import type { EtatTache } from "./types";

/** LLM tasks of the agent system (agent_runs): queuing and reading the state. */

type DbOuTx = typeof db | Tx;
export type ButRun = "tour" | "brief" | "proposition" | "affiche" | "essai";

export async function creerRun(
  d: DbOuTx,
  p: {
    skill: string;
    entree: object;
    but: ButRun;
    projectId: number;
    conversationId: number | null;
    propositionId?: number | null;
    options?: { modele?: string; variante?: string; [cle: string]: unknown } | null;
    /** Batch: the subtask ("ep:12") and what the review says about it ("Épisode 1 · Le sel"). */
    cleSousTache?: string | null;
    libelleSousTache?: string | null;
    /** The request (iteration…) this task is a step of: lib/tasks/requests.ts. */
    demandeId?: number | null;
  },
): Promise<{ id: number; uuid: string }> {
  const [run] = await d
    .insert(agentRuns)
    .values({
      skill: p.skill,
      entree: p.entree,
      options: p.options ?? null,
      projectId: p.projectId,
      but: p.but,
      conversationId: p.conversationId,
      propositionId: p.propositionId ?? null,
      cleSousTache: p.cleSousTache ?? null,
      libelleSousTache: p.libelleSousTache ?? null,
      demandeId: p.demandeId ?? null,
    })
    .returning({ id: agentRuns.id, uuid: agentRuns.uuid });
  return run!;
}

/** A task's state for the interface; `positionFile` = rank among the pending GPU tasks
 * that go before it (images first, then older LLM calls; the video goes after). */
export async function etatTache(runId: number | null): Promise<EtatTache | null> {
  if (runId == null) return null;
  const [r] = await db.select().from(agentRuns).where(eq(agentRuns.id, runId));
  if (!r) return null;
  let positionFile: number | null = null;
  if (r.statut === "en_attente") {
    const [{ n: images } = { n: 0 }] = await db.select({ n: count() }).from(assetGenerations).where(eq(assetGenerations.statut, "en_attente"));
    const [{ n: avant } = { n: 0 }] = await db
      .select({ n: count() })
      .from(agentRuns)
      .where(and(eq(agentRuns.statut, "en_attente"), lt(agentRuns.id, r.id)));
    positionFile = images + avant + 1;
  }
  return {
    runUuid: r.uuid,
    but: (r.but ?? "tour") as ButRun,
    statut: r.statut as EtatTache["statut"],
    progressionJetons: r.progressionJetons,
    fluxTexte: r.statut === "en_cours" ? r.fluxTexte : null,
    fluxReflexion: r.statut === "en_cours" ? r.fluxReflexion : null,
    erreur: r.erreur,
    positionFile,
  };
}

/** The rank of EACH pending agent task in the GPU queue (1 = next), in the order
 * the worker takes them: pending images go first, then the LLM calls from oldest to
 * newest. A single read for a whole batch. */
export async function positionsFile(): Promise<Map<number, number>> {
  const [{ n: images } = { n: 0 }] = await db.select({ n: count() }).from(assetGenerations).where(eq(assetGenerations.statut, "en_attente"));
  const attente = await db
    .select({ id: agentRuns.id })
    .from(agentRuns)
    .where(eq(agentRuns.statut, "en_attente"))
    .orderBy(asc(agentRuns.createdAt), asc(agentRuns.id));
  return new Map(attente.map((r, i) => [r.id, Number(images) + i + 1]));
}

/** The task occupying the conversation (pending or running), or null: the one a refusal must NAME
 * so the user can cancel it. Priority to the oldest running one, otherwise to the oldest pending one. */
export type TacheBloquante = { runUuid: string; skill: string; but: ButRun; statut: "en_attente" | "en_cours"; libelle: string | null };

export async function tacheBloquante(conversationId: number, buts?: ButRun[]): Promise<TacheBloquante | null> {
  const l = await db
    .select({ uuid: agentRuns.uuid, skill: agentRuns.skill, statut: agentRuns.statut, but: agentRuns.but, libelle: agentRuns.libelleSousTache })
    .from(agentRuns)
    .where(eq(agentRuns.conversationId, conversationId))
    .orderBy(asc(agentRuns.createdAt), asc(agentRuns.id));
  const actifs = l.filter((r) => (r.statut === "en_attente" || r.statut === "en_cours") && (!buts || buts.includes((r.but ?? "tour") as ButRun)));
  const r = actifs.find((x) => x.statut === "en_cours") ?? actifs[0];
  if (!r) return null;
  return { runUuid: r.uuid, skill: r.skill, but: (r.but ?? "tour") as ButRun, statut: r.statut as "en_attente" | "en_cours", libelle: r.libelle };
}

/** `true` if a task of this conversation is pending or running (one turn at a time). */
export async function tacheActive(conversationId: number, buts?: ButRun[]): Promise<boolean> {
  return (await tacheBloquante(conversationId, buts)) != null;
}
