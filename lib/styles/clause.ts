import brutes from "./clauses.json";

/** The short clauses (video) of the library styles: `clauses.json` (identifier → clause), written once and for all (re-read
 * by hand): this is the file you correct to change a clause. It is separate from `bibliotheque.json` so that sorting the styles and generating the clauses do not overwrite each other. */

export const clausesProduites = brutes as Record<string, string>;

const mots = (t: string): string[] => t.trim().split(/\s+/).filter(Boolean);

/** Capitalized words that do not start a sentence: « nom propre » (proper noun) candidates. */
export function motsCapitalisesInternes(texte: string): string[] {
  const trouves: string[] = [];
  for (const segment of texte.split(/[.!?]\s+|\n+/)) {
    const m = mots(segment);
    for (const mot of m.slice(1)) {
      const nu = mot.replace(/^[^\p{L}]+|[^\p{L}'’-]+$/gu, "");
      if (nu.length > 2 && /^\p{Lu}/u.test(nu) && !/^\p{Lu}+$/u.test(nu)) trouves.push(nu);
    }
  }
  return trouves;
}
