/** Langue au sens du moteur vocal (Qwen3-TTS, nœud `Qwen3TTSEngineNode`, champ `language`). Le moteur n'accepte que des NOMS ANGLAIS :
 * « Auto », « Chinese », « English », « French », « German », « Italian », « Japanese », « Korean », « Portuguese », « Russian »,
 * « Spanish ». Tout ce qui est envoyé à ComfyUI (voix, test audio, prise de réplique) passe par `langueMoteurVoix` : code ISO (« fr »,
 * « en-US »), nom français (« Français ») ou anglais (« French ») → le nom anglais. Un nom inconnu, ou « Sans dialogue », donne « Auto »
 * (le moteur détecte la langue). Pur : importable côté client comme côté serveur et worker. */

/** Les langues du moteur, dans l'ordre d'affichage : valeur envoyée (anglais) et libellé français pour l'interface. */
export const LANGUES_MOTEUR = [
  { valeur: "French", libelle: "Français" },
  { valeur: "English", libelle: "Anglais" },
  { valeur: "German", libelle: "Allemand" },
  { valeur: "Spanish", libelle: "Espagnol" },
  { valeur: "Italian", libelle: "Italien" },
  { valeur: "Portuguese", libelle: "Portugais" },
  { valeur: "Japanese", libelle: "Japonais" },
  { valeur: "Korean", libelle: "Coréen" },
  { valeur: "Russian", libelle: "Russe" },
  { valeur: "Chinese", libelle: "Chinois" },
] as const;

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

/** La langue d'une FICHE de voix, telle qu'on la stocke et l'affiche : le nom anglais du moteur. Vide : « French » (langue par défaut du
 * projet) ; inconnue : « Auto ». Une ancienne valeur saisie à la main (« Français ») est ainsi remise au bon nom à la lecture. */
export function langueFicheVoix(langue: string | null | undefined): string {
  return (langue ?? "").trim() ? langueMoteurVoix(langue) : "French";
}

/** Le libellé français d'une langue du moteur (« French » → « Français »), pour l'interface ; « Auto » reste « Auto ». */
export function libelleLangueMoteur(valeur: string): string {
  return LANGUES_MOTEUR.find((l) => l.valeur === valeur)?.libelle ?? valeur;
}
