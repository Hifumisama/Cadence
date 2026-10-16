/** État d'un asset, CALCULÉ (décision 2026-10-15) : ni le statut ni la criticité ne se saisissent. Seule la validation est une
 * décision, stockée (`assets.valide`). Pur : testé dans `asset-etat.test.ts`. */

export type StatutAsset = "a_produire" | "en_cours" | "valide";

/** « À produire » tant qu'il n'y a pas de fichier ; « validé » quand on l'a dit explicitement (ou qu'on l'a importé : on s'est déjà
 * donné la peine de le faire ailleurs) ; « en cours » entre les deux. Une génération adoptée remet `valide` à faux. */
export function statutAsset(a: { fichier: string | null; valide: boolean }): StatutAsset {
  if (!a.fichier) return "a_produire";
  return a.valide ? "valide" : "en_cours";
}

/** Un asset est critique quand il est cité par au moins 3 plans d'un épisode, ou par 20 % de ses plans si c'est moins (un court
 * épisode de 10 plans : 2 suffisent). Le critère le plus souple l'emporte ; il en faut toujours au moins un. */
export const SEUIL_PLANS_CRITIQUE = 3;
export const PART_PLANS_CRITIQUE = 0.2;

export const seuilCritique = (nbPlansEpisode: number): number =>
  Math.min(SEUIL_PLANS_CRITIQUE, Math.max(1, Math.ceil(nbPlansEpisode * PART_PLANS_CRITIQUE)));

/** `parEpisode` : pour chaque épisode où l'asset est cité, le nombre de plans qui le citent et le nombre de plans de l'épisode.
 * Critique dès qu'UN épisode passe le seuil (c'est l'épisode qui se fabrique, pas la série). */
export const estCritique = (parEpisode: { cites: number; total: number }[]): boolean =>
  parEpisode.some((e) => e.cites > 0 && e.cites >= seuilCritique(e.total));
