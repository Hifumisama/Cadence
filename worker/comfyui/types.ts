import type { EtatDansLaFile } from "../../lib/tasks/cancellation";

/** `nomDistant`: name under which the file is deposited in ComfyUI's input folder (unique; otherwise, the local file name). */
export type RefMedia = { slot: number; cheminLocal: string; nomDistant?: string };

export type SubmissionInput = {
  promptAssemble: string;
  seed?: string;
  /** Prefix of the output files, unique per render: without it the name only depends on the counter of ComfyUI's
   * output folder (possible collisions, cached result served to another render). Absent: the file is left as is. */
  prefixeSortie?: string;
  dureeSecondes: number;
  fps: number;
  /** `dureeSecondes`: 4 to 10 (node 22:23). `fps`: the clip's TARGET fps, informative — the graph generates at 24 fps and
   * sets the final frame rate itself (nodes 168/169/170, see workflows/README.md). */
  refsImage: RefMedia[]; // max 6 (images + videos), slot 1 to 6
  refsAudio: (RefMedia & { dureeSecondes?: number | null })[]; // max 3, slot 1 to 3; measured duration of the take
  refsVideo: RefMedia[]; // slot 1 to 3
  activerUpscale: boolean;
  /** Resolution (0.2 / 0.3 / 0.4 MP, node `22:9`); absent = that of the file. Above 0.2 MP, a final render is native: without upscale. */
  megapixels?: number;
};

export type PollResult =
  | { statut: "en_cours" }
  | { statut: "termine"; cheminSortieDistant: string }
  | { statut: "erreur"; message: string };

/** What ComfyUI reports while a prompt runs (WebSocket). Everything is
 * optional on the consumer side: a missed event never changes the
 * result, which comes from /history. */
export type EvenementSuivi =
  | { type: "demarre" }
  | { type: "noeud"; noeud: string }
  | { type: "progression"; valeur: number; max: number; noeud: string }
  | { type: "apercu"; octets: Buffer; format: "jpeg" | "png" | "webp" | "inconnu"; noeud?: string }
  | { type: "termine" }
  | { type: "erreur"; message: string };

/** How tracking stopped: `coupure` = the WebSocket dropped (or could not
 * open) before the end, the caller falls back to /history. */
export type IssueSuivi = "termine" | "erreur" | "coupure" | "delai";

export interface Suivi {
  /** Waits for the end of prompt `promptId`. Never rejects. */
  attendre(promptId: string, delaiMs: number): Promise<IssueSuivi>;
  fermer(): void;
}

/** Stable interface behind which all the knowledge of the ComfyUI graph's node IDs lives — see
 * workflows/README.md ("the workflow and the submission code live in the same commit") and the implementation plan
 * (section "Prérequis bloquant" (blocking prerequisite)). Allows developing web/worker against a
 * stub as long as VID_REF2VA.json has not been re-exported in API format. */
export interface ComfyUIClient {
  healthcheck(): Promise<boolean>;
  uploadRef(cheminLocal: string, nomDistant: string): Promise<void>;
  fetchOutput(cheminSortieDistant: string, cheminLocalCible: string): Promise<void>;

  /** Image tasks (workflows image-refs/): the graph is already assembled by
   * the caller, the client only submits it then reads an output. */
  submitGraph(graphe: Record<string, unknown>): Promise<string>;
  pollImage(promptId: string, nodeIdSortie: string): Promise<PollResult>;
  /** End of a prompt that produces no readable file: the three-step video upscale only saves a latent.
   * « terminé » (done, with an empty path) as soon as /history says so, « erreur » (error) with ComfyUI's message otherwise. */
  pollFin(promptId: string): Promise<PollResult>;
  /** Opens the tracking WebSocket BEFORE submission (ComfyUI only sends
   * events to the clientId that submitted the prompt, and a short prompt may
   * finish before we connect). Never rejects: an impossible
   * connection gives a tracker that answers `coupure`. */
  ouvrirSuivi(surEvenement: (e: EvenementSuivi) => void): Promise<Suivi>;

  /** Cancellation (lib/tasks/cancellation.ts). `etatDansLaFile` reads GET /queue: the worker
   * never interrupts a prompt it has not verified is the one
   * running. `inconnu` (unknown) if ComfyUI does not answer or if the answer is unreadable. */
  etatDansLaFile(promptId: string): Promise<EtatDansLaFile>;
  /** POST /interrupt: stops the running execution (with the `prompt_id`, recent
   * ComfyUI versions only stop that one). Never rejects. */
  interrompre(promptId: string): Promise<boolean>;
  /** POST /queue {"delete": [promptId]}: removes a prompt still in the queue. Never
   * rejects. */
  retirerDeLaFile(promptId: string): Promise<boolean>;

  /** POST /free {"unload_models": true, "free_memory": true}: ComfyUI unloads its
   * models from VRAM. The worker calls it before an LLM call (same GPU, see
   * lib/renders/gpu.ts). « Au mieux » (best effort): never rejects, `false` if the server did not
   * accept it. No effect while ComfyUI runs a prompt (the request is handled
   * between two prompts): the worker only does it when it is idle. */
  libererMemoire(): Promise<boolean>;
}
