
/** Un code d'asset mal recopié par le modèle (`DEC_le_monde_l_avatar` pour `DEC_le_monde_de_l_avatar`) bloquait une fiche entière
 * (marqueur `[[CODE]]` impossible à résoudre). Quand un code inconnu ne diffère d'UN SEUL code du registre que par des mots
 * de liaison (de, du, la, le, l', un…), le code corrige : le même asset, sans ambiguïté. Tout autre écart (un nom différent,
 * deux candidats) reste une erreur franche, jamais devinée. Pur, testé. */

const LIAISON = new Set(["de", "du", "des", "la", "le", "les", "l", "d", "un", "une", "et", "au", "aux"]);

/** La « clé » d'un code : minuscules, sans accents, mots de liaison retirés (le préfixe de type est gardé). */
export function cleDeCode(code: string): string {
  const [prefixe, ...reste] = code
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  return [prefixe ?? "", ...reste.filter((m) => !LIAISON.has(m))].join("_");
}

/** Pour chaque code inconnu du registre, le code du registre qui lui correspond sans ambiguïté (clé identique), sinon rien. */
export function correspondances(codesCites: string[], registre: string[]): Map<string, string> {
  const connus = new Set(registre);
  const parCle = new Map<string, string[]>();
  for (const c of registre) parCle.set(cleDeCode(c), [...(parCle.get(cleDeCode(c)) ?? []), c]);
  const sortie = new Map<string, string>();
  for (const c of new Set(codesCites)) {
    if (connus.has(c)) continue;
    const candidats = parCle.get(cleDeCode(c)) ?? [];
    if (candidats.length === 1) sortie.set(c, candidats[0]!);
  }
  return sortie;
}
