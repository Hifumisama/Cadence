import { basename } from "node:path";
import { DUREE_GENERATION_MAX, DUREE_GENERATION_MIN } from "../../lib/clips/clip-checks";
import { RESOLUTIONS_VIDEO, avecUpscale, estFinalNatif, resolutionDepuis } from "../../lib/renders/resolution-video";
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
 * - durée du plan         -> "22:23" (PrimitiveFloat, secondes) -> "22:24" (ComfyMathExpression :
 *                            nombre d'images 17k+5) -> champ `length` du nœud "5"
 * - sortie finale         -> "34" (VHS_VideoCombine, "Final Video")
 * - branche basse-rés     -> "176" (VAEDecode) / "177" (VAEDecodeAudio) — même source que l'aperçu (nœud 18)
 * - branche upscale       -> "165" (RIFEInterpolation) / "261" (Any Switch, "Final Audio")
 */
export const NODE_IDS = {
  prompt: "22:11",
  /** « Resolution Selector (Size) » : format 16:9 et mégapixels du rendu. */
  resolution: "22:9",
  seedPremierPass: "16",
  seedUpscale: "103",
  seedSecondPass: "135:27",
  refNode: "5",
  /** « Video Length (seconds) » : la durée du plan, en secondes (flottant). */
  dureeVideo: "22:23",
  /** Expression qui en tire le nombre d'images (24 i/s, forme 17k+5). */
  nombreImages: "22:24",
  sortieFinale: "34",
  /** Aperçu basse résolution (VHS_VideoCombine, « low_… »). */
  sortieApercu: "18",
  basseResImages: "176",
  basseResAudio: "177",
  upscaleImages: "165",
  upscaleAudio: "261",
} as const;

type NodeAPI = { class_type: string; inputs: Record<string, unknown>; _meta?: { title: string } };
export type WorkflowJson = Record<string, NodeAPI>;

/** Le modèle génère toujours à 24 i/s (infobulle de `length` sur le nœud 5 : « Frame count at 24 fps »). */
export const FPS_GENERATION = 24;
/** Limites de MiniMax H3 appliquées par Cadence : 6 images + vidéos, 3 audios (les nœuds en acceptent 9 / 3). */
const MAX_REFS_VISUELLES = 6;
const MAX_REFS_AUDIO = 3;

/** Entrée refusée AVANT toute soumission : réessayer ne changerait rien (le worker ne la rejoue pas). */
export class ErreurEntreeInvalide extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ErreurEntreeInvalide";
  }
}

/** Nom du fichier de référence côté ComfyUI : par défaut le nom du fichier local. L'appelant peut imposer
 * un nom unique (`nomDistant`) : tous les fichiers d'entrée de ComfyUI partagent un seul dossier. */
function nomDistant(ref: { cheminLocal: string; nomDistant?: string }): string {
  return ref.nomDistant ?? basename(ref.cheminLocal);
}

/** Nom unique et sans collision pour un fichier de MEDIA_ROOT (« assets/CHAR_maya.png » ->
 * « cadence_assets_CHAR_maya.png », « repliques/12/prise.wav » -> « cadence_repliques_12_prise.wav ») :
 * ne marche jamais sur un fichier de l'utilisateur dans le dossier d'entrée de ComfyUI (le dépôt est
 * écrasé à chaque envoi) et distingue deux prises de même nom. */
export function nomDistantDepuisChemin(cheminRelatif: string): string {
  return `cadence_${cheminRelatif.replace(/[\\/]+/g, "_")}`;
}

const dansIntervalle = (n: number, min: number, max: number) => Number.isFinite(n) && n >= min && n <= max;

/** Contrôle de bornes de ce que le code injecte. Lève `ErreurEntreeInvalide`. */
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
  if (input.refsAudio.length > MAX_REFS_AUDIO) {
    throw new ErreurEntreeInvalide(`${input.refsAudio.length} références audio : ${MAX_REFS_AUDIO} au plus.`);
  }
  const controlerSlots = (nom: string, slots: number[], max: number) => {
    for (const s of slots) {
      if (!Number.isInteger(s) || s < 1 || s > max) throw new ErreurEntreeInvalide(`Emplacement ${nom} ${s} hors de 1 à ${max}.`);
    }
    if (new Set(slots).size !== slots.length) throw new ErreurEntreeInvalide(`Deux références occupent le même emplacement ${nom}.`);
  };
  controlerSlots("image", input.refsImage.map((r) => r.slot), MAX_REFS_VISUELLES);
  controlerSlots("vidéo", input.refsVideo.map((r) => r.slot), 3);
  controlerSlots("audio", input.refsAudio.map((r) => r.slot), MAX_REFS_AUDIO);
}

/** Câble la sortie finale (nœud 34) selon le mode : upscale (final à la résolution de base), final natif (au-delà) ou aperçu. Modifie `graphe` en place ;
 * exportée pour que le banc de mesure (scripts/banc-video.ts) branche ses variantes exactement comme le worker. */
