import type { Position, RangDeplace } from "./types";

/** Insertion d'un plan : où il tombe et quels plans voient leur rang changer. Pur, testé.
 * Les plans s'identifient par uuid, jamais par numéro (F03) : la position est un repère
 * (après tel plan, début, fin), le rang n'est qu'un affichage (base 1). */

export type PlanOrdonne = { uuid: string; titre: string };

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
