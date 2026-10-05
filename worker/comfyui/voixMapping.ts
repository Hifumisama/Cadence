import { TEMPERATURE_VOIX_MAX, TEMPERATURE_VOIX_MIN, temperatureVoixValide } from "../../lib/asset-generation";
import type { WorkflowJson } from "./imageMapping";

/**
 * Nœuds du graphe VOX_Generate_Voice_Simplified.json (Qwen3-TTS Voice Design, format API). Le contrat est
 * documenté dans workflows/README.md ; voixMapping.test.ts vérifie qu'ils existent dans le fichier du dépôt
 * (le workflow et ce code vivent dans le même commit).
 *
 * Le fichier exporté se termine par `PreviewAudio` (écoute dans ComfyUI), dont le résultat est un fichier
 * TEMPORAIRE que le worker ne sait pas relire (`fetchOutput` lit le dossier `output`). À la soumission, ce nœud
 * est donc remplacé, sous le même id, par `SaveAudioMP3` (qualité V0), comme pour les bruitages.
 */
export const NODE_IDS_VOIX = {
  moteur: "1", // Qwen3TTSEngineNode : modèle, langue, température
  concepteur: "2", // UnifiedVoiceDesignerNode : texte lu, seed, instruction de timbre
  sortie: "3", // PreviewAudio dans le fichier, SaveAudioMP3 une fois injecté
} as const;

export type EntreeVoix = {
  /** Instruction de timbre (Voice Design), en anglais. */
  instruction: string;
  /** Texte lu par la voix : il doit correspondre au mot près à ce que dira la référence. */
  texteReference: string;
  /** Langue du texte lu (« English », « French »…). */
  langue: string;
  /** Créativité de la voix (température de Qwen3-TTS). */
  temperature: number;
  seed: string;
  /** Préfixe des fichiers de sortie côté ComfyUI (peut contenir un sous-dossier). */
  prefixeSortie: string;
};

/** Même règle que pour les images et les sons : un nœud absent est une erreur franche (un workflow ré-exporté
 * qui change d'ids doit casser ici, pas générer une voix sans instruction ni texte). */
export function injecterGenerationVoix(workflow: WorkflowJson, entree: EntreeVoix): WorkflowJson {
  if (!temperatureVoixValide(entree.temperature)) {
    throw new Error(`Créativité de la voix hors limites (${TEMPERATURE_VOIX_MIN} à ${TEMPERATURE_VOIX_MAX}) : ${entree.temperature}`);
  }
  const graphe = structuredClone(workflow);
  const noeud = (id: string) => {
    const n = graphe[id];
    if (!n) throw new Error(`Nœud ${id} introuvable dans le workflow voix : le graphe a changé, mettre à jour voixMapping.ts`);
    return n;
  };
  const ids = NODE_IDS_VOIX;

  const moteur = noeud(ids.moteur);
  moteur.inputs.temperature = entree.temperature;
  moteur.inputs.language = entree.langue;
  moteur.inputs.instruct = entree.instruction;

  const concepteur = noeud(ids.concepteur);
  concepteur.inputs.voice_instruction = entree.instruction;
  concepteur.inputs.reference_text = entree.texteReference;
  concepteur.inputs.seed = Number(entree.seed);

  const sortie = noeud(ids.sortie);
  graphe[ids.sortie] = {
    ...sortie,
    class_type: "SaveAudioMP3",
    inputs: { audio: sortie.inputs.audio, filename_prefix: entree.prefixeSortie, quality: "V0" },
  };
  return graphe;
}

/**
 * Nœuds du graphe VOX_Generate_Replique_Simplified.json (Qwen3-TTS « Voice Clone », format API) : le TEST AUDIO d'une voix,
 * c'est-à-dire une réplique dite avec la voix de référence clonée. Contrat dans workflows/README.md ; voixMapping.test.ts vérifie
 * que ces nœuds existent dans le fichier du dépôt. Même remplacement de la sortie que pour la voix de référence : `PreviewAudio`
 * (fichier temporaire) devient `SaveAudioMP3`, sous le même id.
 */
export const NODE_IDS_REPLIQUE_TEST = {
  moteur: "1", // Qwen3TTSEngineNode : modèle « Voice Clone », langue
  texte: "4", // UnifiedTTSTextNode : texte dit, seed ; reçoit la voix à cloner (`opt_narrator`)
  reference: "5", // LoadAudio : la voix de référence (nom du fichier dans le dossier d'entrée de ComfyUI)
  sortie: "3", // PreviewAudio dans le fichier, SaveAudioMP3 une fois injecté
} as const;

export type EntreeRepliqueTest = {
  /** Le texte dit, verbatim. */
  texte: string;
  /** Langue du texte (« French », « English »…). */
  langue: string;
  seed: string;
  /** Nom de la voix de référence côté ComfyUI (déjà envoyée par `/upload/image`). */
  referenceDistante: string;
  prefixeSortie: string;
};

export function injecterRepliqueTest(workflow: WorkflowJson, entree: EntreeRepliqueTest): WorkflowJson {
  const graphe = structuredClone(workflow);
  const noeud = (id: string) => {
    const n = graphe[id];
    if (!n) throw new Error(`Nœud ${id} introuvable dans le workflow du test audio : le graphe a changé, mettre à jour voixMapping.ts`);
    return n;
  };
  const ids = NODE_IDS_REPLIQUE_TEST;

  noeud(ids.moteur).inputs.language = entree.langue;
  const texte = noeud(ids.texte);
  texte.inputs.text = entree.texte;
  texte.inputs.seed = Number(entree.seed);
  // Pas de cache de ComfyUI : une même phrase avec une nouvelle seed doit toujours donner une nouvelle prise.
  texte.inputs.enable_audio_cache = false;
  noeud(ids.reference).inputs.audio = entree.referenceDistante;

  const sortie = noeud(ids.sortie);
  graphe[ids.sortie] = {
    ...sortie,
    class_type: "SaveAudioMP3",
    inputs: { audio: sortie.inputs.audio, filename_prefix: entree.prefixeSortie, quality: "V0" },
  };
  return graphe;
}
