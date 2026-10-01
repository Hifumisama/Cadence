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

/**
 * Nœuds du graphe IMG_Simple_Edit.json (Qwen Image Edit 2511). L'image 1 (la
 * cible modifiée) est le LoadImage fixe ; les images 2 et 3 sont créées à la
 * soumission, seulement pour les sources fournies (même principe que les
 * références du workflow vidéo). La sortie suit l'image 1 : le graphe n'a aucun
 * nœud de taille (le latent vient du VAEEncode de l'image 1 mise à l'échelle).
 */
export const NODE_IDS_EDITION = {
  image1: "41", // LoadImage : la cible de la modification
  encodeurPositif: "170:151", // TextEncodeQwenImageEditPlus : prompt = les instructions
  encodeurNegatif: "170:149", // idem, prompt laissé vide
  seed: "170:169", // KSampler
  lightning: "170:168", // PrimitiveBoolean : true = 4 étapes CFG 1, false = 40 étapes CFG 4
  sortie: "195", // SaveImageAdvanced
} as const;

export type EntreeEdition = {
  prompt: string;
  seed: string;
  lightning: boolean;
  /** Noms des sources déjà envoyées à ComfyUI, dans l'ordre (1 à 3, la 1re = cible). */
  sourcesDistantes: string[];
  prefixeSortie: string;
};

/** Même règle que `injecterGenerationImage` : un nœud absent est une erreur
 * franche, pas une image générée à côté de ce qu'on a demandé. */
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
  noeud(ids.encodeurPositif).inputs.prompt = entree.prompt;
  noeud(ids.encodeurNegatif).inputs.prompt = "";
  noeud(ids.seed).inputs.seed = Number(entree.seed);
  noeud(ids.lightning).inputs.value = entree.lightning;
  noeud(ids.sortie).inputs.filename_prefix = entree.prefixeSortie;

  // Images 2 et 3 : LoadImage → FluxKontextImageScale (comme l'image 1), câblées
  // sur les DEUX encodeurs, sinon le négatif et le positif ne verraient pas les
  // mêmes références.
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
