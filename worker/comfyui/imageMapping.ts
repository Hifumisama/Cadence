import { ASPECTS_COMFYUI, type Aspect } from "../../lib/asset-generation";

/**
 * Nœuds du graphe IMG_01_TextToImage.json (format API, Krea 2 Turbo). Le
 * contrat est documenté dans workflows/README.md ; imageMapping.test.ts vérifie
 * qu'ils existent bien dans le fichier du dépôt (le workflow et ce code vivent
 * dans le même commit).
 */
export const NODE_IDS_TEXTE_VERS_IMAGE = {
  prompt: "59", // PrimitiveStringMultiline : le sujet, sans style
  style: "60", // PrimitiveStringMultiline : la clause de style du projet
  format: "49", // ResolutionSelector : aspect_ratio + megapixels
  seed: "30:3", // KSampler
  lora: "30:23", // PrimitiveBoolean : LoRA « CharacterDesign » (fiche personnage)
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
  loraPersonnage: boolean;
  /** Préfixe des fichiers de sortie côté ComfyUI. */
  prefixeSortie: string;
};

/** Injecte les valeurs de la génération dans le graphe. Un nœud absent est une
 * erreur franche : un workflow ré-exporté qui change d'ids doit casser ici, pas
 * générer une image sans prompt. */
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
  noeud(ids.lora).inputs.value = entree.loraPersonnage;
  noeud(ids.sortie).inputs.filename_prefix = entree.prefixeSortie;
  return graphe;
}
