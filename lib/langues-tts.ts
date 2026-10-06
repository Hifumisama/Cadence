/** Langue d'une réplique au sens du moteur vocal (Qwen3-TTS : « French », « English »…). Le brief nomme la langue des dialogues en
 * français ou en anglais (« Français », « French », « anglais »…) ; un nom inconnu donne « Auto » (le moteur la détecte). Pur. */

const LANGUES: [RegExp, string][] = [
  [/fran[cç]ais|french/i, "French"],
  [/anglais|english/i, "English"],
  [/allemand|german|deutsch/i, "German"],
  [/espagnol|spanish|espa[nñ]ol/i, "Spanish"],
  [/italien|italian|italiano/i, "Italian"],
  [/portugais|portuguese|portugu[eê]s/i, "Portuguese"],
  [/japonais|japanese/i, "Japanese"],
  [/cor[ée]en|korean/i, "Korean"],
  [/russe|russian/i, "Russian"],
  [/chinois|chinese|mandarin/i, "Chinese"],
];

export function langueMoteurVoix(langueDialogues: string | null | undefined): string {
  const texte = (langueDialogues ?? "").trim();
  if (!texte) return "Auto";
  return LANGUES.find(([motif]) => motif.test(texte))?.[1] ?? "Auto";
}
