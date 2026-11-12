import brutes from "./clauses.json";

/** Les clauses courtes (vidéo) des styles de la bibliothèque : `clauses.json` (identifiant → clause), écrit une fois pour toutes (relu
 * à la main) : c'est ce fichier qu'on corrige pour changer une clause. Il est séparé de `bibliotheque.json` pour que le tri des styles et la génération des clauses ne s'écrasent pas. */

export const clausesProduites = brutes as Record<string, string>;

const mots = (t: string): string[] => t.trim().split(/\s+/).filter(Boolean);

/** Mots à majuscule qui ne commencent pas une phrase : candidats « nom propre ». */
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
