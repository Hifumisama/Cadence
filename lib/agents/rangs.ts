import type { Position, RangDeplace } from "./types";

/** Insertion d'un plan : où il tombe et quels plans voient leur rang changer. Pur, testé.
 * Les plans s'identifient par uuid, jamais par numéro (F03) : la position est un repère
 * (après tel plan, début, fin), le rang n'est qu'un affichage (base 1). */

export type PlanOrdonne = { uuid: string; titre: string; sceneId?: number | null };

export type Insertion = {
  /** Index 0-based de la séquence résultante où le nouveau plan prend place. */
  index: number;
  /** Les plans existants dont le rang change (ceux qui suivent le point d'insertion). */
  deplaces: RangDeplace[];
};

/** `existants` : les plans de l'épisode dans l'ordre de lecture. Renvoie null si le plan de
 * repère n'existe pas dans l'épisode. */
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
  /** Index 0-based du plan dans la séquence SANS lui, à l'endroit où il est reposé. */
  index: number;
  /** Rang (base 1) avant et après le déplacement. */
  rangAvant: number;
  rangApres: number;
  /** La scène que le plan adopte : celle du plan qui le précède (ou du premier plan, s'il passe en tête).
   * L'ordre est regroupé par scène (`recomposerOrdre`), donc se placer « après le plan X » veut dire
   * entrer dans la scène de X. `undefined` si l'épisode n'a aucun autre plan. */
  sceneId: number | null | undefined;
  /** Les AUTRES plans dont le rang change. */
  deplaces: RangDeplace[];
};

/** Déplacement d'un plan existant : même repère que l'insertion (après tel plan par uuid, début, fin). Pur,
 * testé. Renvoie null si le plan est introuvable, si le repère n'est pas dans l'épisode, ou si le repère est le
 * plan lui-même. */
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

/** Suppression d'un plan : les plans qui le suivent montent d'un rang (aucun trou, F03). Pur, testé. Null si le plan
 * n'est pas dans la liste. */
export function planifierSuppression(existants: PlanOrdonne[], planUuid: string): RangDeplace[] | null {
  const i = existants.findIndex((p) => p.uuid === planUuid);
  if (i === -1) return null;
  return existants.slice(i + 1).map((p, k) => ({ planUuid: p.uuid, titre: p.titre, rangAvant: i + k + 2, rangApres: i + k + 1 }));
}
