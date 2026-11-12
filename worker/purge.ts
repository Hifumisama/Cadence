import { and, eq, inArray, lt, notExists, sql } from "drizzle-orm";
import { db } from "../db";
import { agentRuns, assetGenerations, jobs, propositions } from "../db/schema";
import { ERREUR_ANNULEE, SEUIL_PURGE_ECHECS_MS, estPurgeable } from "../lib/tasks/cancellation";
import { supprimerGenerationEtFichiers } from "../lib/assets/generation-sources";

// Purge of failures « at the scale of the day »: an image request that failed or
// was cancelled more than 24 h ago disappears (row, import files become
// orphaned), and a cancelled video job likewise. NEVER touches:
// - a finished candidate: it follows the rule of 8 per asset (worker/images.ts);
// - an active task;
// - a finished LLM call: its result is used by the review screen (workstream 3);
//   only LLM calls that failed or were cancelled more than 24 h ago disappear — EXCEPT a sub-task of a
//   batch whose proposal is still open (in generation or ready): the review needs it to
//   say « sous-tâche en échec — relancer »;
// - a video job that really FAILED: it is the memory of the iteration loop
//   (F03, history of a clip's attempts), it is kept. It only disappears from
//   the header panel after a day (lib/tasks/tasks.ts, estAffichable).
//
// Called once at worker startup, then every hour (worker/index.ts).

export const INTERVALLE_PURGE_MS = 3_600_000;

export async function purgerEchecs(
  mediaRoot: string,
  maintenant: Date = new Date(),
  seuilMs: number = SEUIL_PURGE_ECHECS_MS,
): Promise<{ images: number; videos: number; llm: number }> {
  const limite = new Date(maintenant.getTime() - seuilMs);

  // Wide SQL pre-filter (created before the limit), then the pure rule decides on
  // the real end date.
  const candidats = await db
    .select()
    .from(assetGenerations)
    .where(and(inArray(assetGenerations.statut, ["echoue", "annulee"]), lt(assetGenerations.createdAt, limite)));
  let images = 0;
  for (const g of candidats) {
    if (!estPurgeable(g, maintenant, seuilMs)) continue;
    await supprimerGenerationEtFichiers(g, mediaRoot);
    images++;
  }

  // A cancelled video always has an end date (finirAnnulationVideo / direct cancellation).
  const videosAnnulees = await db
    .delete(jobs)
    .where(and(eq(jobs.statut, "echoue"), eq(jobs.erreur, ERREUR_ANNULEE), lt(jobs.finishedAt, limite)))
    .returning({ id: jobs.id });

  const llm = await purgerAppelsLlm(limite);

  return { images, videos: videosAnnulees.length, llm };
}

/** The LLM calls that failed or were cancelled before `limite`, except the sub-tasks of a batch whose proposal
 * is still open (the review needs them). Exported to be tested on its own. */
async function purgerAppelsLlm(limite: Date): Promise<number> {
  const supprimes = await db
    .delete(agentRuns)
    .where(
      and(
        inArray(agentRuns.statut, ["echoue", "annulee"]),
        lt(agentRuns.finishedAt, limite),
        notExists(
          db
            .select({ un: sql`1` })
            .from(propositions)
            .where(and(eq(propositions.id, agentRuns.propositionId), inArray(propositions.statut, ["en_generation", "prete"]))),
        ),
      ),
    )
    .returning({ id: agentRuns.id });
  return supprimes.length;
}
