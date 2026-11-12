/** State of an asset, COMPUTED (decision 2026-10-15): neither the status nor the criticality is entered. Only validation is a
 * decision, stored (`assets.valide`). Pure: tested in `asset-etat.test.ts`. */

export type StatutAsset = "a_produire" | "en_cours" | "valide";

/** « À produire » as long as there is no file; « validé » when it has been said explicitly (or it was imported: one has already
 * taken the trouble to do it elsewhere); « en cours » between the two. An adopted generation sets `valide` back to false. */
export function statutAsset(a: { fichier: string | null; valide: boolean }): StatutAsset {
  if (!a.fichier) return "a_produire";
  return a.valide ? "valide" : "en_cours";
}

/** An asset is critical when it is cited by at least 3 clips of an episode, or by 20% of its clips if that is fewer (a short
 * episode of 10 clips: 2 are enough). The softer criterion wins; there must always be at least one. */
const SEUIL_PLANS_CRITIQUE = 3;
const PART_PLANS_CRITIQUE = 0.2;

export const seuilCritique = (nbPlansEpisode: number): number =>
  Math.min(SEUIL_PLANS_CRITIQUE, Math.max(1, Math.ceil(nbPlansEpisode * PART_PLANS_CRITIQUE)));

/** `parEpisode`: for each episode where the asset is cited, the number of clips that cite it and the number of the episode's clips.
 * Critical as soon as ONE episode passes the threshold (it is the episode that gets made, not the series). */
export const estCritique = (parEpisode: { cites: number; total: number }[]): boolean =>
  parEpisode.some((e) => e.cites > 0 && e.cites >= seuilCritique(e.total));
