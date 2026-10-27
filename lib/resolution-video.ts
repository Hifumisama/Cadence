/** Résolution d'un rendu vidéo (décision du 2026-10-27) : l'utilisateur choisit 0,2, 0,3 ou 0,4 mégapixel pour le plan (nœud `22:9` du workflow).
 *
 * Deux régimes, selon la résolution :
 * - **0,2 MP** (défaut) : le parcours d'avant. Prévisualisation basse résolution, puis rendu final avec upscale (le « latent upscaler » de H3 redessine
 *   dans l'espace latent : ×2 par côté, soit 0,8 MP).
 * - **Au-delà (0,3 et 0,4)** : le rendu est directement le rendu FINAL, natif, sans upscale (un upscale depuis 0,4 MP, soit 1,6 MP, ne tient pas sur la
 *   carte). Il n'y a donc pas de prévisualisation à ces résolutions : le job est créé « final » (`jobs.activer_upscale` veut dire « rendu final », et
 *   le worker décide s'il y a réellement un upscale).
 *
 * Même seed + même prompt + mêmes références + même durée donnent le même résultat à résolution égale. À résolution différente le geste survit
 * (constaté sur H3, 2026-10-27) mais le rendu n'est pas identique. Pur, testé. */

export const RESOLUTIONS_VIDEO = [0.2, 0.3, 0.4] as const;
export type ResolutionVideo = (typeof RESOLUTIONS_VIDEO)[number];

export const RESOLUTION_PAR_DEFAUT: ResolutionVideo = 0.2;

/** Résolution la plus haute qui accepte l'upscale. */
export const RESOLUTION_UPSCALE_MAX: ResolutionVideo = 0.2;

/** Une valeur lue en base (`real` : 0.20000000298…) ou saisie, ramenée à une résolution connue ; `null` si elle n'en est pas une. */
export function resolutionDepuis(valeur: unknown): ResolutionVideo | null {
  const n = Number(valeur);
  if (!Number.isFinite(n)) return null;
  return RESOLUTIONS_VIDEO.find((r) => Math.abs(r - n) < 0.005) ?? null;
}

/** La résolution d'une ligne de base ; le défaut si elle est illisible (plan ou rendu d'avant la colonne). */
export const resolutionOuDefaut = (valeur: unknown): ResolutionVideo => resolutionDepuis(valeur) ?? RESOLUTION_PAR_DEFAUT;

/** Ce rendu passe-t-il par l'upscale ? Il faut qu'il soit final ET à la résolution de base. */
export const avecUpscale = (final: boolean, resolution: unknown): boolean => final && resolutionOuDefaut(resolution) <= RESOLUTION_UPSCALE_MAX;

/** Un rendu final natif : final, sans upscale (résolution au-dessus de la base). */
export const estFinalNatif = (final: boolean, resolution: unknown): boolean => final && resolutionOuDefaut(resolution) > RESOLUTION_UPSCALE_MAX;

/** Au-delà de la base, tout rendu est un rendu final : pas de prévisualisation (voir l'en-tête). */
export const rendFinal = (finalDemande: boolean, resolution: unknown): boolean => finalDemande || resolutionOuDefaut(resolution) > RESOLUTION_UPSCALE_MAX;

/** « 0,4 MP » */
export const libelleResolution = (resolution: unknown): string => `${String(resolutionOuDefaut(resolution)).replace(".", ",")} MP`;
