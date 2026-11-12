import { NODE_IDS } from "./mapping";

/**
 * Voice master of a character (2026-10-14): a VARIANT of the H3 video graph (same inputs: prompt, seed, duration, character image
 * injected by `injecterValeurs`; the reference nodes are recreated at each submission, those of the file remain orphans), without a reference
 * audio, which passes the voice through « Noise or Vocal Removal » then « Voice Fixer ». The repository file is
 * `workflows/audio/VID_Create_Voice_Master.json` (path overridable: COMFYUI_WORKFLOW_MASTER_PATH).
 *
 * Outputs: the cleaned voice is saved by `sortieAudio` (SaveAudioAdvanced, flac); the test video (cleaned voice included) comes out of
 * node `sortieVideo` (VHS_VideoCombine), with `save_output: false` in the file: the worker forces it to true. Without the file, falls back to
 * VID_REF2VA (final video « 34 », voice extracted by ffmpeg, not cleaned).
 */
export const NODE_IDS_MASTER = {
  sortieAudio: "313",
  sortieVideo: "18",
  /** The final video of VID_REF2VA, as a fallback. */
  sortieRepli: NODE_IDS.sortieFinale,
} as const;
