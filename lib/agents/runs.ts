import { and, asc, count, eq, lt } from "drizzle-orm";
import { db } from "../../db";
import { agentRuns, assetGenerations } from "../../db/schema";
import type { Tx } from "../ordre-plans";
import type { EtatTache } from "./types";

/** Tâches LLM du système d'agents (agent_runs) : pose dans la file et lecture de l'état. */

type DbOuTx = typeof db | Tx;
export type ButRun = "tour" | "brief" | "proposition" | "affiche";

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
    /** Lot : la sous-tâche (« ep:12 ») et ce que la revue en dit (« Épisode 1 · Le sel »). */
    cleSousTache?: string | null;
    libelleSousTache?: string | null;
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
    fluxTexte: r.statut === "en_cours" ? r.fluxTexte : null,
    fluxReflexion: r.statut === "en_cours" ? r.fluxReflexion : null,
    erreur: r.erreur,
    positionFile,
  };
}

/** Le rang de CHAQUE tâche d'agent en attente dans la file du GPU (1 = la prochaine), dans l'ordre
 * où le worker les prend : les images en attente passent avant, puis les appels LLM du plus ancien au
 * plus récent. Une seule lecture pour tout un lot. */
export async function positionsFile(): Promise<Map<number, number>> {
  const [{ n: images } = { n: 0 }] = await db.select({ n: count() }).from(assetGenerations).where(eq(assetGenerations.statut, "en_attente"));
  const attente = await db
    .select({ id: agentRuns.id })
    .from(agentRuns)
    .where(eq(agentRuns.statut, "en_attente"))
    .orderBy(asc(agentRuns.createdAt), asc(agentRuns.id));
  return new Map(attente.map((r, i) => [r.id, Number(images) + i + 1]));
}

/** La tâche qui occupe la conversation (en attente ou en cours), ou null : celle qu'un refus doit NOMMER
 * pour que l'utilisateur puisse l'annuler. Priorité à la plus ancienne en cours, sinon à la plus ancienne en attente. */
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

/** `true` si une tâche de cette conversation est en attente ou en cours (un seul tour à la fois). */
export async function tacheActive(conversationId: number, buts?: ButRun[]): Promise<boolean> {
  return (await tacheBloquante(conversationId, buts)) != null;
}
