/** The type of an asset determines its code prefix (CHAR_, DEC_...) — see
 * docs/REGISTRE_ASSETS.md, the convention exists since before the interface.
 * The user only enters the suffix (e.g. "maya"), the prefix and
 * the assembly are automatic (user feedback 2026-09-28: no
 * reason to ask again in free text what the type already says). */
export const TYPES_ASSET = ["personnage", "decor", "prop", "vfx", "keyframe", "oth"] as const;

export type TypeAsset = (typeof TYPES_ASSET)[number];

export const PREFIXE_PAR_TYPE: Record<TypeAsset, string> = {
  personnage: "CHAR_",
  decor: "DEC_",
  prop: "PROP_",
  vfx: "VFX_",
  keyframe: "KEY_",
  oth: "OTH_",
};

/** snake_case without accents nor punctuation — "Halo Doré" -> "halo_dore". */
export function slugifyCode(texte: string): string {
  return texte
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

/** The name to display for an asset: its `label` if it has one, otherwise its code made readable (« CHAR_maya_la_danseuse » → « Maya la danseuse »). */
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

/** Method of making an asset image. `edition` requires a parent (its
 * image is the source); `generation` does not need one, even for a derivative
 * (flames attached to a character are generated from scratch). */
const METHODES_ASSET = ["generation", "edition"] as const;
export type MethodeAsset = (typeof METHODES_ASSET)[number];

export function estMethodeAsset(v: string): v is MethodeAsset {
  return (METHODES_ASSET as readonly string[]).includes(v);
}

/** Extensions accepted for an uploaded asset file (the form restricts to image/audio/video, but the upload action is a public endpoint). */
const EXTENSIONS_ASSET = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif", ".avif", ".mp3", ".wav", ".flac", ".ogg", ".m4a", ".mp4", ".webm", ".mov"]);

/** The file name of an asset on disk: `<projectId>/<code><extension>` (one folder per project: two projects may use the same code). The code must be
 * a plain identifier (it names a file, never a path) and the extension must be a known media one. Throws a user-readable message otherwise. Pure. */
export function nomFichierAsset(projectId: number, code: string, nomOrigine: string): string {
  if (!Number.isInteger(projectId) || projectId < 1) throw new Error("Projet invalide.");
  if (!/^[A-Za-z0-9_]+$/.test(code)) throw new Error("Code d'asset invalide.");
  const point = nomOrigine.lastIndexOf(".");
  const ext = point >= 0 ? nomOrigine.slice(point).toLowerCase() : "";
  if (!EXTENSIONS_ASSET.has(ext)) throw new Error("Format de fichier non pris en charge (image, audio ou vidéo).");
  return `${projectId}/${code}${ext}`;
}
