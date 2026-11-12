/** Variant of `prompt-asset` for a project's or episode's presentation poster (hidden asset of type
 * `affiche`): same image guides as `image`, and the « A poster » section of the skill. */
export const VARIANTE_AFFICHE = "affiche";

/** Variant to pass to `executerSkill("prompt-asset", …, { variante })` depending on the asset:
 * a single image guide when the method is already set (otherwise both, since the skill recommends the method).
 * Pure, no disk access: usable everywhere. */
export function variantePromptAsset(asset: { methodeGeneration: string | null }): "generation" | "edition" | "image" {
  if (asset.methodeGeneration === "generation") return "generation";
  if (asset.methodeGeneration === "edition") return "edition";
  return "image";
}
