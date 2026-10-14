/** Liaison d'un plan avec le PRÉCÉDENT de l'épisode (2026-10-14). Deux valeurs seulement :
 *  - « suite » : le plan reprend là où l'autre finit (même lieu, même instant à peu près) : son ouverture raccorde sur l'état de fin du précédent ;
 *  - « coupe » : rupture franche (autre lieu, autre moment) : il s'ouvre librement, sans raccord à reproduire.
 * Le scénario la pose pour chaque plan (un plan ne se décrit pas par rapport à un autre : la liaison est son seul lien) ; l'utilisateur la change
 * à la main. Aucune règle de disposition ici : c'est le plan qui dit s'il enchaîne ou s'il coupe. */

export const LIAISONS = ["suite", "coupe"] as const;
export type Liaison = (typeof LIAISONS)[number];

export const LIAISON_PAR_DEFAUT: Liaison = "suite";

export const estLiaison = (v: unknown): v is Liaison => typeof v === "string" && (LIAISONS as readonly string[]).includes(v);

/** La liaison d'une valeur quelconque (colonne, sortie d'un modèle) : la valeur si elle est connue, sinon « suite » (comportement d'avant). */
export const liaisonOuDefaut = (v: unknown): Liaison => (estLiaison(v) ? v : LIAISON_PAR_DEFAUT);

export const LIBELLE_LIAISON: Record<Liaison, string> = {
  suite: "Enchaîne sur le plan précédent",
  coupe: "Coupe franche",
};
