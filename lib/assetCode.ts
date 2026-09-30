/** Le type d'un asset détermine son préfixe de code (CHAR_, DEC_...) — voir
 * docs/REGISTRE_ASSETS.md, la convention existe depuis avant l'interface.
 * L'utilisateur ne saisit que le suffixe (ex. "maya"), le préfixe et
 * l'assemblage sont automatiques (retour utilisateur 2026-09-28 : pas de
 * raison de redemander en texte libre ce que le type dit déjà). */
export const TYPES_ASSET = ["personnage", "decor", "voix", "prop", "vfx", "sfx", "keyframe", "oth"] as const;

export type TypeAsset = (typeof TYPES_ASSET)[number];

/** Types proposés à « Nouveau sujet » : une voix se crée au casting vocal
 * (instruction, texte de référence…), jamais en coquille vide depuis le
 * registre — elle y reste listée en lecture. */
export const TYPES_CREABLES = TYPES_ASSET.filter((t) => t !== "voix");

export const PREFIXE_PAR_TYPE: Record<TypeAsset, string> = {
  personnage: "CHAR_",
  decor: "DEC_",
  voix: "VOICE_",
  prop: "PROP_",
  vfx: "VFX_",
  sfx: "SFX_",
  keyframe: "KEY_",
  oth: "OTH_",
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

/** Méthode de fabrication d'une image d'asset. `edition` exige un parent (son
 * image est la source) ; `generation` n'en a pas besoin, même pour un dérivé
 * (des flammes rattachées à un personnage se génèrent de zéro). */
export const METHODES_ASSET = ["generation", "edition"] as const;
export type MethodeAsset = (typeof METHODES_ASSET)[number];

export const LIBELLE_METHODE: Record<MethodeAsset, string> = {
  generation: "Génération (Krea 2)",
  edition: "Édition (Qwen Image Edit)",
};

export function estMethodeAsset(v: string): v is MethodeAsset {
  return (METHODES_ASSET as readonly string[]).includes(v);
}

/** Les voix se fabriquent au casting vocal : la méthode d'image n'a pas de sens. */
export function methodeApplicable(type: string): boolean {
  return type !== "voix";
}
