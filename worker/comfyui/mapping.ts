import { basename } from "node:path";
import { DUREE_GENERATION_MAX, DUREE_GENERATION_MIN } from "../../lib/clips/clip-checks";
import { RESOLUTIONS_VIDEO, avecUpscale, estFinalNatif, resolutionDepuis } from "../../lib/renders/resolution-video";
import type { SubmissionInput } from "./types";

/**
 * Mapping of the FIXED node IDs of the VID_REF2VA graph (API format, re-
 * exported on 2026-09-26). The reference nodes (LoadImageCrop /
 * LoadAudioUI / LoadVideoUI) are NOT in this list: they are created
 * dynamically at each submission (see injecterValeurs) — decision made
 * with the user on 2026-09-26 to avoid any render drift caused by
 * a reference image not wanted but still supplied to the model.
 *
 * - assembled prompt      -> node "22:11" (PrimitiveStringMultiline, in subgraph 22 flattened)
 * - seed 1st pass         -> node "16"    (easy seed)
 * - seed upscale          -> node "103"   (easy seed)
 * - seed 2nd pass         -> node "135:27" (RandomNoise, field noise_seed)
 * - reference node        -> "5" (MiniMaxH3ReferenceToVideo) — receives the dynamic links
 * - clip duration         -> "22:23" (PrimitiveFloat, seconds) -> "22:24" (ComfyMathExpression:
 *                            frame count 17k+5) -> field `length` of node "5"
 * - final output          -> "34" (VHS_VideoCombine, "Final Video")
 * - low-res branch        -> "176" (VAEDecode) / "177" (VAEDecodeAudio) — same source as the preview (node 18)
 * - upscale branch        -> "165" (RIFEInterpolation) / "261" (Any Switch, "Final Audio")
 */
export const NODE_IDS = {
  prompt: "22:11",
  /** « Resolution Selector (Size) »: 16:9 format and megapixels of the render. */
  resolution: "22:9",
  seedPremierPass: "16",
  seedUpscale: "103",
  seedSecondPass: "135:27",
  refNode: "5",
  /** « Video Length (seconds) »: the clip's duration, in seconds (float). */
  dureeVideo: "22:23",
  /** Expression that derives the frame count from it (24 fps, form 17k+5). */
  nombreImages: "22:24",
  sortieFinale: "34",
  /** Low-resolution preview (VHS_VideoCombine, « low_… »). */
  sortieApercu: "18",
  basseResImages: "176",
  basseResAudio: "177",
  upscaleImages: "165",
  upscaleAudio: "261",
} as const;

type NodeAPI = { class_type: string; inputs: Record<string, unknown>; _meta?: { title: string } };
export type WorkflowJson = Record<string, NodeAPI>;

/** The model always generates at 24 fps (tooltip of `length` on node 5: « Frame count at 24 fps »). */
export const FPS_GENERATION = 24;
/** MiniMax H3 limit applied by Cadence: 6 images + videos (the node accepts 9). */
const MAX_REFS_VISUELLES = 6;

/** Input refused BEFORE any submission: retrying would change nothing (the worker does not replay it). */
export class ErreurEntreeInvalide extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ErreurEntreeInvalide";
  }
}

/** Name of the reference file on the ComfyUI side: by default the local file name. The caller can impose
 * a unique name (`nomDistant`): all of ComfyUI's input files share a single folder. */
function nomDistant(ref: { cheminLocal: string; nomDistant?: string }): string {
  return ref.nomDistant ?? basename(ref.cheminLocal);
}

/** Unique, collision-free name for a MEDIA_ROOT file (« assets/CHAR_maya.png » ->
 * « cadence_assets_CHAR_maya.png », « repliques/12/prise.wav » -> « cadence_repliques_12_prise.wav »):
 * never overwrites a user's file in ComfyUI's input folder (the drop is
 * overwritten at each upload) and tells apart two takes with the same name. */
export function nomDistantDepuisChemin(cheminRelatif: string): string {
  return `cadence_${cheminRelatif.replace(/[\\/]+/g, "_")}`;
}

const dansIntervalle = (n: number, min: number, max: number) => Number.isFinite(n) && n >= min && n <= max;

