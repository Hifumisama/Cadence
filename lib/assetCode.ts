/** Le type d'un asset détermine son préfixe de code (CHAR_, DEC_...) — voir
 * docs/REGISTRE_ASSETS.md, la convention existe depuis avant l'interface.
 * L'utilisateur ne saisit que le suffixe (ex. "maya"), le préfixe et
 * l'assemblage sont automatiques (retour utilisateur 2026-09-28 : pas de
 * raison de redemander en texte libre ce que le type dit déjà). */
export const TYPES_ASSET = ["personnage", "decor", "prop", "vfx", "sfx", "keyframe", "oth"] as const;

export type TypeAsset = (typeof TYPES_ASSET)[number];

/** Types proposés à « Nouveau sujet » (une voix n'est plus un asset : c'est un champ du personnage, chantier voix/master 2026-10-14). */
export const TYPES_CREABLES = TYPES_ASSET;

export const PREFIXE_PAR_TYPE: Record<TypeAsset, string> = {
  personnage: "CHAR_",
  decor: "DEC_",
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

/** Le nom à afficher d'un asset : son `label` s'il en a un, sinon son code rendu lisible (« CHAR_maya_la_danseuse » → « Maya la danseuse »). */
export function libelleAsset(a: { code: string; label?: string | null }): string {
  const label = a.label?.trim();
  if (label) return label;
  const lisible = a.code.replace(/^[A-Z]+_/, "").replace(/_/g, " ").trim();
  return lisible ? lisible.charAt(0).toUpperCase() + lisible.slice(1) : a.code;
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

/** Les sons se fabriquent par la génération audio : la méthode d'image (génération / édition) n'a pas de sens pour eux. */
export function methodeApplicable(type: string): boolean {
  return type !== "sfx";
}
