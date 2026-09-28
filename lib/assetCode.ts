/** Le type d'un asset détermine son préfixe de code (CHAR_, DEC_...) — voir
 * docs/REGISTRE_ASSETS.md, la convention existe depuis avant l'interface.
 * L'utilisateur ne saisit que le suffixe (ex. "maya"), le préfixe et
 * l'assemblage sont automatiques (retour utilisateur 2026-09-28 : pas de
 * raison de redemander en texte libre ce que le type dit déjà). */
export const TYPES_ASSET = ["personnage", "decor", "voix", "prop", "fx", "keyframe", "autre"] as const;

export type TypeAsset = (typeof TYPES_ASSET)[number];

export const PREFIXE_PAR_TYPE: Record<TypeAsset, string> = {
  personnage: "CHAR_",
  decor: "DEC_",
  voix: "VOICE_",
  prop: "PROP_",
  fx: "FX_",
  keyframe: "KEY_",
  autre: "",
};

/** snake_case sans accents ni ponctuation — "Halo Doré" -> "halo_dore". */
export function slugifyCode(texte: string): string {
  return texte
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function construireCode(type: string, suffixe: string): string {
  const prefixe = PREFIXE_PAR_TYPE[type as TypeAsset] ?? "";
  return `${prefixe}${slugifyCode(suffixe)}`;
}
