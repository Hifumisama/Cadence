import { DUREE_AUDIO_MAX, DUREE_AUDIO_MIN, dureeAudioValide } from "../../lib/asset-generation";
import type { WorkflowJson } from "./imageMapping";

/**
 * Nœuds du graphe SFX_Generate_Sounds.json (Stable Audio 3, format API). Le
 * contrat est documenté dans workflows/README.md ; audioMapping.test.ts vérifie
 * qu'ils existent dans le fichier du dépôt (le workflow et ce code vivent dans
 * le même commit).
 *
 * La branche de réécriture du prompt (TextGenerate `52:28`, gabarit `52:49`,
 * catégorie `52:43`) n'est jamais utilisée : `reprompt` est forcé à false, le
 * prompt de l'utilisateur part tel quel (c'est le skill prompt-asset qui l'écrit).
 */
export const NODE_IDS_AUDIO = {
  prompt: "52:31", // PrimitiveStringMultiline : la description du son
  duree: "52:36", // PrimitiveFloat : durée en secondes (alimente EmptyLatentAudio)
  seed: "52:3", // KSampler
  reprompt: "52:35", // PrimitiveBoolean « Enable_Reprompt » : forcé à false
  sortie: "19", // SaveAudioMP3
} as const;

export type EntreeAudio = {
  prompt: string;
  dureeSecondes: number;
  seed: string;
  /** Préfixe des fichiers de sortie côté ComfyUI (peut contenir un sous-dossier). */
  prefixeSortie: string;
};

/** Même règle que pour les images : un nœud absent est une erreur franche (un
 * workflow ré-exporté qui change d'ids doit casser ici, pas générer un son sans
 * prompt ni durée). */
export function injecterGenerationAudio(workflow: WorkflowJson, entree: EntreeAudio): WorkflowJson {
  if (!dureeAudioValide(entree.dureeSecondes)) {
    throw new Error(`Durée audio hors limites (${DUREE_AUDIO_MIN} à ${DUREE_AUDIO_MAX} s) : ${entree.dureeSecondes}`);
  }
  const graphe = structuredClone(workflow);
  const noeud = (id: string) => {
    const n = graphe[id];
    if (!n) throw new Error(`Nœud ${id} introuvable dans le workflow audio : le graphe a changé, mettre à jour audioMapping.ts`);
    return n;
  };
  const ids = NODE_IDS_AUDIO;

  noeud(ids.prompt).inputs.value = entree.prompt;
  noeud(ids.duree).inputs.value = entree.dureeSecondes;
  noeud(ids.seed).inputs.seed = Number(entree.seed);
  noeud(ids.reprompt).inputs.value = false;
  noeud(ids.sortie).inputs.filename_prefix = entree.prefixeSortie;
  return graphe;
}
