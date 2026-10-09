import type { EtatDansLaFile } from "../../lib/annulation";

/** `nomDistant` : nom sous lequel le fichier est déposé dans le dossier d'entrée de ComfyUI (unique ; à défaut, le nom du fichier local). */
export type RefMedia = { slot: number; cheminLocal: string; nomDistant?: string };

export type SubmissionInput = {
  promptAssemble: string;
  seed?: string;
  /** Préfixe des fichiers de sortie, unique par rendu : sans lui le nom ne dépend que du compteur du dossier
   * output de ComfyUI (collisions possibles, résultat en cache servi à un autre rendu). Absent : le fichier est laissé tel quel. */
  prefixeSortie?: string;
  dureeSecondes: number;
  fps: number;
  /** `dureeSecondes` : 5 à 15 (nœud 22:23). `fps` : fps VISÉ du plan, informatif — le graphe génère à 24 i/s et
   * règle la cadence finale lui-même (nœuds 168/169/170, voir workflows/README.md). */
  refsImage: RefMedia[]; // max 6 (images + vidéos), emplacement 1 à 6
  refsAudio: (RefMedia & { dureeSecondes?: number | null })[]; // max 3, emplacement 1 à 3 ; durée mesurée de la prise
  refsVideo: RefMedia[]; // emplacement 1 à 3
  activerUpscale: boolean;
};

export type PollResult =
  | { statut: "en_cours" }
  | { statut: "termine"; cheminSortieDistant: string }
  | { statut: "erreur"; message: string };

/** Ce que ComfyUI raconte pendant qu'un prompt s'exécute (WebSocket). Tout est
 * facultatif côté consommateur : un événement manqué ne change jamais le
 * résultat, qui vient de /history. */
export type EvenementSuivi =
  | { type: "demarre" }
  | { type: "noeud"; noeud: string }
  | { type: "progression"; valeur: number; max: number; noeud: string }
  | { type: "apercu"; octets: Buffer; format: "jpeg" | "png" | "webp" | "inconnu"; noeud?: string }
  | { type: "termine" }
  | { type: "erreur"; message: string };

/** Comment le suivi s'est arrêté : `coupure` = le WebSocket est tombé (ou n'a pas
 * pu s'ouvrir) avant la fin, l'appelant retombe sur /history. */
export type IssueSuivi = "termine" | "erreur" | "coupure" | "delai";

export interface Suivi {
  /** Attend la fin du prompt `promptId`. Ne rejette jamais. */
  attendre(promptId: string, delaiMs: number): Promise<IssueSuivi>;
  fermer(): void;
}

/** Interface stable derrière laquelle vit toute la connaissance des node IDs
 * du graphe ComfyUI — voir workflows/README.md ("le workflow et le code de
 * soumission vivent dans le même commit") et le plan d'implémentation
 * (section "Prérequis bloquant"). Permet de développer web/worker contre un
 * stub tant que VID_REF2VA.json n'est pas ré-exporté en format API. */
export interface ComfyUIClient {
  healthcheck(): Promise<boolean>;
  uploadRef(cheminLocal: string, nomDistant: string): Promise<void>;
  submit(input: SubmissionInput): Promise<string>; // renvoie le prompt_id ComfyUI
  poll(promptId: string): Promise<PollResult>;
  fetchOutput(cheminSortieDistant: string, cheminLocalCible: string): Promise<void>;

  /** Tâches d'images (workflows image-refs/) : le graphe est déjà assemblé par
   * l'appelant, le client ne fait que le soumettre puis lire une sortie. */
  submitGraph(graphe: Record<string, unknown>): Promise<string>;
  pollImage(promptId: string, nodeIdSortie: string): Promise<PollResult>;
  /** Le texte qu'un nœud d'affichage (`ShowText`) a produit, lu dans /history ; null tant qu'il n'est pas là (le nœud peut finir
   * après le nœud d'enregistrement). Sert à l'extraction de voix (transcription). Ne rejette jamais. */
  lireTexteSortie(promptId: string, nodeIdSortie: string): Promise<string | null>;

  /** Ouvre le WebSocket de suivi AVANT la soumission (ComfyUI n'envoie les
   * événements qu'au clientId qui a soumis le prompt, et un prompt court peut
   * finir avant qu'on se connecte). Ne rejette jamais : une connexion
   * impossible donne un suivi qui répond `coupure`. */
  ouvrirSuivi(surEvenement: (e: EvenementSuivi) => void): Promise<Suivi>;

  /** Annulation (lib/annulation.ts). `etatDansLaFile` lit GET /queue : le worker
   * ne coupe jamais un prompt dont il n'a pas vérifié qu'il est bien celui qui
   * tourne. `inconnu` si ComfyUI ne répond pas ou si la réponse est illisible. */
  etatDansLaFile(promptId: string): Promise<EtatDansLaFile>;
  /** POST /interrupt : arrête l'exécution en cours (avec le `prompt_id`, les
   * versions récentes de ComfyUI ne coupent que celui-là). Ne rejette jamais. */
  interrompre(promptId: string): Promise<boolean>;
  /** POST /queue {"delete": [promptId]} : retire un prompt encore en file. Ne
   * rejette jamais. */
  retirerDeLaFile(promptId: string): Promise<boolean>;

  /** POST /free {"unload_models": true, "free_memory": true} : ComfyUI décharge ses
   * modèles de la VRAM. Le worker l'appelle avant un appel LLM (même GPU, voir
   * lib/gpu.ts). « Au mieux » : ne rejette jamais, `false` si le serveur n'a pas
   * accepté. Sans effet quand ComfyUI exécute un prompt (la demande est traitée
   * entre deux prompts) : le worker ne la fait que lorsqu'il est au repos. */
  libererMemoire(): Promise<boolean>;
}
