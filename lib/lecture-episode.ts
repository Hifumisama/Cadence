/** Lecture d'un épisode bout à bout (2026-10-03) : les plans joués l'un derrière l'autre, dans l'ordre de montage, pour
 * juger le tout. Règles PURES (position, durées, enchaînement) ; le lecteur est components/plan/LectureEpisode.tsx.
 * Un plan sans rendu n'interrompt pas la lecture : un carton « pas de rendu » tient sa place pendant sa durée, pour que
 * le rythme de l'épisode reste lisible. */

export type SegmentLu = { uuid: string; position: number; titre: string; dureeSecondes: number; src: string | null };

/** Durée du carton d'un plan sans rendu : sa durée, bornée (un plan de 15 s sans image n'est pas à attendre en entier). */
export const DUREE_CARTON_MAX_SECONDES = 4;

export const dureeCarton = (s: Pick<SegmentLu, "dureeSecondes">): number => Math.max(1, Math.min(DUREE_CARTON_MAX_SECONDES, s.dureeSecondes));

/** Durée d'un segment dans la frise : celle du plan (le carton, lui, est plus court à la lecture). */
export const dureeSegment = (s: Pick<SegmentLu, "dureeSecondes">): number => Math.max(1, s.dureeSecondes);

export function dureeTotale(segments: SegmentLu[]): number {
  return segments.reduce((n, s) => n + dureeSegment(s), 0);
}

/** Largeur (en %) de chaque segment dans la frise, proportionnelle à sa durée ; somme = 100. */
export function largeurs(segments: SegmentLu[]): number[] {
  const total = dureeTotale(segments);
  return total === 0 ? segments.map(() => 0) : segments.map((s) => (dureeSegment(s) / total) * 100);
}

/** Le segment qui suit `index`, ou null à la fin. */
export function suivant(segments: SegmentLu[], index: number): number | null {
  return index + 1 < segments.length ? index + 1 : null;
}

/** Le segment précédent, ou null au début. */
export function precedent(index: number): number | null {
  return index > 0 ? index - 1 : null;
}

/** Combien de plans ont un rendu, sur combien. */
export function couverture(segments: SegmentLu[]): { avecRendu: number; total: number } {
  return { avecRendu: segments.filter((s) => s.src != null).length, total: segments.length };
}

/** 83 → « 01:23 ». */
export function minutes(secondes: number): string {
  const s = Math.max(0, Math.round(secondes));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}
