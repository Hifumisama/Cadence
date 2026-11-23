import { ASPECTS_COMFYUI, MAX_IMAGES_EDITION, type Aspect } from "../../lib/assets/asset-generation";

/**
 * Nodes of the graph IMG_01_TextToImage.json (API format, MiniMax H3 Image). The
 * contract is documented in workflows/README.md; imageMapping.test.ts checks
 * that they exist in the repository file (the workflow and this code live
 * in the same commit). The model draws at 16 MP (fixed in the file: below that the
 * image is not clean) and the graph scales the result down before saving.
 */
export const NODE_IDS_TEXTE_VERS_IMAGE = {
  prompt: "41", // PrimitiveStringMultiline: the subject, without style
  style: "42", // PrimitiveStringMultiline: the project's style clause, concatenated after the subject (node 43)
  format: "14", // ResolutionSelector: aspect_ratio (the megapixels of the drawing stay at 16 in the file)
  taille: "44", // ResizeImageMaskNode « scale total pixels »: the size of the saved image
  seed: "23:7", // KSampler
  sortie: "9", // SaveImage
} as const;

type NodeAPI = { class_type: string; inputs: Record<string, unknown>; _meta?: { title: string } };
export type WorkflowJson = Record<string, NodeAPI>;

export type EntreeTexteVersImage = {
  prompt: string;
  clauseStyle: string;
  aspect: Aspect;
  /** Size of the SAVED image (the drawing itself is made at 16 MP). */
  megapixels: number;
  seed: string;
  /** Prefix of the output files on the ComfyUI side. */
  prefixeSortie: string;
};

/** A node of the graph, or an outright error: a re-exported workflow that changes its ids must break here, not
 * generate an image without a prompt. */
function noeudDe(graphe: WorkflowJson, quoi: string) {
  return (id: string): NodeAPI => {
    const n = graphe[id];
    if (!n) throw new Error(`Nœud ${id} introuvable dans le workflow ${quoi} : le graphe a changé, mettre à jour imageMapping.ts`);
    return n;
  };
}

/** Injects the generation's values into the graph. */
export function injecterGenerationImage(workflow: WorkflowJson, entree: EntreeTexteVersImage): WorkflowJson {
  const graphe = structuredClone(workflow);
  const noeud = noeudDe(graphe, "d'image");
  const ids = NODE_IDS_TEXTE_VERS_IMAGE;

  noeud(ids.prompt).inputs.value = entree.prompt;
  noeud(ids.style).inputs.value = entree.clauseStyle;
  noeud(ids.format).inputs.aspect_ratio = ASPECTS_COMFYUI[entree.aspect];
  noeud(ids.taille).inputs["resize_type.megapixels"] = entree.megapixels;
  noeud(ids.seed).inputs.seed = Number(entree.seed);
  noeud(ids.sortie).inputs.filename_prefix = entree.prefixeSortie;
  return graphe;
}

/**
 * Nodes of the graph IMG_Simple_Edit.json (MiniMax H3 Image, the same model as the generation). Image 1 (the
 * modified target) is the fixed LoadImage, brought to 4 MP (the model's working area) then to a multiple of 32;
 * images 2 to 6 are created at submission, only for the sources provided, with the same chain. The prompt cites
 * them as <Picture 1>, <Picture 2>… By default the output follows image 1 (GetImageSize); a requested format
 * (a 2:3 poster) replaces it with an explicit width and height. The graph scales the result down to 1 MP before saving.
 */
export const NODE_IDS_EDITION = {
  image1: "45", // LoadImage: the target of the modification
  conditionnement: "32", // MiniMaxH3ImageConditioning: width, height, images.image_N
  instructions: "43", // PrimitiveStringMultiline: the instructions
  seed: "38", // KSampler
  sortie: "9", // SaveImage
} as const;

/** The chain of image 1 that the created images copy: total pixels (4 MP), then multiple of 32. */
const CHAINE_IMAGE1 = { pixels: "56", multiple: "48" } as const;

/** Working area of the edit, in megapixels (as in the graph's node 56: the model is tuned for 2048×2048). */
const MEGAPIXELS_EDITION = 4;

