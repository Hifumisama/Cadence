import { DOMAINE_GENRE, PRIORITE_GENRE, type DomaineGpu, type GenreTache } from "../lib/renders/gpu";

/** Order in which the worker takes tasks. A single graphics card shared between
 * ComfyUI and the local LLM: the worker does only one thing at a time, so it chooses
 * the next one at each turn.
 *
 * - **A request step first** (2026-10-17): the task that an ongoing request has posed (an iteration's agent, the rewrite of the sheet, the render) goes before the background work of the same lane (batch of 20 prompts, 20 images of a project in
 *   creation): we clicked, we are waiting for the result. This is not preemption: nothing is cut, we only choose between
 *   two tasks that have not started.
 * - **Image before LLM before video**: the short tasks first. During the
 *   day (iterations), an image must not wait behind an H3 clip in the
 *   queue; an LLM call (1 to 3 min) goes before a video (1 min 30 to 4 min); at night, the
 *   video queue empties (F04).
 * - **Same domain on a tie of tier**: if two kinds shared a tier,
 *   the one of the previous task's GPU domain would go first (no useless unload/reload).
 *   With the current order each kind has its own tier: this criterion only decides between tasks of the same kind, hence the same
 *   domain — it is there for the day we group two kinds in one tier.
 * - **FIFO on a tie**: for the same kind, the oldest first (then `id`).
 * - **No preemption**: this choice is only made between two tasks. A video in
 *   progress is never cut, and a task that arrives in the meantime waits for its end
 *   (up to 30 min for a video, see DUREE_MAX_POLL_MS of the worker). No starvation:
 *   only NEW tasks can overtake one, never an older one of the same kind; a video goes as soon as there is no more image or
 *   LLM call waiting. */

export type { DomaineGpu,  };

export type TacheEnAttente = { genre: GenreTache; id: number; createdAt: Date; /** Step of an ongoing request (iteration): goes before the background work. */ demande?: boolean };

function comparerTaches(a: TacheEnAttente, b: TacheEnAttente, precedent: DomaineGpu | null = null): number {
  const collant = (t: TacheEnAttente) => (precedent != null && DOMAINE_GENRE[t.genre] === precedent ? 0 : 1);
  const demande = (t: TacheEnAttente) => (t.demande ? 0 : 1);
  return (
    demande(a) - demande(b) ||
    PRIORITE_GENRE[a.genre] - PRIORITE_GENRE[b.genre] ||
    collant(a) - collant(b) ||
    a.createdAt.getTime() - b.createdAt.getTime() ||
    a.id - b.id ||
    a.genre.localeCompare(b.genre)
  );
}

/** The next task to process among those waiting, or null if there is none.
 * `precedent` = GPU domain of the task that has just finished (null = unknown). */
export function choisirProchaineTache(enAttente: TacheEnAttente[], precedent: DomaineGpu | null = null): TacheEnAttente | null {
  if (enAttente.length === 0) return null;
  return [...enAttente].sort((a, b) => comparerTaches(a, b, precedent))[0] ?? null;
}
