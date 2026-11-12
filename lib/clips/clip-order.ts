import { eq } from "drizzle-orm";
import { db } from "../../db";
import { plans, scenes } from "../../db/schema";

/** Order of the clips of an episode — single source, shared by the drag-and-drop
 * (app/scenario/actions.ts) and the application of agent proposals
 * (lib/agents). A clip is identified by its uuid, never by its rank: `ordre` is
 * a position, rewritten densely (0..n), never a key (F03). */

export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Recomposes the order of the whole episode from a sequence of clips: the
 * clips are grouped by scene (scenes in `scenes.ordre` order, clips
 * of each scene in the sequence's order, « sans scène » at the end), then
 * `ordre` is rewritten densely (0..n) where it differs. This is what guarantees
 * that the displayed position always follows what is seen on screen. */
export async function recomposerOrdre(tx: Tx, episodeId: number, sequence: { id: number; sceneId: number | null }[]) {
  const lesScenes = await tx
    .select({ id: scenes.id })
    .from(scenes)
    .where(eq(scenes.episodeId, episodeId))
    .orderBy(scenes.ordre, scenes.id);
  const rang = new Map(lesScenes.map((sc, i) => [sc.id, i]));
  const rangDe = (sceneId: number | null) => (sceneId == null ? Infinity : (rang.get(sceneId) ?? Infinity));
  // Array.prototype.sort is stable: the relative order within each scene is kept.
  const finale = [...sequence].sort((x, y) => rangDe(x.sceneId) - rangDe(y.sceneId));

  const actuel = new Map(
    (
      await tx
        .select({ id: plans.id, sceneId: plans.sceneId, ordre: plans.ordre })
        .from(plans)
        .where(eq(plans.episodeId, episodeId))
    ).map((p) => [p.id, p]),
  );
  for (const [i, p] of finale.entries()) {
    const avant = actuel.get(p.id);
    if (!avant) continue;
    if (avant.sceneId !== p.sceneId) {
      await tx.update(plans).set({ sceneId: p.sceneId, ordre: i, updatedAt: new Date() }).where(eq(plans.id, p.id));
    } else if (avant.ordre !== i) {
      await tx.update(plans).set({ ordre: i }).where(eq(plans.id, p.id));
    }
  }
}