export type EntreeEdition = {
  prompt: string;
  /** The project's SHORT style clause (snapshot of the request), "" or absent = no reminder. See `instructionsAvecStyle`. */
  clauseStyle?: string;
  seed: string;
  /** Names of the sources already sent to ComfyUI, in order (1 to 6, the 1st = target). */
  sourcesDistantes: string[];
  /** Explicit output format (a poster), or absent: the output follows image 1. */
  format?: Aspect;
  prefixeSortie: string;
};

/** The edit graph has no style node (unlike text-to-image): the project's style is reminded by a
 * LAST instruction line, added to the agent's instructions without touching them. Nothing is added without a clause,
 * nor when the instructions already contain it. Pure. */
export function instructionsAvecStyle(prompt: string, clauseStyle: string | undefined): string {
  const clause = (clauseStyle ?? "").trim();
  if (!clause || prompt.toLowerCase().includes(clause.toLowerCase())) return prompt;
  return `${prompt.trimEnd()}\nKeep the result in this art style: ${clause}`;
}

/** Width and height of a format at a given area (1 MP = 1024², as ComfyUI counts), rounded to a multiple of 32. Pure. */
export function dimensionsFormat(aspect: Aspect, megapixels: number): { largeur: number; hauteur: number } {
  const [l, h] = aspect.split(":").map(Number) as [number, number];
  const aire = megapixels * 1024 * 1024;
  const largeur = Math.sqrt((aire * l) / h);
  const arrondi = (v: number) => Math.max(32, Math.round(v / 32) * 32);
  return { largeur: arrondi(largeur), hauteur: arrondi((largeur * h) / l) };
}

/** Same rule as `injecterGenerationImage`: a missing node is an outright error. */
export function injecterEditionImages(workflow: WorkflowJson, entree: EntreeEdition): WorkflowJson {
  if (entree.sourcesDistantes.length < 1 || entree.sourcesDistantes.length > MAX_IMAGES_EDITION) {
    throw new Error(`L'édition prend de 1 à ${MAX_IMAGES_EDITION} images sources`);
  }
  const graphe = structuredClone(workflow);
  const noeud = noeudDe(graphe, "d'édition");
  const ids = NODE_IDS_EDITION;
  const cond = noeud(ids.conditionnement);

  noeud(ids.image1).inputs.image = entree.sourcesDistantes[0]!;
  noeud(ids.instructions).inputs.value = instructionsAvecStyle(entree.prompt, entree.clauseStyle);
  noeud(ids.seed).inputs.seed = Number(entree.seed);
  noeud(ids.sortie).inputs.filename_prefix = entree.prefixeSortie;
  if (entree.format) {
    const { largeur, hauteur } = dimensionsFormat(entree.format, MEGAPIXELS_EDITION);
    cond.inputs.width = largeur;
    cond.inputs.height = hauteur;
  }

  // Images 2 to 6: LoadImage → the same two resizes as image 1 → images.image_N of the conditioning.
  const pixels = noeud(CHAINE_IMAGE1.pixels);
  const multiple = noeud(CHAINE_IMAGE1.multiple);
  entree.sourcesDistantes.slice(1).forEach((nom, i) => {
    const rang = i + 2;
    const id = `cadence_source_${rang}`;
    graphe[id] = { class_type: "LoadImage", inputs: { image: nom }, _meta: { title: `Image ${rang} (générée par Cadence)` } };
    graphe[`${id}_pixels`] = {
      class_type: pixels.class_type,
      inputs: { ...structuredClone(pixels.inputs), input: [id, 0] },
      _meta: { title: `Image ${rang} : surface (générée par Cadence)` },
    };
    graphe[`${id}_echelle`] = {
      class_type: multiple.class_type,
      inputs: { ...structuredClone(multiple.inputs), input: [`${id}_pixels`, 0] },
      _meta: { title: `Image ${rang} : multiple de 32 (générée par Cadence)` },
    };
    cond.inputs[`images.image_${rang}`] = [`${id}_echelle`, 0];
  });
  return graphe;
}
