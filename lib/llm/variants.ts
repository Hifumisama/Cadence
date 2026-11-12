/** Variante de `prompt-asset` pour l'affiche de présentation d'un projet ou d'un épisode (asset caché de type
 * `affiche`) : mêmes guides d'image que `image`, et la section « A poster » du skill. */
export const VARIANTE_AFFICHE = "affiche";

/** Variante à passer à `executerSkill("prompt-asset", …, { variante })` selon l'asset :
 * un seul guide d'image quand la
 * méthode est déjà fixée (sinon les deux, car le skill recommande la méthode).
 * Pur, sans accès disque : utilisable partout. */
export function variantePromptAsset(asset: { methodeGeneration: string | null }): "generation" | "edition" | "image" {
  if (asset.methodeGeneration === "generation") return "generation";
  if (asset.methodeGeneration === "edition") return "edition";
  return "image";
}