/** Bounds check on what the code injects. Throws `ErreurEntreeInvalide`. */
export function verifierEntree(input: SubmissionInput): void {
  if (!dansIntervalle(input.dureeSecondes, DUREE_GENERATION_MIN, DUREE_GENERATION_MAX)) {
    throw new ErreurEntreeInvalide(
      `Durée de génération ${String(input.dureeSecondes)} s : un plan dure ${DUREE_GENERATION_MIN} à ${DUREE_GENERATION_MAX} s.`,
    );
  }
  if (input.megapixels != null && resolutionDepuis(input.megapixels) == null) {
    throw new ErreurEntreeInvalide(`Résolution ${String(input.megapixels)} MP : ${RESOLUTIONS_VIDEO.join(", ")} seulement.`);
  }
  const visuelles = [...input.refsImage, ...input.refsVideo];
  if (visuelles.length > MAX_REFS_VISUELLES) {
    throw new ErreurEntreeInvalide(`${visuelles.length} références image/vidéo : ${MAX_REFS_VISUELLES} au plus.`);
  }
  const controlerSlots = (nom: string, slots: number[], max: number) => {
    for (const s of slots) {
      if (!Number.isInteger(s) || s < 1 || s > max) throw new ErreurEntreeInvalide(`Emplacement ${nom} ${s} hors de 1 à ${max}.`);
    }
    if (new Set(slots).size !== slots.length) throw new ErreurEntreeInvalide(`Deux références occupent le même emplacement ${nom}.`);
  };
  controlerSlots("image", input.refsImage.map((r) => r.slot), MAX_REFS_VISUELLES);
  controlerSlots("vidéo", input.refsVideo.map((r) => r.slot), 3);
}

/** Wires the final output (node 34) according to the mode: upscale (final at base resolution), native final (above it) or preview. Modifies `graphe` in place;
 * exported so that a measurement bench wires its variants exactly like the worker. */
function cablerSortie(graphe: WorkflowJson, activerUpscale: boolean, megapixels?: number): void {
  // Upscale toggle (F04): we rewire the final output to the same
  // low-resolution branch as the preview (node 18) rather than bypassing
  // a group — the upscale nodes, no longer referenced, are then not
  // executed by ComfyUI (dependency resolution by the requested
  // outputs, no hidden cost).
  const nodeSortie = graphe[NODE_IDS.sortieFinale];
  if (nodeSortie) {
    if (avecUpscale(activerUpscale, megapixels)) {
      nodeSortie.inputs.images = [NODE_IDS.upscaleImages, 0];
      nodeSortie.inputs.audio = [NODE_IDS.upscaleAudio, 0];
    } else if (estFinalNatif(activerUpscale, megapixels)) {
      // Native final render (above 0.2 MP): no upscale, but the same interpolation as the final renders (RIFE, 24 → 48 fps): the
      // node 165 reads the first-pass output instead of the upscale's, the frame rate of node 34 remains that of the switch.
      const rife = graphe[NODE_IDS.upscaleImages];
      if (!rife) throw new Error(`Nœud ${NODE_IDS.upscaleImages} (RIFE) absent du workflow vidéo`);
      rife.inputs.images = [NODE_IDS.basseResImages, 0];
      nodeSortie.inputs.images = [NODE_IDS.upscaleImages, 0];
      nodeSortie.inputs.audio = [NODE_IDS.basseResAudio, 0];
    } else {
      nodeSortie.inputs.images = [NODE_IDS.basseResImages, 0];
      nodeSortie.inputs.audio = [NODE_IDS.basseResAudio, 0];
      // Without RIFE, the frames are still at 24 fps; node 34 reads its frame rate from the switch
      // « Target FPS » (170 -> 48): the preview would play at double speed, out of sync.
      nodeSortie.inputs.frame_rate = FPS_GENERATION;
    }
  }
}

/** Recreates the clip's reference nodes (images, sounds, videos) around the `MiniMaxH3ReferenceToVideo` node, shared by the original mapping and
 * that of the three steps (mappingThreeSteps.ts): a single rule for the slots and the file names. Modifies `graphe` in place. */
