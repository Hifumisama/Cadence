import { unlink } from "node:fs/promises";
import { join } from "node:path";
import { and, eq, isNotNull } from "drizzle-orm";
import { db } from "../db";
import { agentRuns, assetGenerations, jobs } from "../db/schema";
import { finirAnnulationImage, finirAnnulationLlm, finirAnnulationVideo } from "../lib/tasks/cancellation-db";
import { cheminGenerationMedia } from "../lib/media";

// Resumption at worker startup: what was « en cours » belonged to a dead
// worker (stop, crash, or simply a restart of `tsx watch`, which restarts the
// worker at each save of an imported file). Without this resumption, these
// rows remain « en cours » forever and the screen spins indefinitely.
//
// - Image `en_cours` → `echoue` (« Interrompue (worker redémarré) »). No automatic
//   replay: same rule as for any image failure, the user restarts it.
// - Video `en_cours` → `en_attente`, without consuming an attempt (F04: an
//   interruption is not a render failure). The clip's status is not touched:
//   the job puts it back « en cours » when restarting, as after an unavailability.
//
// - A task `en_cours` whose cancellation had been requested is FINISHED as
//   cancelled (image `annulee`, video `echoue`/« Annulée »): we do not replay it, and
//   it is not a « worker redémarré » failure.
// - LLM call `en_cours` → `echoue` (« Interrompue (worker redémarré) »), never
//   replayed: a call of several minutes is restarted by hand, and the
//   cut HTTP connection has already stopped the generation on the llama.cpp side.
//
// The operation is idempotent (only touches what is « en cours ») and fast:
// two UPDATEs and a few deletions of preview files.
//
// TRAP: we assume ONE SINGLE worker on the database. If a second worker runs
// (e.g. a forgotten container), its tasks in progress would be resumed wrongly.
// POSSIBLE DUPLICATE: if ComfyUI is still running the prompt of the resumed task, a
// video put back in the queue will be submitted a second time (GPU busy for nothing).
// V2 (not coded): find the task by `comfyui_prompt_id` — /history if it is
// finished (we get the result), /queue if it is still running (we reattach to the
// tracking) — before deciding.

export const ERREUR_INTERROMPUE = "Interrompue (worker redémarré)";

/** Paths (relative to MEDIA_ROOT) of the preview files left by an
 * interrupted generation: the file being written is never the result
 * (`fichier` is only filled at the end), only the preview lingers. */
export function fichiersOrphelins(g: { assetId: number; apercuFichier: string | null }): string[] {
  return g.apercuFichier ? [cheminGenerationMedia(g.assetId, g.apercuFichier)] : [];
}

export async function reprendreOrphelines(
  mediaRoot: string,
): Promise<{ images: number; videos: number; llm: number; annulees: number }> {
  const images = await db.select().from(assetGenerations).where(eq(assetGenerations.statut, "en_cours"));
  let annuleesImages = 0;
  let annuleesVideos = 0;
  for (const g of images) {
    if (g.annulationDemandeeAt) {
      await finirAnnulationImage(g.id);
      annuleesImages++;
      for (const relatif of fichiersOrphelins(g)) {
        await unlink(join(mediaRoot, relatif)).catch(() => undefined);
      }
      continue;
    }
    await db
      .update(assetGenerations)
      .set({
        statut: "echoue",
        erreur: ERREUR_INTERROMPUE,
        finishedAt: new Date(),
        progressionValeur: null,
        progressionMax: null,
        etapeLibelle: null,
        apercuFichier: null,
        apercuAt: null,
      })
      // Guard: if it was finished in the meantime, we do not touch it.
      .where(and(eq(assetGenerations.id, g.id), eq(assetGenerations.statut, "en_cours")));
    for (const relatif of fichiersOrphelins(g)) {
      await unlink(join(mediaRoot, relatif)).catch(() => undefined);
    }
  }

  for (const j of await db.select({ id: jobs.id }).from(jobs).where(and(eq(jobs.statut, "en_cours"), isNotNull(jobs.annulationDemandeeAt)))) {
    await finirAnnulationVideo(j.id);
    annuleesVideos++;
  }

  const videos = await db
    .update(jobs)
    .set({ statut: "en_attente", startedAt: null })
    .where(eq(jobs.statut, "en_cours"))
    .returning({ id: jobs.id });

  // LLM calls: a cancellation flag already set takes precedence over « interrompue ».
  let annuleesLlm = 0;
  let llm = 0;
  for (const r of await db.select().from(agentRuns).where(eq(agentRuns.statut, "en_cours"))) {
    if (r.annulationDemandeeAt) {
      await finirAnnulationLlm(r.id);
      annuleesLlm++;
      continue;
    }
    const mis = await db
      .update(agentRuns)
      .set({ statut: "echoue", erreur: ERREUR_INTERROMPUE, finishedAt: new Date(), progressionJetons: null })
      .where(and(eq(agentRuns.id, r.id), eq(agentRuns.statut, "en_cours")))
      .returning({ id: agentRuns.id });
    llm += mis.length;
  }

  return {
    images: images.length - annuleesImages,
    videos: videos.length,
    llm,
    annulees: annuleesImages + annuleesVideos + annuleesLlm,
  };
}
