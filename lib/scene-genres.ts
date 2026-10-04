/** Genre d'une scène : il dit COMMENT ses plans se rédigent (guides de `plan-h3` chargés par variante) et comment le
 * scénario les découpe. Pur — importable côté client. Null = scène « standard » (aucun guide de genre). */

export const GENRES_SCENE = ["action", "dialogue", "montage", "contemplatif", "tension"] as const;
export type GenreScene = (typeof GENRES_SCENE)[number];

export const LIBELLE_GENRE: Record<GenreScene, string> = {
  action: "Action",
  dialogue: "Dialogue",
  montage: "Montage",
  contemplatif: "Contemplatif",
  tension: "Tension, bascule",
};

export function estGenreScene(v: unknown): v is GenreScene {
  return typeof v === "string" && (GENRES_SCENE as readonly string[]).includes(v);
}

/** Genre lu depuis une valeur libre (base, saisie) : le genre connu, ou null. */
export function genreOuNull(v: unknown): GenreScene | null {
  return estGenreScene(v) ? v : null;
}

/** Variante passée au chargeur de `plan-h3` : le genre, ou « standard » (aucun guide de genre chargé : sans variante,
 * le chargeur enverrait TOUS les guides). */
export function variantePlanH3(genre: unknown): string {
  return genreOuNull(genre) ?? "standard";
}
