

/** An attempt launched from the sheet first waits for its French instruction to be translated into a prompt (LLM task, skill `prompt-asset`):
 * it only enters the image queue afterwards. */
export const STATUT_TRADUCTION = "traduction";

/** Offered formats, associated with the exact strings of the `ResolutionSelector` node
 * of ComfyUI (list taken from comfy_extras/nodes_resolution.py). */
export const ASPECTS_COMFYUI = {
  "1:1": "1:1 (Square)",
  "2:3": "2:3 (Portrait Photo)",
  "3:2": "3:2 (Photo)",
  "3:4": "3:4 (Portrait Standard)",
  "4:3": "4:3 (Standard)",
  "9:16": "9:16 (Portrait Widescreen)",
  "16:9": "16:9 (Widescreen)",
  "21:9": "21:9 (Ultrawide)",
} as const;
export type Aspect = keyof typeof ASPECTS_COMFYUI;

export const ASPECTS = Object.keys(ASPECTS_COMFYUI) as Aspect[];

export function estAspect(v: string): v is Aspect {
  return v in ASPECTS_COMFYUI;
}

/** Two modes (variant B of the mockup), one model (MiniMax H3 Image): « texte » = text-to-image
 * (IMG_01_TextToImage); « images » = IMG_Simple_Edit with 1 to MAX_IMAGES_EDITION source images,
 * the first being the modified target. A single image = modification, several = merging of references. */
const MODES_GENERATION = ["texte", "images"] as const;
type ModeGeneration = (typeof MODES_GENERATION)[number];
/** Source images of an edit, the target included (H3 Image accepts more; 6 like the references of a video clip). */
export const MAX_IMAGES_EDITION = 6;

/** A source image of a generation in « images » mode, in order:
 * - `asset`: the current image of a registry asset;
 * - `import`: a file dropped on the fly into the popup (disposable, stored under
 *   generations/<assetId>/sources/, never attached to the registry). */
type SourceGeneration =
  | { origine: "asset"; assetId: number }
  | { origine: "import"; fichier: string };

/** What the popup sends to `lancerGeneration` (app/assets/generation-actions.ts).
 * The prompt is a snapshot specific to this request: it only becomes the asset's
 * own if the candidate is adopted (adopterGeneration). The format and the
 * megapixels only concern the « texte » mode (in « images » mode the output
 * follows image 1, except for a poster: 2:3). The megapixels are the size of the
 * SAVED image: the model draws at 16 MP and the graph scales the result down. */
export type DemandeGeneration = {
  mode: ModeGeneration;
  prompt: string;
  aspect: Aspect;
  megapixels: number;
  sources: SourceGeneration[];
};

/** The method of an attempt launched from the sheet: **without a base image, a generation** (we create the image); **with a base
 * image, an edit** (we retouch it). For a result quite different, we duplicate the asset or remove its image: we do not deface the current image. */
export const methodeDEssai = (aDesImages: boolean): "generation" | "edition" => (aDesImages ? "edition" : "generation");

/** How many attached images (in addition to the base, if there is one) an attempt can carry: MAX_IMAGES_EDITION in all.
 * Create from attached images: the 1st « carries » the modifications of the others. Retouch: the base image counts as one. */
export const maxImagesJointes = (aUneBase: boolean): number => (aUneBase ? MAX_IMAGES_EDITION - 1 : MAX_IMAGES_EDITION);

/** Why an instruction cannot go, or null. Without a base image it may be empty (the agent then writes the prompt from the
 * asset's description); without a description either, there is nothing to draw. A retouch requires an instruction. */
export function raisonConsigneInvalide(consigne: string, aUneBase: boolean, description: string | null): string | null {
  if (consigne.trim().length > 2000) return "Consigne trop longue (2 000 caractères au plus).";
  if (consigne.trim()) return null;
  if (aUneBase) return "Dis ce que tu veux changer sur l'image.";
  if (!(description ?? "").trim()) return "Décris l'image que tu veux (ou remplis la description de l'asset).";
  return null;
}

/** Number of candidates kept per asset: the oldest are purged. */
export const CANDIDATS_GARDES = 8;

/** Format offered by type: sets and plates follow the film's ratio
 * (16:9, ~1536×864), identity and details stay square (1024×1024),
 * as in the registry. */
export function formatParDefaut(type: string): { aspect: Aspect; megapixels: number } {
  // A presentation poster is a 2:3 portrait (like the cards), lib/posters/posters.ts.
  if (type === "affiche") return { aspect: "2:3", megapixels: 1.3 };
  // Character and set in 16:9 by default (recipe feedback, 2026-10-05): best results in this ratio, and it is
  // the format of video clips. Adjustable by hand by regenerating the image.
  if (type === "decor" || type === "personnage") return { aspect: "16:9", megapixels: 1.3 };
  return { aspect: "1:1", megapixels: 1 };
}

const MEGAPIXELS_MIN = 0.3;
const MEGAPIXELS_MAX = 4;

/** Validation of the structure of a request (without database nor disk: the existence
 * of the sources is checked on the action side). Returns the message to display, or null. */
export function raisonDemandeInvalide(d: DemandeGeneration): string | null {
  if (!d.prompt?.trim()) return "Écris le prompt de la génération.";
  if (!(MODES_GENERATION as readonly string[]).includes(d.mode)) return "Mode de génération inconnu.";

  if (d.mode === "texte") {
    if (!estAspect(d.aspect)) return "Format inconnu.";
    if (!Number.isFinite(d.megapixels) || d.megapixels < MEGAPIXELS_MIN || d.megapixels > MEGAPIXELS_MAX) {
      return "Mégapixels hors limites (0,3 à 4).";
    }
    return null;
  }

  if (!Array.isArray(d.sources) || d.sources.length === 0) {
    return "Ajoute au moins une image : la première est celle qui sera modifiée.";
  }
  if (d.sources.length > MAX_IMAGES_EDITION) return `${MAX_IMAGES_EDITION} images au maximum.`;
  const vues = new Set<string>();
  for (const src of d.sources) {
    const cle = src.origine === "asset" ? `asset:${src.assetId}` : src.origine === "import" ? `import:${src.fichier}` : "";
    if (!cle) return "Source d'image inconnue.";
    if (vues.has(cle)) return "La même image ne peut pas servir deux fois.";
    vues.add(cle);
  }
  return null;
}

/** Name of a source once sent to ComfyUI (shared input folder): unique
 * per generation and per rank, so as never to overwrite another task's image. */
export function nomSourceDistante(genUuid: string, rang: number, ext: string): string {
  return `cadence_${genUuid}_${rang}${ext}`;
}

/** Random seed (integer < 2^48, safe as a JS number), stored as text like
 * `plans.seed`. */
export function nouvelleSeed(): string {
  return String(Math.floor(Math.random() * 2 ** 48));
}
