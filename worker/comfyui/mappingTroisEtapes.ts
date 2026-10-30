import { injecterReferences, verifierEntree, type WorkflowJson } from "./mapping";
import type { SubmissionInput } from "./types";

/**
 * Mapping de la vidéo en trois étapes (workflows/video-generation/VID_Generation.json, VID_UPSCALE.json, VID_Finition.json ; contrat dans
 * workflows/README.md ; plan dans docs/PLAN_INTEGRATION_WORKER.md). Remplacera mapping.ts (VID_REF2VA.json) à la bascule.
 *
 * Les trois étapes se partagent un dossier de latents propre au rendu : `h3_latents/<dossier>/gen/clip_00001` (première passe) et `…/up/clip_00001`
 * (upscalé). La génération et l'upscale reçoivent la MÊME entrée (prompt, durée, références) : l'upscale refait le conditioning du modèle.
 */

/** Résolution de la génération : verrouillée à 0,4 MP (décision du 2026-10-29). */
export const MEGAPIXELS_VIDEO = 0.4;

/** Les nœuds de saisie que la génération et l'upscale ont en commun (mêmes ids dans les deux fichiers). */
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
  /** Brouillon 0,4 MP (VHS_VideoCombine) : le fichier que le worker récupère. */
  apercu: "18",
  /** Sauvegarde du latent de la première passe (sans fichier lisible dans /history). */
  latentSauve: "302",
} as const;

export const NODE_IDS_UPSCALE = {
  ...NOEUDS_ENTREE,
  seed: "103",
  latentCharge: "310",
  latentSauve: "303",
} as const;

export const NODE_IDS_FINITION = {
  /** Latent de la première passe : l'audio vient de lui (la passe d'upscale régénère et accélère l'audio). */
  latentAudio: "310",
  /** Latent upscalé : l'image vient de lui. */
  latentImage: "320",
  sortie: "34",
} as const;

/** Le dossier de latents d'un rendu (unique par plan et par rendu, jamais réutilisé : `h3_latents/<dossier>/…` côté ComfyUI). */
export const dossierLatents = (planId: number, numeroRendu: number, tentative = 1): string =>
  `cadence_p${planId}_r${numeroRendu}${tentative > 1 ? `_t${tentative}` : ""}`;

/** Les chemins de latents d'un dossier : le préfixe de sauvegarde (le nœud ajoute `_00001`) et le dossier que le chargeur relit avec `clip_index` 1. */
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

/** Le prompt, la durée, la résolution (0,4 MP) et les références : identiques pour la génération et l'upscale. */
function injecterEntree(graphe: WorkflowJson, input: SubmissionInput, ids: typeof NOEUDS_ENTREE): void {
  verifierEntree({ ...input, megapixels: undefined });
  noeud(graphe, ids.dureeVideo, "durée").inputs.value = input.dureeSecondes;
  noeud(graphe, ids.resolution, "résolution").inputs.megapixels = MEGAPIXELS_VIDEO;
  noeud(graphe, ids.prompt, "prompt").inputs.value = input.promptAssemble;
  injecterReferences(graphe, input, ids.refNode);
}

const numeroSeed = (seed: string | undefined): number | null => (seed ? Number(seed) : null);

/** Étape 1 : prévisualisation (brouillon + latent de la première passe). */
export function injecterGeneration(workflow: WorkflowJson, input: SubmissionInput, dossier: string): WorkflowJson {
  const graphe = structuredClone(workflow);
  injecterEntree(graphe, input, NODE_IDS_GENERATION);
  const seed = numeroSeed(input.seed);
  if (seed != null) noeud(graphe, NODE_IDS_GENERATION.seed, "seed").inputs.seed = seed;
  const latent = noeud(graphe, NODE_IDS_GENERATION.latentSauve, "sauvegarde du latent").inputs;
  latent.filename_prefix = cheminsLatents(dossier).genPrefixe;
  latent.clip_index = 1;
  if (input.prefixeSortie) noeud(graphe, NODE_IDS_GENERATION.apercu, "brouillon").inputs.filename_prefix = input.prefixeSortie;
  return graphe;
}

/** Étape 2 : upscale ×1,5 du latent de la prévisualisation `dossier` ; sauvegarde le latent upscalé sous le même dossier. */
export function injecterUpscale(workflow: WorkflowJson, input: SubmissionInput, dossier: string): WorkflowJson {
  const graphe = structuredClone(workflow);
  injecterEntree(graphe, input, NODE_IDS_UPSCALE);
  const seed = numeroSeed(input.seed);
  if (seed != null) noeud(graphe, NODE_IDS_UPSCALE.seed, "seed de l'upscale").inputs.seed = seed;
  const chemins = cheminsLatents(dossier);
  const charge = noeud(graphe, NODE_IDS_UPSCALE.latentCharge, "chargement du latent").inputs;
  charge.latent_path = chemins.genDossier;
  charge.clip_index = 1;
  const sauve = noeud(graphe, NODE_IDS_UPSCALE.latentSauve, "sauvegarde du latent upscalé").inputs;
  sauve.filename_prefix = chemins.upPrefixe;
  sauve.clip_index = 1;
  return graphe;
}

/** Étape 3 : finition (RIFE, RTX 1080p) : l'image du latent upscalé, l'audio du latent de la première passe. */
export function injecterFinition(workflow: WorkflowJson, dossier: string, prefixeSortie?: string): WorkflowJson {
  const graphe = structuredClone(workflow);
  const chemins = cheminsLatents(dossier);
  noeud(graphe, NODE_IDS_FINITION.latentAudio, "latent de l'audio").inputs.latent_path = chemins.genDossier;
  noeud(graphe, NODE_IDS_FINITION.latentImage, "latent de l'image").inputs.latent_path = chemins.upDossier;
  if (prefixeSortie) noeud(graphe, NODE_IDS_FINITION.sortie, "sortie finale").inputs.filename_prefix = prefixeSortie;
  return graphe;
}
