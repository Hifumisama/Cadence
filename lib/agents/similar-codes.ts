
/** A mis-copied asset code from the model (`DEC_le_monde_l_avatar` for `DEC_le_monde_de_l_avatar`) used to block an entire sheet
 * (an unresolvable `[[CODE]]` marker). When an unknown code differs from ONE SINGLE registry code only by linking
 * words (de, du, la, le, l', un…), the code is corrected: the same asset, without ambiguity. Any other gap (a different name,
 * two candidates) remains a clear error, never guessed. Pure, tested. */

const LIAISON = new Set(["de", "du", "des", "la", "le", "les", "l", "d", "un", "une", "et", "au", "aux"]);

/** A code's "key": lowercase, without accents, linking words removed (the type prefix is kept). */
export function cleDeCode(code: string): string {
  const [prefixe, ...reste] = code
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  return [prefixe ?? "", ...reste.filter((m) => !LIAISON.has(m))].join("_");
}

/** For each code unknown to the registry, the registry code that matches it without ambiguity (identical key), otherwise nothing. */
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
