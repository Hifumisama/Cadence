import { NODE_IDS } from "./mapping";

/**
 * Master de voix d'un personnage (2026-10-14) : une VARIANTE du graphe vidéo H3 (mêmes entrées : prompt, seed, durée, image du personnage
 * injectés par `injecterValeurs` ; les nœuds de référence sont recréés à chaque soumission, ceux du fichier restent orphelins), sans audio de
 * référence, qui passe la voix par « Noise or Vocal Removal » puis « Voice Fixer ». Le fichier du dépôt est
 * `workflows/audio/VID_Create_Voice_Master.json` (chemin surchargeable : COMFYUI_WORKFLOW_MASTER_PATH).
 *
 * Sorties : la voix nettoyée est enregistrée par `sortieAudio` (SaveAudioAdvanced, flac) ; la vidéo de test (voix nettoyée incluse) sort du
 * nœud `sortieVideo` (VHS_VideoCombine), à `save_output: false` dans le fichier : le worker le force à true. Sans le fichier, repli sur
 * VID_REF2VA (vidéo finale « 34 », voix extraite par ffmpeg, non nettoyée).
 */
export const NODE_IDS_MASTER = {
  sortieAudio: "313",
  sortieVideo: "18",
  /** La vidéo finale de VID_REF2VA, en repli. */
  sortieRepli: NODE_IDS.sortieFinale,
} as const;
