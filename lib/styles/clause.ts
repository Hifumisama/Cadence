import brutes from "./clauses.json";

/** Les clauses courtes (vidéo) des styles de la bibliothèque : `clauses.json` (identifiant → clause), écrit une fois pour toutes (relu
 * à la main) : c'est ce fichier qu'on corrige pour changer une clause. Il est séparé de `bibliotheque.json` pour que le tri des styles et la génération des clauses ne s'écrasent pas. */

export const clausesProduites = brutes as Record<string, string>;

export const MOTS_MIN = 15;
export const MOTS_MAX = 40;

/** Mots qui trahissent un sujet, un cadrage ou un mouvement : la clause ne décrit que le rendu. */
const MOTS_INTERDITS = [
  "character", "characters", "person", "people", "man", "men", "woman", "women", "girl", "boy", "face", "faces", "portrait", "portraits", "figure", "figures",
  "body", "eyes", "hair", "pose", "poses", "camera", "shot", "shots", "framing", "close-up", "zoom", "pan", "dolly", "sweeping", "dynamic", "landscape",
  "landscapes", "scene", "scenes", "cinematic",
];

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

/** Contrôle d'une clause produite pour un style : la liste de ses défauts (vide = bonne). Pur, sans modèle. Sert de `controler`
 * à l'exécution du skill (un défaut déclenche un renvoi avec la liste) et de garde avant d'écrire `clauses.json`. */
export function controlerClause(clause: string, style: { nom: string; descriptor: string }): string[] {
  const erreurs: string[] = [];
  const t = clause.trim();
  const n = mots(t).length;
  if (n < MOTS_MIN || n > MOTS_MAX) erreurs.push(`La clause fait ${n} mots : il en faut entre ${MOTS_MIN} et ${MOTS_MAX}.`);
  const phrases = t.split(/[.!?]+(?:\s+|$)/).filter((p) => p.trim()).length;
  if (phrases < 1 || phrases > 2) erreurs.push(`La clause fait ${phrases} phrases : une ou deux.`);
  if (/\n/.test(t)) erreurs.push("La clause tient en un seul paragraphe, sans retour à la ligne.");

  // Noms propres : un mot à majuscule (hors début de phrase) qui figure parmi les noms propres du nom ou du descripteur.
  const proprestableau = new Set([...motsCapitalisesInternes(style.descriptor), ...style.nom.split(/\s+/).map((m) => m.replace(/[^\p{L}'’-]/gu, "")).filter((m) => m.length > 2 && /^\p{Lu}/u.test(m))].map((m) => m.toLowerCase()));
  const propresPresents = motsCapitalisesInternes(t).filter((m) => proprestableau.has(m.toLowerCase()));
  if (propresPresents.length) erreurs.push(`Nom propre dans la clause : ${[...new Set(propresPresents)].join(", ")}. Retire-le : on décrit le rendu, pas un auteur ou un studio.`);

  const bas = ` ${t.toLowerCase().replace(/[^a-z0-9'’-]+/g, " ")} `;
  const interdits = MOTS_INTERDITS.filter((w) => bas.includes(` ${w} `));
  if (interdits.length) erreurs.push(`Mots de sujet, de cadrage ou de mouvement : ${interdits.join(", ")}. La clause ne décrit que le rendu (médium, trait, couleur, lumière, texture).`);
  return erreurs;
}
