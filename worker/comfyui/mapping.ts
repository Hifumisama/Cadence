import { basename } from "node:path";
import type { SubmissionInput } from "./types";

/**
 * Cartographie des node IDs FIXES du graphe VID_REF2VA (format API, ré-
 * exporté le 2026-09-26). Les nœuds de référence (LoadImageCrop /
 * LoadAudioUI / LoadVideoUI) ne sont PAS dans cette liste : ils sont créés
 * dynamiquement à chaque soumission (voir injecterValeurs) — décision prise
 * avec l'utilisateur le 2026-09-26 pour éviter toute dérive de rendu causée
 * par une image de référence non voulue mais quand même fournie au modèle.
 *
 * - prompt assemblé       -> nœud "22:11" (PrimitiveStringMultiline, dans le subgraph 22 flatten)
 * - seed 1er pass         -> nœud "16"    (easy seed)
 * - seed upscale          -> nœud "103"   (easy seed)
 * - seed 2nd pass         -> nœud "135:27" (RandomNoise, champ noise_seed)
 * - nœud de référence     -> "5" (MiniMaxH3ReferenceToVideo) — reçoit les liens dynamiques
 * - sortie finale         -> "34" (VHS_VideoCombine, "Final Video")
 * - branche basse-rés     -> "176" (VAEDecode) / "177" (VAEDecodeAudio) — même source que l'aperçu (nœud 18)
 * - branche upscale       -> "165" (RIFEInterpolation) / "261" (Any Switch, "Final Audio")
 */
export const NODE_IDS = {
  prompt: "22:11",
  seedPremierPass: "16",
  seedUpscale: "103",
  seedSecondPass: "135:27",
  refNode: "5",
  sortieFinale: "34",
  basseResImages: "176",
  basseResAudio: "177",
  upscaleImages: "165",
  upscaleAudio: "261",
} as const;

type NodeAPI = { class_type: string; inputs: Record<string, unknown>; _meta?: { title: string } };
type WorkflowJson = Record<string, NodeAPI>;

function nomDistant(cheminLocal: string): string {
  return basename(cheminLocal);
}

/**
 * Injecte les valeurs dynamiques du plan dans le graphe API avant
 * soumission. Les nœuds de référence sont créés à la volée — un plan qui
 * n'utilise que 3 refs image n'en câble que 3, jamais 6 avec du
 * remplissage : voir la discussion "Slots vides" du 2026-09-26.
 */
export function injecterValeurs(
  workflow: WorkflowJson,
  input: SubmissionInput,
): WorkflowJson {
  const graphe = structuredClone(workflow);

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

  const refNode = graphe[NODE_IDS.refNode];
  if (refNode) {
    // Repart d'un nœud de référence vierge : seuls les slots réellement
    // utilisés par CE plan seront recâblés ci-dessous.
    for (const cle of Object.keys(refNode.inputs)) {
      if (cle.startsWith("ref_images.") || cle.startsWith("ref_audios.") || cle.startsWith("ref_videos.")) {
        delete refNode.inputs[cle];
      }
    }

    input.refsImage.forEach(({ slot, cheminLocal }) => {
      const nodeId = `ref_img_${slot}`;
      graphe[nodeId] = {
        class_type: "LoadImageCrop",
        inputs: { image: nomDistant(cheminLocal), crop: "", max_megapixels: 1 },
        _meta: { title: `Ref image ${slot} (générée par Cadence)` },
      };
      refNode.inputs[`ref_images.ref_image_${slot - 1}`] = [nodeId, 0];
    });

    input.refsAudio.forEach(({ slot, cheminLocal }) => {
      const nodeId = `ref_audio_${slot}`;
      graphe[nodeId] = {
        class_type: "LoadAudioUI",
        inputs: { audio: nomDistant(cheminLocal), start_time: 0, end_time: 0, duration: 0, audio_ui: "" },
        _meta: { title: `Ref audio ${slot} (générée par Cadence)` },
      };
      refNode.inputs[`ref_audios.ref_audio_${slot - 1}`] = [nodeId, 0];
    });

    input.refsVideo.forEach(({ slot, cheminLocal }) => {
      const nodeId = `ref_video_${slot}`;
      // Forme du nœud LoadVideoUI non confirmée faute d'exemple câblé dans
      // l'export actuel (aucune ref vidéo active) — à vérifier au premier
      // plan qui en utilise une (voir docs/REGISTRE_ASSETS.md, KEY_reference_salto).
      graphe[nodeId] = {
        class_type: "LoadVideoUI",
        inputs: { video: nomDistant(cheminLocal) },
        _meta: { title: `Ref vidéo ${slot} (générée par Cadence)` },
      };
      refNode.inputs[`ref_videos.ref_video_${slot - 1}`] = [nodeId, 0];
    });
  }

  // Toggle upscale (F04) : on rebranche la sortie finale sur la même
  // branche basse-résolution que l'aperçu (nœud 18) plutôt que de bypasser
  // un groupe — les nœuds d'upscale, non référencés, ne sont alors pas
  // exécutés par ComfyUI (résolution de dépendances par les sorties
  // demandées, pas de coût caché).
  const nodeSortie = graphe[NODE_IDS.sortieFinale];
  if (nodeSortie) {
    if (input.activerUpscale) {
      nodeSortie.inputs.images = [NODE_IDS.upscaleImages, 0];
      nodeSortie.inputs.audio = [NODE_IDS.upscaleAudio, 0];
    } else {
      nodeSortie.inputs.images = [NODE_IDS.basseResImages, 0];
      nodeSortie.inputs.audio = [NODE_IDS.basseResAudio, 0];
    }
  }

  return graphe;
}

export function nomFichierSortie(workflow: WorkflowJson): string | undefined {
  const node = workflow[NODE_IDS.sortieFinale];
  return node?.inputs.filename_prefix as string | undefined;
}
