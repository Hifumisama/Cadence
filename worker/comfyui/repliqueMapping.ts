import { TEMPERATURE_VOIX_MAX, TEMPERATURE_VOIX_MIN, seedTts, temperatureVoixValide } from "../../lib/asset-generation";
import { langueMoteurVoix } from "../../lib/langues-tts";
import type { WorkflowJson } from "./imageMapping";

/**
 * Nœuds du graphe VOX_Generate_Replique_Simplified.json (Qwen3-TTS Base, clonage d'une voix de référence, format API). Le contrat
 * est documenté dans workflows/README.md ; repliqueMapping.test.ts vérifie qu'ils existent dans le fichier du dépôt (le workflow
 * et ce code vivent dans le même commit).
 *
 * Le fichier exporté se termine par `PreviewAudio` (écoute dans ComfyUI), dont le résultat est un fichier TEMPORAIRE que le worker
 * ne sait pas relire (`fetchOutput` lit le dossier `output`). À la soumission, ce nœud est remplacé, sous le même id, par
 * `SaveAudio` (FLAC : la durée de la prise se mesure, et le FLAC est le format recommandé pour une référence de clonage).
 */
export const NODE_IDS_REPLIQUE = {
  moteur: "1", // Qwen3TTSEngineNode : modèle (Base, clonage), langue, température
  texte: "4", // UnifiedTTSTextNode : texte dit, seed, voix de référence (entrée `opt_narrator`)
  reference: "5", // LoadAudio : la voix de référence, dans le dossier d'entrée de ComfyUI
  sortie: "3", // PreviewAudio dans le fichier, SaveAudio une fois injecté
} as const;

export type EntreeReplique = {
  /** La réplique, mot pour mot. */
  texte: string;
  /** Langue du texte dit, au sens du moteur (« French », « English », « Auto »…). */
  langue: string;
  /** Créativité de la voix (température de Qwen3-TTS), la même plage que la voix de référence. */
  temperature: number;
  seed: string;
  /** Nom, côté ComfyUI, de la voix de référence déjà envoyée au dossier d'entrée. */
  referenceDistante: string;
  /** Préfixe des fichiers de sortie côté ComfyUI (peut contenir un sous-dossier). */
  prefixeSortie: string;
};

/** Même règle que pour les voix, les images et les sons : un nœud absent est une erreur franche (un workflow ré-exporté qui change
 * d'ids doit casser ici, pas générer une réplique sans texte ni voix).
 *
 * Le champ `instruct` du moteur (reste d'un essai de Voice Design) et les autres réglages exportés sont laissés tels quels : ce sont
 * ceux des essais directs sous ComfyUI. Seul le cache audio du nœud de texte est coupé : il pourrait resservir une prise générée avec
 * une AUTRE voix de référence de même nom. */
export function injecterGenerationReplique(workflow: WorkflowJson, entree: EntreeReplique): WorkflowJson {
  if (!temperatureVoixValide(entree.temperature)) {
    throw new Error(`Créativité de la voix hors limites (${TEMPERATURE_VOIX_MIN} à ${TEMPERATURE_VOIX_MAX}) : ${entree.temperature}`);
  }
  if (!entree.texte.trim()) throw new Error("Texte de la réplique vide");
  const graphe = structuredClone(workflow);
  const noeud = (id: string) => {
    const n = graphe[id];
    if (!n) throw new Error(`Nœud ${id} introuvable dans le workflow réplique : le graphe a changé, mettre à jour repliqueMapping.ts`);
    return n;
  };
  const ids = NODE_IDS_REPLIQUE;

  const moteur = noeud(ids.moteur);
  moteur.inputs.temperature = entree.temperature;
  moteur.inputs.language = langueMoteurVoix(entree.langue);

  const texte = noeud(ids.texte);
  texte.inputs.text = entree.texte;
  texte.inputs.seed = seedTts(entree.seed);
  texte.inputs.enable_audio_cache = false;

  noeud(ids.reference).inputs.audio = entree.referenceDistante;

  const sortie = noeud(ids.sortie);
  graphe[ids.sortie] = {
    ...sortie,
    class_type: "SaveAudio",
    inputs: { audio: sortie.inputs.audio, filename_prefix: entree.prefixeSortie },
  };
  return graphe;
}
