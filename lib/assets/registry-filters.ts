/** Which filters the registry offers, depending on what it contains (decision 2026-10-15): with few assets, no filter is useful, and each
 * extra filter is noise. Pure: tested in `registre-filtres.test.ts`. */

/** Below this: we see everything at a glance, neither search nor filter. */
const SEUIL_RECHERCHE = 8;
/** From there on: the status and « sans plan » join the filters (behind the « Filtres » button). */
const SEUIL_FILTRES_AVANCES = 16;

export type FiltresUtiles = {
  /** The search field. */
  recherche: boolean;
  /** The type chips (the most useful): only if there are at least two types to tell apart. */
  types: boolean;
  /** The « Filtres » button (status, sans plan). */
  avances: boolean;
};

export function filtresUtiles(lignes: { type: string }[]): FiltresUtiles {
  const n = lignes.length;
  const nbTypes = new Set(lignes.map((l) => l.type)).size;
  return { recherche: n >= SEUIL_RECHERCHE, types: n >= SEUIL_RECHERCHE && nbTypes >= 2, avances: n >= SEUIL_FILTRES_AVANCES };
}

/** The selection range between two assets of the displayed list (Shift+click), bounds included, in display order; empty if one of the two
 * is not there. */
export function plageDeCodes(codes: string[], depuis: string, jusqua: string): string[] {
  const a = codes.indexOf(depuis);
  const b = codes.indexOf(jusqua);
  if (a < 0 || b < 0) return [];
  return codes.slice(Math.min(a, b), Math.max(a, b) + 1);
}
