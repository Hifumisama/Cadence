export type SubmissionInput = {
  promptAssemble: string;
  seed?: string;
  dureeSecondes: number;
  fps: number;
  refsImage: { slot: number; cheminLocal: string }[]; // max 6
  refsAudio: { slot: number; cheminLocal: string }[]; // max 3
  refsVideo: { slot: number; cheminLocal: string }[];
  activerUpscale: boolean;
};

export type PollResult =
  | { statut: "en_cours" }
  | { statut: "termine"; cheminSortieDistant: string }
  | { statut: "erreur"; message: string };

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
}