function cablerSortie(graphe: WorkflowJson, activerUpscale: boolean, megapixels?: number): void {
  // Toggle upscale (F04) : on rebranche la sortie finale sur la même
  // branche basse-résolution que l'aperçu (nœud 18) plutôt que de bypasser
  // un groupe — les nœuds d'upscale, non référencés, ne sont alors pas
  // exécutés par ComfyUI (résolution de dépendances par les sorties
  // demandées, pas de coût caché).
  const nodeSortie = graphe[NODE_IDS.sortieFinale];
  if (nodeSortie) {
    if (avecUpscale(activerUpscale, megapixels)) {
      nodeSortie.inputs.images = [NODE_IDS.upscaleImages, 0];
      nodeSortie.inputs.audio = [NODE_IDS.upscaleAudio, 0];
    } else if (estFinalNatif(activerUpscale, megapixels)) {
      // Rendu final natif (au-delà de 0,2 MP) : pas d'upscale, mais la même interpolation que les rendus finals (RIFE, 24 → 48 i/s) : le
      // nœud 165 lit la sortie de la première passe au lieu de celle de l'upscale, la cadence du nœud 34 reste celle du commutateur.
      const rife = graphe[NODE_IDS.upscaleImages];
      if (!rife) throw new Error(`Nœud ${NODE_IDS.upscaleImages} (RIFE) absent du workflow vidéo`);
      rife.inputs.images = [NODE_IDS.basseResImages, 0];
      nodeSortie.inputs.images = [NODE_IDS.upscaleImages, 0];
      nodeSortie.inputs.audio = [NODE_IDS.basseResAudio, 0];
    } else {
      nodeSortie.inputs.images = [NODE_IDS.basseResImages, 0];
      nodeSortie.inputs.audio = [NODE_IDS.basseResAudio, 0];
      // Sans RIFE, les images sont encore à 24 i/s ; le nœud 34 lit sa cadence sur le commutateur
      // « Target FPS » (170 -> 48) : la prévisualisation passerait à double vitesse, son décalé.
      nodeSortie.inputs.frame_rate = FPS_GENERATION;
    }
  }
}

/** Recrée les nœuds de référence du plan (images, sons, vidéos) autour du nœud `MiniMaxH3ReferenceToVideo`, partagée par le mapping d'origine et
 * celui des trois étapes (mappingThreeSteps.ts) : une seule règle pour les emplacements et les noms de fichiers. Modifie `graphe` en place. */
export function injecterReferences(graphe: WorkflowJson, input: SubmissionInput, idNoeudRef: string = NODE_IDS.refNode): void {
  const refNode = graphe[idNoeudRef];
  if (refNode) {
    // Repart d'un nœud de référence vierge : seuls les slots réellement
    // utilisés par CE plan seront recâblés ci-dessous.
    for (const cle of Object.keys(refNode.inputs)) {
      if (cle.startsWith("ref_images.") || cle.startsWith("ref_audios.") || cle.startsWith("ref_videos.")) {
        delete refNode.inputs[cle];
      }
    }

    input.refsImage.forEach((ref) => {
      const { slot } = ref;
      const nodeId = `ref_img_${slot}`;
      // Deux nœuds du NOYAU (plus de pack tiers) : LoadImage charge le fichier, ImageScaleToTotalPixels le ramène à
      // 1 Mpx (l'ancien LoadImageCrop faisait « crop vide + max_megapixels 1 »). `nodeId` est le nœud de sortie.
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

    input.refsAudio.forEach((ref) => {
      const { slot } = ref;
      const nodeId = `ref_audio_${slot}`;
      // LoadAudio, nœud du NOYAU de ComfyUI (plus de pack tiers) : charge le fichier entier, sans découpe.
      graphe[nodeId] = {
        class_type: "LoadAudio",
        inputs: { audio: nomDistant(ref) },
        _meta: { title: `Ref audio ${slot} (générée par Cadence)` },
      };
      refNode.inputs[`ref_audios.ref_audio_${slot - 1}`] = [nodeId, 0];
    });

    input.refsVideo.forEach((ref) => {
      const { slot } = ref;
      const nodeId = `ref_video_${slot}`;
      // Deux nœuds du NOYAU de ComfyUI (plus de pack tiers) : LoadVideo charge le fichier, GetVideoComponents
      // en sort les images (sortie 0), qui alimentent `ref_videos`. Son audio (sortie 1) n'est PAS câblé sur
      // `ref_video_audios`. Vidéo entière, à sa cadence et à sa taille d'origine (l'ancien nœud la
      // rééchantillonnait à 24 i/s : à revoir si une référence vidéo rend mal).
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
 * Injecte les valeurs dynamiques du plan dans le graphe API avant
 * soumission. Les nœuds de référence sont créés à la volée — un plan qui
 * n'utilise que 3 refs image n'en câble que 3, jamais 6 avec du
 * remplissage : voir la discussion "Slots vides" du 2026-09-26.
 */
export function injecterValeurs(
  workflow: WorkflowJson,
  input: SubmissionInput,
): WorkflowJson {
  verifierEntree(input);
  const graphe = structuredClone(workflow);

  // Durée : sans cette injection, tous les plans sortent à la durée écrite dans le fichier. Absence du
  // nœud = erreur franche (pas de silence), le graphe n'est plus celui que ce code connaît.
  const nodeDuree = graphe[NODE_IDS.dureeVideo];
  if (!nodeDuree) throw new Error(`Nœud ${NODE_IDS.dureeVideo} (durée) absent du workflow vidéo`);
  nodeDuree.inputs.value = input.dureeSecondes;

  // Résolution : le fichier source fixe 0,2 MP ; absente de l'entrée, on la laisse telle quelle.
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
