/** Quels filtres le registre propose, selon ce qu'il contient (décision 2026-10-15) : avec peu d'assets, aucun filtre n'est utile, et chaque
 * filtre de trop est du bruit. Pur : testé dans `registre-filtres.test.ts`. */

/** En dessous : on voit tout d'un coup d'œil, ni recherche ni filtre. */
export const SEUIL_RECHERCHE = 8;
/** À partir de là : le statut et « sans plan » rejoignent les filtres (derrière le bouton « Filtres »). */
export const SEUIL_FILTRES_AVANCES = 16;

export type FiltresUtiles = {
  /** Le champ de recherche. */
  recherche: boolean;
  /** Les puces de type (les plus utiles) : seulement s'il y a au moins deux types à départager. */
  types: boolean;
  /** Le bouton « Filtres » (statut, sans plan). */
  avances: boolean;
};

export function filtresUtiles(lignes: { type: string }[]): FiltresUtiles {
  const n = lignes.length;
  const nbTypes = new Set(lignes.map((l) => l.type)).size;
  return { recherche: n >= SEUIL_RECHERCHE, types: n >= SEUIL_RECHERCHE && nbTypes >= 2, avances: n >= SEUIL_FILTRES_AVANCES };
}

/** La plage de sélection entre deux assets de la liste affichée (Maj+clic), bornes comprises, dans l'ordre d'affichage ; vide si l'un des deux
 * n'y est pas. */
export function plageDeCodes(codes: string[], depuis: string, jusqua: string): string[] {
  const a = codes.indexOf(depuis);
  const b = codes.indexOf(jusqua);
  if (a < 0 || b < 0) return [];
  return codes.slice(Math.min(a, b), Math.max(a, b) + 1);
}