export function injecterReferences(graphe: WorkflowJson, input: SubmissionInput, idNoeudRef: string = NODE_IDS.refNode): void {
  const refNode = graphe[idNoeudRef];
  if (refNode) {
    // Starts again from a blank reference node: only the slots actually
    // used by THIS clip will be rewired below.
    for (const cle of Object.keys(refNode.inputs)) {
      if (cle.startsWith("ref_images.") || cle.startsWith("ref_audios.") || cle.startsWith("ref_videos.")) {
        delete refNode.inputs[cle];
      }
    }

    input.refsImage.forEach((ref) => {
      const { slot } = ref;
      const nodeId = `ref_img_${slot}`;
      // Two CORE nodes (no more third-party pack): LoadImage loads the file, ImageScaleToTotalPixels scales it down to
      // 1 Mpx (the old LoadImageCrop did « empty crop + max_megapixels 1 »). `nodeId` is the output node.
      const idChargement = `${nodeId}_charge`;
      graphe[idChargement] = {
        class_type: "LoadImage",
        inputs: { image: nomDistant(ref) },
        _meta: { title: `Ref image ${slot} : fichier (générée par Cadence)` },
      };
      graphe[nodeId] = {
        class_type: "ImageScaleToTotalPixels",
        inputs: { image: [idChargement, 0], upscale_method: "lanczos", megapixels: 1, resolution_steps: 1 },
        _meta: { title: `Ref image ${slot} (générée par Cadence)` },
      };
      refNode.inputs[`ref_images.ref_image_${slot - 1}`] = [nodeId, 0];
    });

    input.refsVideo.forEach((ref) => {
      const { slot } = ref;
      const nodeId = `ref_video_${slot}`;
      // Two CORE ComfyUI nodes (no more third-party pack): LoadVideo loads the file, GetVideoComponents
      // outputs the frames from it (output 0), which feed `ref_videos`. Its audio (output 1) is NOT wired to
      // `ref_video_audios`. Whole video, at its own frame rate and original size (the old node
      // resampled it to 24 fps: to revisit if a video reference renders badly).
      const idComposants = `ref_video_${slot}_images`;
      graphe[nodeId] = {
        class_type: "LoadVideo",
        inputs: { file: nomDistant(ref) },
        _meta: { title: `Ref vidéo ${slot} (générée par Cadence)` },
      };
      graphe[idComposants] = {
        class_type: "GetVideoComponents",
        inputs: { video: [nodeId, 0] },
        _meta: { title: `Ref vidéo ${slot} : images (générée par Cadence)` },
      };
      refNode.inputs[`ref_videos.ref_video_${slot - 1}`] = [idComposants, 0];
    });
  }
}

/**
 * Injects the clip's dynamic values into the API graph before
 * submission. The reference nodes are created on the fly — a clip that
 * uses only 3 image refs wires only 3, never 6 with
 * padding: see the "Slots vides" (empty slots) discussion of 2026-09-26.
 */
export function injecterValeurs(
  workflow: WorkflowJson,
  input: SubmissionInput,
): WorkflowJson {
  verifierEntree(input);
  const graphe = structuredClone(workflow);

  // Duration: without this injection, all clips come out at the duration written in the file. A missing
  // node = outright error (no silence): the graph is no longer the one this code knows.
  const nodeDuree = graphe[NODE_IDS.dureeVideo];
  if (!nodeDuree) throw new Error(`Nœud ${NODE_IDS.dureeVideo} (durée) absent du workflow vidéo`);
  nodeDuree.inputs.value = input.dureeSecondes;

  // Resolution: the source file fixes 0.2 MP; absent from the input, we leave it as is.
  if (input.megapixels != null) {
    const nodeResolution = graphe[NODE_IDS.resolution];
    if (!nodeResolution) throw new Error(`Nœud ${NODE_IDS.resolution} (résolution) absent du workflow vidéo`);
    nodeResolution.inputs.megapixels = resolutionDepuis(input.megapixels);
  }

  if (input.prefixeSortie) {
    const finale = graphe[NODE_IDS.sortieFinale];
    if (finale) finale.inputs.filename_prefix = input.prefixeSortie;
    const apercu = graphe[NODE_IDS.sortieApercu];
    if (apercu) apercu.inputs.filename_prefix = `low_${input.prefixeSortie}`;
  }

  const nodePrompt = graphe[NODE_IDS.prompt];
  if (nodePrompt) nodePrompt.inputs.value = input.promptAssemble;

  if (input.seed) {
    for (const nodeId of [
      NODE_IDS.seedPremierPass,
      NODE_IDS.seedUpscale,
      NODE_IDS.seedSecondPass,
    ]) {
      const node = graphe[nodeId];
      if (!node) continue;
      const champ = "seed" in node.inputs ? "seed" : "noise_seed";
      node.inputs[champ] = Number(input.seed);
    }
  }

  injecterReferences(graphe, input);

  cablerSortie(graphe, input.activerUpscale, input.megapixels);

  return graphe;
}
