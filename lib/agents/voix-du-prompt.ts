import { MAX_AUDIOS } from "./plan-h3-controles";

/** Les répliques ne vivent que dans le PROMPT VIDÉO (décision 2026-10-14) : la voix du plan se lit dans les balises `<d>` des shots, plus
 * dans des répliques liées. Une parole est « `[[CHAR_x]] (S1) says, <d>[Français] …</d>` » : son locuteur est le dernier `[[CODE]]`
 * (ou `(Sx)`) qui précède la balise. Pur, testé. */
export type ParoleDuPrompt = { shot: number; texte: string; numero: string | null; code: string | null };

const LANGUE = /^\s*\[[^\]]*\]\s*/;

/** Les paroles des shots, dans l'ordre. `(Sx)` seul est relié au personnage que le prompt a cité juste avant ce numéro ailleurs. */
export function parolesDuPrompt(shots: { texte: string }[]): ParoleDuPrompt[] {
  const tout = shots.map((s) => s.texte ?? "").join("\n");
  const codeDeNumero = new Map<string, string>();
  for (const m of tout.matchAll(/\[\[\s*([A-Za-z0-9_]+)\s*\]\][^[\]<]{0,160}?\((S\d+)\)/g)) if (!codeDeNumero.has(m[2]!)) codeDeNumero.set(m[2]!, m[1]!);

  const paroles: ParoleDuPrompt[] = [];
  shots.forEach((s, i) => {
    const texte = s.texte ?? "";
    let debut = 0;
    for (const m of texte.matchAll(/<d>([\s\S]*?)<\/d>/gi)) {
      const avant = texte.slice(debut, m.index);
      debut = (m.index ?? 0) + m[0].length;
      const lie = [...avant.matchAll(/\[\[\s*([A-Za-z0-9_]+)\s*\]\]\s*\((S\d+)\)/g)].pop();
      let code = lie?.[1] ?? null;
      let numero = lie?.[2] ?? null;
      if (!code) {
        const seul = [...avant.matchAll(/\((S\d+)\)/g)].pop();
        if (seul) {
          numero = seul[1]!;
          code = codeDeNumero.get(numero) ?? null;
        } else {
          code = [...avant.matchAll(/\[\[\s*([A-Za-z0-9_]+)\s*\]\]/g)].pop()?.[1] ?? null;
        }
      }
      paroles.push({ shot: i + 1, texte: m[1]!.replace(LANGUE, "").trim(), numero, code });
    }
  });
  return paroles;
}

/** Les voix du plan : un `<Audio N>` par personnage QUI PARLE dans le prompt et qui a une voix fixée (`assets.voix_master`), dans l'ordre
 * de parole (la voix prime sur les bruitages ; trois audios au plus). Un personnage sans master n'a pas de référence : le modèle vidéo
 * invente sa voix. `texte` est sa première parole (l'assemblage s'en sert pour retrouver son `(Sx)`). */
export function voixDuPrompt(shots: { texte: string }[], codesAvecMaster: Set<string>): { slot: number; texte: string; locuteurCode: string }[] {
  const vus = new Set<string>();
  const voix: { slot: number; texte: string; locuteurCode: string }[] = [];
  for (const p of parolesDuPrompt(shots)) {
    if (!p.code || !codesAvecMaster.has(p.code) || vus.has(p.code) || !p.texte) continue;
    if (voix.length >= MAX_AUDIOS) break;
    vus.add(p.code);
    voix.push({ slot: voix.length + 1, texte: p.texte, locuteurCode: p.code });
  }
  return voix;
}
