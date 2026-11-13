/** Language in the sense of the voice engine (Qwen3-TTS, node `Qwen3TTSEngineNode`, field `language`). The engine only accepts ENGLISH NAMES:
 * « Auto », « Chinese », « English », « French », « German », « Italian », « Japanese », « Korean », « Portuguese », « Russian »,
 * « Spanish ». Everything sent to ComfyUI (voice, audio test, line take) goes through `langueMoteurVoix`: ISO code (« fr »,
 * « en-US »), French name (« Français ») or English (« French ») → the English name. An unknown name, or « Sans dialogue », gives « Auto »
 * (the engine detects the language). Pure: importable client-side as well as server-side and worker-side. */

export const LANGUE_AUTO = "Auto";

const LANGUES: [RegExp, string][] = [
  [/fran[cç]ais|french|^fr(?:[-_ ].*)?$/i, "French"],
  [/anglais|english|^en(?:[-_ ].*)?$/i, "English"],
  [/allemand|german|deutsch|^de(?:[-_ ].*)?$/i, "German"],
  [/espagnol|spanish|espa[nñ]ol|^es(?:[-_ ].*)?$/i, "Spanish"],
  [/italien|italian|italiano|^it(?:[-_ ].*)?$/i, "Italian"],
  [/portugais|portuguese|portugu[eê]s|^pt(?:[-_ ].*)?$/i, "Portuguese"],
  [/japonais|japanese|^ja(?:[-_ ].*)?$/i, "Japanese"],
  [/cor[ée]en|korean|^ko(?:[-_ ].*)?$/i, "Korean"],
  [/russe|russian|^ru(?:[-_ ].*)?$/i, "Russian"],
  [/chinois|chinese|mandarin|cantonais|cantonese|^zh(?:[-_ ].*)?$/i, "Chinese"],
];

export function langueMoteurVoix(langue: string | null | undefined): string {
  const texte = (langue ?? "").trim();
  if (!texte) return LANGUE_AUTO;
  return LANGUES.find(([motif]) => motif.test(texte))?.[1] ?? LANGUE_AUTO;
}

