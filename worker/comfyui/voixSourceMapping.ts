import { raisonFenetreInvalide } from "../../lib/voix";
import { langueMoteurVoix } from "../../lib/langues-tts";
import type { WorkflowJson } from "./imageMapping";

/**
 * Nœuds du graphe VOX_Get_Audio_and_ASR.json (extraction d'une voix FOURNIE : audio ou vidéo → voix isolée + transcription, format
 * API). Le contrat est documenté dans workflows/README.md ; voixSourceMapping.test.ts vérifie qu'ils existent dans le fichier du dépôt.
 *
 * Le graphe a DEUX chargeurs (audio, vidéo) et un commutateur « isVideo ? » : on envoie le même fichier aux deux (ComfyUI valide le
 * nom de fichier de chaque chargeur même si le commutateur n'en lit qu'un), et c'est le commutateur qui choisit. Le rognage se règle
 * sur le chargeur en secondes ET, pour la vidéo, en images (le nœud accepte les deux, on les garde cohérents). Le texte sort d'un
 * nœud d'affichage (`ShowText`) : le worker le relit dans /history, il n'est pas un fichier.
 */
export const NODE_IDS_VOIX_SOURCE = {
  audio: "4", // LoadAudioUI : le fichier audio, début et fin en secondes
  video: "16", // LoadVideoUI : le fichier vidéo, début et fin en secondes et en images
  commutateur: "21", // ComfySwitchNode « isVideo ? »
  asr: "6", // UnifiedASRTranscribeNode : langue
  sortieAudio: "10", // SaveAudioAdvanced : la voix isolée (FLAC)
  sortieTexte: "11", // ShowText|pysssss : la transcription (JSON texte + segments)
} as const;

export type EntreeVoixSource = {
  /** Nom, côté ComfyUI, du fichier source déjà envoyé au dossier d'entrée. */
  fichierDistant: string;
  /** Fenêtre gardée, en secondes depuis le début du fichier (30 s au plus). */
  debut: number;
  fin: number;
  /** Le fichier est une vidéo (on prend sa piste audio). */
  video: boolean;
  /** Langue parlée, au sens du moteur (« French », « English », « Auto »). */
  langue: string;
  /** Préfixe des fichiers de sortie côté ComfyUI (peut contenir un sous-dossier). */
  prefixeSortie: string;
};

/** Un nœud absent est une erreur franche (un workflow ré-exporté qui change d'ids doit casser ici). */
export function injecterExtractionVoix(workflow: WorkflowJson, entree: EntreeVoixSource): WorkflowJson {
  const raison = raisonFenetreInvalide(entree.debut, entree.fin);
  if (raison) throw new Error(raison);
  const graphe = structuredClone(workflow);
  const noeud = (id: string) => {
    const n = graphe[id];
    if (!n) throw new Error(`Nœud ${id} introuvable dans le workflow d'extraction de voix : le graphe a changé, mettre à jour voixSourceMapping.ts`);
    return n;
  };
  const ids = NODE_IDS_VOIX_SOURCE;
  const duree = Math.round((entree.fin - entree.debut) * 100) / 100;

  const audio = noeud(ids.audio);
  audio.inputs.audio = entree.fichierDistant;
  audio.inputs.start_time = entree.debut;
  audio.inputs.end_time = entree.fin;
  audio.inputs.duration = duree;

  const video = noeud(ids.video);
  const fps = typeof video.inputs.frame_rate === "number" && video.inputs.frame_rate > 0 ? video.inputs.frame_rate : 24;
  const premiere = Math.round(entree.debut * fps);
  const derniere = Math.round(entree.fin * fps);
  video.inputs.video = entree.fichierDistant;
  video.inputs.start_time = entree.debut;
  video.inputs.end_time = entree.fin;
  video.inputs.duration = duree;
  video.inputs.start_frame = premiere;
  video.inputs.end_frame = derniere;
  video.inputs.duration_frames = derniere - premiere;

  noeud(ids.commutateur).inputs.switch = entree.video;
  noeud(ids.asr).inputs.language = langueMoteurVoix(entree.langue);

  const sortie = noeud(ids.sortieAudio);
  sortie.inputs.filename_prefix = entree.prefixeSortie;

  // Le nœud d'affichage garde en entrée la transcription de l'export (un exemple de 3 Ko) : on ne garde que son câblage.
  const texte = noeud(ids.sortieTexte);
  graphe[ids.sortieTexte] = { ...texte, inputs: { text: texte.inputs.text } };
  return graphe;
}

/** Ce que dit la sortie du nœud d'ASR : un JSON `{ text, language, segments }` ; à défaut (autre moteur, texte brut) la chaîne
 * telle quelle. Les mots horodatés ne servent pas : le champ `text` est le propre (les mots collés « regardezles » n'y sont pas). */
export function extraireTranscription(brut: string): string {
  const t = brut.trim();
  if (!t) return "";
  try {
    const o = JSON.parse(t) as { text?: unknown };
    if (typeof o === "object" && o !== null && typeof o.text === "string") return o.text.replace(/\s+/g, " ").trim();
  } catch {
    // pas du JSON : le texte brut fait l'affaire
  }
  return t.replace(/\s+/g, " ").trim();
}
