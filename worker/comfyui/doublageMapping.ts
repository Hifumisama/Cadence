import type { WorkflowJson } from "./imageMapping";

/**
 * Nœuds du graphe VOX_Doublage_voix_API_Mode.json (doublage : l'utilisateur joue la réplique, la voix de référence la redit avec son
 * intonation et son rythme — CosyVoice3, speech-to-speech, format API). Le contrat est documenté dans workflows/README.md ;
 * doublageMapping.test.ts vérifie qu'ils existent dans le fichier du dépôt.
 *
 * Contrairement à la première version du graphe, la voix cible est un `LoadAudio` ordinaire (plus de `CharacterVoicesNode`, qui lisait un
 * dossier propre à ComfyUI et exigeait texte de référence et rognage dans le graphe) : la référence arrive déjà rognée côté
 * application. Le fichier exporté se termine par `PreviewAudio` (temporaire, que le worker ne sait pas relire) : à la soumission ce
 * nœud est remplacé, sous le même id, par `SaveAudio` (FLAC), comme pour les prises de réplique.
 */
export const NODE_IDS_DOUBLAGE = {
  changeur: "1", // UnifiedVoiceChangerNode : source_audio (la prise jouée), narrator_target (la voix de référence)
  prise: "12", // LoadAudio « Voix utilisateur » : la prise jouée
  reference: "13", // LoadAudio « Voix de référence » : la voix du personnage
  sortie: "5", // PreviewAudio dans le fichier, SaveAudio une fois injecté
} as const;

export type EntreeDoublage = {
  /** Noms, côté ComfyUI, de la prise jouée et de la voix de référence déjà envoyées au dossier d'entrée. */
  priseDistante: string;
  referenceDistante: string;
  /** Préfixe des fichiers de sortie côté ComfyUI (peut contenir un sous-dossier). */
  prefixeSortie: string;
};

export function injecterDoublage(workflow: WorkflowJson, entree: EntreeDoublage): WorkflowJson {
  const graphe = structuredClone(workflow);
  const noeud = (id: string) => {
    const n = graphe[id];
    if (!n) throw new Error(`Nœud ${id} introuvable dans le workflow de doublage : le graphe a changé, mettre à jour doublageMapping.ts`);
    return n;
  };
  const ids = NODE_IDS_DOUBLAGE;
  noeud(ids.changeur);
  noeud(ids.prise).inputs.audio = entree.priseDistante;
  noeud(ids.reference).inputs.audio = entree.referenceDistante;
  const sortie = noeud(ids.sortie);
  graphe[ids.sortie] = {
    ...sortie,
    class_type: "SaveAudio",
    inputs: { audio: sortie.inputs.audio, filename_prefix: entree.prefixeSortie },
  };
  return graphe;
}
