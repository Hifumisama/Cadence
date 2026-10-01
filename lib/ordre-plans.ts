import { eq } from "drizzle-orm";
import { db } from "../db";
import { plans, scenes } from "../db/schema";

/** Ordre des plans d'un épisode — source unique, partagée par le glisser-déposer
 * (app/scenario/actions.ts) et l'application des propositions d'agents
 * (lib/agents). Un plan s'identifie par son uuid, jamais par son rang : `ordre` est
 * une position, réécrite densément (0..n), jamais une clé (F03). */

export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Recompose l'ordre de tout l'épisode à partir d'une séquence de plans : les
 * plans sont regroupés par scène (scènes dans l'ordre de `scenes.ordre`, plans
 * de chaque scène dans l'ordre de la séquence, « sans scène » à la fin), puis
 * `ordre` est réécrit densément (0..n) là où il diffère. C'est ce qui garantit
 * que la position affichée suit toujours ce qu'on voit à l'écran. */
export async function recomposerOrdre(tx: Tx, episodeId: number, sequence: { id: number; sceneId: number | null }[]) {
  const lesScenes = await tx
    .select({ id: scenes.id })
    .from(scenes)
    .where(eq(scenes.episodeId, episodeId))
    .orderBy(scenes.ordre, scenes.id);
  const rang = new Map(lesScenes.map((sc, i) => [sc.id, i]));
  const rangDe = (sceneId: number | null) => (sceneId == null ? Infinity : (rang.get(sceneId) ?? Infinity));
  // Array.prototype.sort est stable : l'ordre relatif dans chaque scène est conservé.
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
