import { and, count, eq, lt } from "drizzle-orm";
import { db } from "../../db";
import { agentRuns, assetGenerations } from "../../db/schema";
import type { Tx } from "../ordre-plans";
import type { EtatTache } from "./types";

/** Tâches LLM du système d'agents (agent_runs) : pose dans la file et lecture de l'état. */

type DbOuTx = typeof db | Tx;
export type ButRun = "tour" | "brief" | "proposition";

export async function creerRun(
  d: DbOuTx,
  p: {
    skill: string;
    entree: object;
    but: ButRun;
    projectId: number;
    conversationId: number | null;
    propositionId?: number | null;
    options?: { modele?: string; variante?: string } | null;
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
    })
    .returning({ id: agentRuns.id, uuid: agentRuns.uuid });
  return run!;
}

/** L'état d'une tâche pour l'interface ; `positionFile` = rang parmi les tâches GPU en attente
 * qui passent avant elle (images d'abord, puis appels LLM plus anciens ; la vidéo passe après). */
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
    erreur: r.erreur,
    positionFile,
  };
}

/** `true` si une tâche de cette conversation est en attente ou en cours (un seul tour à la fois). */
export async function tacheActive(conversationId: number, buts?: ButRun[]): Promise<boolean> {
  const l = await db
    .select({ statut: agentRuns.statut, but: agentRuns.but })
    .from(agentRuns)
    .where(eq(agentRuns.conversationId, conversationId));
  return l.some((r) => (r.statut === "en_attente" || r.statut === "en_cours") && (!buts || buts.includes((r.but ?? "tour") as ButRun)));
}
