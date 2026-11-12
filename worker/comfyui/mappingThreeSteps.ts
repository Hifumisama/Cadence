import { MEGAPIXELS_VIDEO } from "../../lib/renders/video-steps";
import { injecterReferences, verifierEntree, type WorkflowJson } from "./mapping";
import type { SubmissionInput } from "./types";

/**
 * Mapping of the three-step video (workflows/video-generation/VID_Generation.json, VID_UPSCALE.json, VID_Finition.json; contract in
 * workflows/README.md; plan in docs/PLAN_INTEGRATION_WORKER.md). Will replace mapping.ts (VID_REF2VA.json) at the switch-over.
 *
 * The three steps share a latent folder specific to the render: `h3_latents/<dossier>/gen/clip_00001` (first pass) and `…/up/clip_00001`
 * (upscaled). Generation and upscale receive the SAME input (prompt, duration, references): the upscale redoes the model's conditioning.
 */

export { MEGAPIXELS_VIDEO };

/** The input nodes that generation and upscale have in common (same ids in both files). */
const NOEUDS_ENTREE = {
  prompt: "22:11",
  resolution: "22:9",
  dureeVideo: "22:23",
  nombreImages: "22:24",
  refNode: "5",
} as const;

export const NODE_IDS_GENERATION = {
  ...NOEUDS_ENTREE,
  seed: "16",
  /** Draft 0.4 MP (VHS_VideoCombine): the file the worker retrieves. */
  apercu: "18",
  /** Saves the first-pass latent (no readable file in /history). */
  latentSauve: "302",
} as const;

/** The « suite » (sequel) generation (VID_Generation_suite.json) adds the loading of the first-pass latent of the previous clip (Motion Context). */
export const NODE_IDS_GENERATION_SUITE = {
  ...NODE_IDS_GENERATION,
  /** Context latent loader (`stock_format: false`: this is the Motion Context format, not the standard format). */
  latentContexte: "301",
} as const;

export const NODE_IDS_UPSCALE = {
  ...NOEUDS_ENTREE,
  seed: "103",
  latentCharge: "310",
  latentSauve: "303",
} as const;

export const NODE_IDS_FINITION = {
  /** First-pass latent: the audio comes from it (the upscale pass regenerates and speeds up the audio). */
  latentAudio: "310",
  /** Upscaled latent: the image comes from it. */
  latentImage: "320",
  sortie: "34",
} as const;

/** The latent folder of a render (unique per clip and per render, never reused: `h3_latents/<dossier>/…` on the ComfyUI side). */
export const dossierLatents = (planId: number, numeroRendu: number, tentative = 1): string =>
  `cadence_p${planId}_r${numeroRendu}${tentative > 1 ? `_t${tentative}` : ""}`;

/** The latent paths of a folder: the save prefix (the node adds `_00001`) and the folder the loader reads back with `clip_index` 1. */
export const cheminsLatents = (dossier: string) => ({
  genDossier: `h3_latents/${dossier}/gen`,
  genPrefixe: `h3_latents/${dossier}/gen/clip`,
  upDossier: `h3_latents/${dossier}/up`,
  upPrefixe: `h3_latents/${dossier}/up/clip`,
});

function noeud(graphe: WorkflowJson, id: string, role: string) {
  const n = graphe[id];
  if (!n) throw new Error(`Nœud ${id} (${role}) absent du workflow vidéo : le contrat de workflows/README.md n'est plus celui du fichier`);
  return n;
}

/** The prompt, duration, resolution (0.4 MP) and references: identical for generation and upscale. */
function injecterEntree(graphe: WorkflowJson, input: SubmissionInput, ids: typeof NOEUDS_ENTREE): void {
  verifierEntree({ ...input, megapixels: undefined });
  noeud(graphe, ids.dureeVideo, "durée").inputs.value = input.dureeSecondes;
  noeud(graphe, ids.resolution, "résolution").inputs.megapixels = MEGAPIXELS_VIDEO;
  noeud(graphe, ids.prompt, "prompt").inputs.value = input.promptAssemble;
  injecterReferences(graphe, input, ids.refNode);
}

const numeroSeed = (seed: string | undefined): number | null => (seed ? Number(seed) : null);

/** Step 1: preview (draft + first-pass latent). `dossierContexte`: the latent folder of the previous clip, for the
 * « suite » variant (VID_Generation_suite.json), whose draft is already trimmed of the context prefix. */
export function injecterGeneration(workflow: WorkflowJson, input: SubmissionInput, dossier: string, dossierContexte?: string): WorkflowJson {
  const graphe = structuredClone(workflow);
  if (dossierContexte) {
    const contexte = noeud(graphe, NODE_IDS_GENERATION_SUITE.latentContexte, "latent de contexte (Motion Context)").inputs;
    contexte.latent_path = cheminsLatents(dossierContexte).genDossier;
    contexte.clip_index = 1;
  }
  injecterEntree(graphe, input, NODE_IDS_GENERATION);
  const seed = numeroSeed(input.seed);
  if (seed != null) noeud(graphe, NODE_IDS_GENERATION.seed, "seed").inputs.seed = seed;
  const latent = noeud(graphe, NODE_IDS_GENERATION.latentSauve, "sauvegarde du latent").inputs;
  latent.filename_prefix = cheminsLatents(dossier).genPrefixe;
  latent.clip_index = 1;
  if (input.prefixeSortie) noeud(graphe, NODE_IDS_GENERATION.apercu, "brouillon").inputs.filename_prefix = input.prefixeSortie;
  return graphe;
}

/** Step 2: ×1.5 upscale of the first-pass latent stored under `dossierSource`; the upscaled latent is saved under `dossierSortie` (that of the
 * final render: a final render that starts from a preview never rewrites its folders). */
export function injecterUpscale(workflow: WorkflowJson, input: SubmissionInput, dossierSource: string, dossierSortie: string = dossierSource): WorkflowJson {
  const graphe = structuredClone(workflow);
  injecterEntree(graphe, input, NODE_IDS_UPSCALE);
  const seed = numeroSeed(input.seed);
  if (seed != null) noeud(graphe, NODE_IDS_UPSCALE.seed, "seed de l'upscale").inputs.seed = seed;
  const charge = noeud(graphe, NODE_IDS_UPSCALE.latentCharge, "chargement du latent").inputs;
  charge.latent_path = cheminsLatents(dossierSource).genDossier;
  charge.clip_index = 1;
  const sauve = noeud(graphe, NODE_IDS_UPSCALE.latentSauve, "sauvegarde du latent upscalé").inputs;
  sauve.filename_prefix = cheminsLatents(dossierSortie).upPrefixe;
  sauve.clip_index = 1;
  return graphe;
}

/** Step 3: finishing (RIFE, RTX 1080p): the image of the upscaled latent (stored under `dossierUp`), the audio of the first-pass latent (under `dossierGen`). */
export function injecterFinition(workflow: WorkflowJson, dossierGen: string, dossierUp: string, prefixeSortie?: string): WorkflowJson {
  const graphe = structuredClone(workflow);
  noeud(graphe, NODE_IDS_FINITION.latentAudio, "latent de l'audio").inputs.latent_path = cheminsLatents(dossierGen).genDossier;
  noeud(graphe, NODE_IDS_FINITION.latentImage, "latent de l'image").inputs.latent_path = cheminsLatents(dossierUp).upDossier;
  if (prefixeSortie) noeud(graphe, NODE_IDS_FINITION.sortie, "sortie finale").inputs.filename_prefix = prefixeSortie;
  return graphe;
}
