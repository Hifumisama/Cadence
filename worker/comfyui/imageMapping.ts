import { ASPECTS_COMFYUI, type Aspect } from "../../lib/assets/asset-generation";

/**
 * Nodes of the graph IMG_01_TextToImage.json (API format, Krea 2 Turbo). The
 * contract is documented in workflows/README.md; imageMapping.test.ts checks
 * that they exist in the repository file (the workflow and this code live
 * in the same commit).
 */
export const NODE_IDS_TEXTE_VERS_IMAGE = {
  prompt: "59", // PrimitiveStringMultiline: the subject, without style
  style: "60", // PrimitiveStringMultiline: the project's style clause
  format: "49", // ResolutionSelector: aspect_ratio + megapixels
  seed: "30:3", // KSampler
  sortie: "29", // SaveImage
} as const;

type NodeAPI = { class_type: string; inputs: Record<string, unknown>; _meta?: { title: string } };
export type WorkflowJson = Record<string, NodeAPI>;

export type EntreeTexteVersImage = {
  prompt: string;
  clauseStyle: string;
  aspect: Aspect;
  megapixels: number;
  seed: string;
  /** Prefix of the output files on the ComfyUI side. */
  prefixeSortie: string;
};

/** Injects the generation's values into the graph. A missing node is an
 * outright error: a re-exported workflow that changes its ids must break here, not
 * generate an image without a prompt. */
export function injecterGenerationImage(workflow: WorkflowJson, entree: EntreeTexteVersImage): WorkflowJson {
  const graphe = structuredClone(workflow);
  const noeud = (id: string): NodeAPI => {
    const n = graphe[id];
    if (!n) throw new Error(`Nœud ${id} introuvable dans le workflow d'image : le graphe a changé, mettre à jour imageMapping.ts`);
    return n;
  };
  const ids = NODE_IDS_TEXTE_VERS_IMAGE;

  noeud(ids.prompt).inputs.value = entree.prompt;
  noeud(ids.style).inputs.value = entree.clauseStyle;
  noeud(ids.format).inputs.aspect_ratio = ASPECTS_COMFYUI[entree.aspect];
  noeud(ids.format).inputs.megapixels = entree.megapixels;
  noeud(ids.seed).inputs.seed = Number(entree.seed);
  noeud(ids.sortie).inputs.filename_prefix = entree.prefixeSortie;
  return graphe;
}

/**
 * Nodes of the graph IMG_Simple_Edit.json (Qwen Image Edit 2511). Image 1 (the
 * modified target) is the fixed LoadImage; images 2 and 3 are created at
 * submission, only for the sources provided (same principle as the
 * references of the video workflow). The output follows image 1: the graph has no
 * size node (the latent comes from the VAEEncode of the scaled image 1).
 */
export const NODE_IDS_EDITION = {
  image1: "41", // LoadImage: the target of the modification
  encodeurPositif: "170:151", // TextEncodeQwenImageEditPlus: prompt = the instructions
  encodeurNegatif: "170:149", // same, prompt left empty
  seed: "170:169", // KSampler
  lightning: "170:168", // PrimitiveBoolean: true = 4 steps CFG 1, false = 40 steps CFG 4
  sortie: "195", // SaveImageAdvanced
} as const;

export type EntreeEdition = {
  prompt: string;
  /** The project's SHORT style clause (snapshot of the request), "" or absent = no reminder. See `instructionsAvecStyle`. */
  clauseStyle?: string;
  seed: string;
  lightning: boolean;
  /** Names of the sources already sent to ComfyUI, in order (1 to 3, the 1st = target). */
  sourcesDistantes: string[];
  prefixeSortie: string;
};

/** The editing graph has no style node (unlike text-to-image): the project's style is reminded by a
 * LAST instruction line, added to the agent's instructions without touching them (its « Preserve… » lines stay
 * as they are, at the top). Nothing is added without a clause, nor when the instructions already contain it. Pure. */
export function instructionsAvecStyle(prompt: string, clauseStyle: string | undefined): string {
  const clause = (clauseStyle ?? "").trim();
  if (!clause || prompt.toLowerCase().includes(clause.toLowerCase())) return prompt;
  return `${prompt.trimEnd()}\nKeep the result in this art style: ${clause}`;
}

/** Same rule as `injecterGenerationImage`: a missing node is an outright error,
 * not an image generated next to what was requested. */
export function injecterEditionImages(workflow: WorkflowJson, entree: EntreeEdition): WorkflowJson {
  if (entree.sourcesDistantes.length < 1 || entree.sourcesDistantes.length > 3) {
    throw new Error("L'édition prend de 1 à 3 images sources");
  }
  const graphe = structuredClone(workflow);
  const noeud = (id: string): NodeAPI => {
    const n = graphe[id];
    if (!n) throw new Error(`Nœud ${id} introuvable dans le workflow d'édition : le graphe a changé, mettre à jour imageMapping.ts`);
    return n;
  };
  const ids = NODE_IDS_EDITION;

  noeud(ids.image1).inputs.image = entree.sourcesDistantes[0]!;
  noeud(ids.encodeurPositif).inputs.prompt = instructionsAvecStyle(entree.prompt, entree.clauseStyle);
  noeud(ids.encodeurNegatif).inputs.prompt = "";
  noeud(ids.seed).inputs.seed = Number(entree.seed);
  noeud(ids.lightning).inputs.value = entree.lightning;
  noeud(ids.sortie).inputs.filename_prefix = entree.prefixeSortie;

  // Images 2 and 3: LoadImage → FluxKontextImageScale (like image 1), wired
  // to BOTH encoders, otherwise the negative and the positive would not see the
  // same references.
  entree.sourcesDistantes.slice(1).forEach((nom, i) => {
    const rang = i + 2;
    const idCharge = `cadence_source_${rang}`;
    const idEchelle = `cadence_source_${rang}_echelle`;
    graphe[idCharge] = {
      class_type: "LoadImage",
      inputs: { image: nom },
      _meta: { title: `Image ${rang} (générée par Cadence)` },
    };
    graphe[idEchelle] = {
      class_type: "FluxKontextImageScale",
      inputs: { image: [idCharge, 0] },
      _meta: { title: `Échelle image ${rang} (générée par Cadence)` },
    };
    noeud(ids.encodeurPositif).inputs[`image${rang}`] = [idEchelle, 0];
    noeud(ids.encodeurNegatif).inputs[`image${rang}`] = [idEchelle, 0];
  });
  return graphe;
}
