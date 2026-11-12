import type { Position, RangDeplace } from "./types";

/** Insertion of a clip: where it lands and which clips see their rank change. Pure, tested.
 * Clips are identified by uuid, never by number (F03): the position is a marker
 * (after such clip, start, end), the rank is only a display (base 1). */

export type PlanOrdonne = { uuid: string; titre: string; sceneId?: number | null };

export type Insertion = {
  /** 0-based index in the resulting sequence where the new clip takes its place. */
  index: number;
  /** The existing clips whose rank changes (those following the insertion point). */
  deplaces: RangDeplace[];
};

/** `existants`: the episode's clips in reading order. Returns null if the reference clip
 * does not exist in the episode. */
export function planifierInsertion(existants: PlanOrdonne[], position: Position | null): Insertion | null {
  let index: number;
  if (!position || "fin" in position) index = existants.length;
  else if ("debut" in position) index = 0;
  else {
    const i = existants.findIndex((p) => p.uuid === position.apresPlanUuid);
    if (i === -1) return null;
    index = i + 1;
  }
  const deplaces = existants.slice(index).map((p, k) => ({
    planUuid: p.uuid,
    titre: p.titre,
    rangAvant: index + k + 1,
    rangApres: index + k + 2,
  }));
  return { index, deplaces };
}

export type Deplacement = {
  /** 0-based index of the clip in the sequence WITHOUT it, where it is set back down. */
  index: number;
  /** Rank (base 1) before and after the move. */
  rangAvant: number;
  rangApres: number;
  /** The scene the clip adopts: that of the clip before it (or of the first clip, if it goes to the head).
   * The order is grouped by scene (`recomposerOrdre`), so placing oneself "after clip X" means
   * entering X's scene. `undefined` if the episode has no other clip. */
  sceneId: number | null | undefined;
  /** The OTHER clips whose rank changes. */
  deplaces: RangDeplace[];
};

/** Moving an existing clip: same marker as the insertion (after such clip by uuid, start, end). Pure,
 * tested. Returns null if the clip is not found, if the marker is not in the episode, or if the marker is the
 * clip itself. */
export function planifierDeplacement(existants: PlanOrdonne[], planUuid: string, position: Position | null): Deplacement | null {
  const depart = existants.findIndex((p) => p.uuid === planUuid);
  if (depart === -1) return null;
  const sans = existants.filter((p) => p.uuid !== planUuid);
  let index: number;
  if (!position || "fin" in position) index = sans.length;
  else if ("debut" in position) index = 0;
  else {
    const i = sans.findIndex((p) => p.uuid === position.apresPlanUuid);
    if (i === -1) return null;
    index = i + 1;
  }
  const apres = [...sans.slice(0, index), existants[depart]!, ...sans.slice(index)];
  const deplaces = apres
    .map((p, k) => ({ planUuid: p.uuid, titre: p.titre, rangAvant: existants.findIndex((q) => q.uuid === p.uuid) + 1, rangApres: k + 1 }))
    .filter((r) => r.planUuid !== planUuid && r.rangAvant !== r.rangApres);
  const repere = index > 0 ? sans[index - 1] : sans[0];
  return { index, rangAvant: depart + 1, rangApres: index + 1, sceneId: repere ? (repere.sceneId ?? null) : undefined, deplaces };
}

/** Deleting a clip: the clips that follow it move up one rank (no gap, F03). Pure, tested. Null if the clip
 * is not in the list. */
export function planifierSuppression(existants: PlanOrdonne[], planUuid: string): RangDeplace[] | null {
  const i = existants.findIndex((p) => p.uuid === planUuid);
  if (i === -1) return null;
  return existants.slice(i + 1).map((p, k) => ({ planUuid: p.uuid, titre: p.titre, rangAvant: i + k + 2, rangApres: i + k + 1 }));
}
