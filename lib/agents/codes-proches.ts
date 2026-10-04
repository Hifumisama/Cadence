import type { SortiePlanH3 } from "./plan-h3-controles";

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

const MARQUEUR = /\[\[\s*([^\]]+?)\s*\]\]/g;

/** La sortie de `plan-h3` avec les codes mal recopiés corrigés (références et marqueurs `[[CODE]]` des textes), et la liste des
 * corrections faites (pour la revue). Une sortie sans code douteux revient telle quelle. */
export function corrigerCodesInconnus(sortie: SortiePlanH3, registre: string[]): { sortie: SortiePlanH3; corrections: { de: string; vers: string }[] } {
  const textes = [sortie.summary, sortie.ouverture, sortie.overall_soundscape, sortie.non_diegetic_music, ...(sortie.shots ?? []).map((s) => s.texte)];
  const cites = [...(sortie.references ?? []).map((r) => r.asset), ...textes.flatMap((t) => [...(t ?? "").matchAll(MARQUEUR)].map((m) => m[1]!))];
  const map = correspondances(cites, registre);
  if (map.size === 0) return { sortie, corrections: [] };
  const remplacer = (t: string) => (t ?? "").replace(MARQUEUR, (tout, code: string) => (map.has(code) ? `[[${map.get(code)}]]` : tout));
  return {
    sortie: {
      ...sortie,
      references: (sortie.references ?? []).map((r) => (map.has(r.asset) ? { ...r, asset: map.get(r.asset)! } : r)),
      summary: remplacer(sortie.summary),
      ouverture: remplacer(sortie.ouverture),
      overall_soundscape: remplacer(sortie.overall_soundscape),
      non_diegetic_music: remplacer(sortie.non_diegetic_music),
      shots: (sortie.shots ?? []).map((s) => ({ ...s, texte: remplacer(s.texte) })),
    },
    corrections: [...map].map(([de, vers]) => ({ de, vers })),
  };
}
