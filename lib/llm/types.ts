/** LLM building block: a single interface, behind which a local model is plugged in (OpenAI-compatible server) today, the Claude API later. See
 * docs/CONCEPTION_AGENTS.md §9. No dependency on Next, on the database or on disk
 * here: these types are also used by the worker. */

type RoleLlm = "system" | "user" | "assistant";
/** Mixed content in OpenAI format (text + images). An image goes as a `data:` URL (base64):
 * the local server has no access to Cadence's disk. llama.cpp requires an `mmproj` projector
 * loaded with the model, otherwise it refuses the request (« vision_absente »). */
type PartieTexte = { type: "text"; text: string };
export type PartieImage = { type: "image_url"; image_url: { url: string } };
export type PartieContenu = PartieTexte | PartieImage;
/** A string (the common case, unchanged) or a list of text/image parts. */
type ContenuLlm = string | PartieContenu[];
export type MessageLlm = { role: Exclude<RoleLlm, "system">; content: ContenuLlm };

/** JPEG image part from its raw base64 (without the `data:` prefix). */
export function partieImageJpeg(base64: string): PartieImage {
  return { type: "image_url", image_url: { url: `data:image/jpeg;base64,${base64}` } };
}

/** Decoded size (bytes) of a `data:…;base64,` URL; 0 if it is not one. */
function octetsDataUrl(url: string): number {
  const i = url.indexOf(";base64,");
  if (!url.startsWith("data:") || i < 0) return 0;
  const b64 = url.slice(i + 8);
  const rembourrage = b64.endsWith("==") ? 2 : b64.endsWith("=") ? 1 : 0;
  return Math.max(0, Math.floor((b64.length * 3) / 4) - rembourrage);
}

/** Copy of the messages WITHOUT the images, for the trace (`agent_traces.messages`): each image
 * becomes a text marker `[image 3 : 41 Ko]` (numbered across the whole conversation). A
 * contact sheet of 15 thumbnails weighs ~0.5 MB of base64: it has no business in the database. An
 * http(s) URL is kept as is (it weighs nothing and remains replayable). */
export function messagesSansImages(messages: MessageLlm[]): MessageLlm[] {
  let n = 0;
  return messages.map((m) => {
    if (typeof m.content === "string") return m;
    const content = m.content.map((p): PartieContenu => {
      if (p.type !== "image_url") return p;
      n += 1;
      const url = p.image_url.url;
      if (!url.startsWith("data:")) return { type: "text", text: `[image ${n} : ${url}]` };
      return { type: "text", text: `[image ${n} : ${Math.max(1, Math.round(octetsDataUrl(url) / 1024))} Ko]` };
    });
    return { ...m, content };
  });
}

export type DemandeLlm = {
  /** System prompt (the assembled skill). */
  systeme: string;
  messages: MessageLlm[];
  /** JSON schema (draft 2020-12): the provider constrains the output when it can. */
  schemaSortie?: Record<string, unknown>;
  maxTokens?: number;
  temperature?: number;
  /** Cuts the connection: the server stops generating. */
  signal?: AbortSignal;
  /** Target model; otherwise the configuration's. */
  modele?: string;
  /** Receives the number of output tokens received as the stream flows (progress). */
  surProgres?: (jetonsSortie: number) => void;
  /** Receives the TEXT as the stream flows: `debut` when each call opens (a resend opens a new one),
   * then `reflexion` (reasoning_content) and `texte` (the response). Used for live attempts. */
  surFlux?: (evenement: { type: "debut" | "reflexion" | "texte"; texte: string }) => void;
  /** Fields added as-is to the request body, for THIS call (e.g. cutting the reasoning:
   * `{ chat_template_kwargs: { enable_thinking: false } }`). See `LLM_CORPS` in lib/llm/config.ts. */
  corps?: Record<string, unknown>;
};

export type ReponseLlm = {
  texte: string;
  /** The parsed text, if a JSON output was expected and it is valid JSON. */
  json?: unknown;
  usage: { entree: number; sortie: number };
  dureeMs: number;
  modele: string;
  /** Server's stop reason (`stop`, `length` = output truncated by max_tokens…). */
  arret?: string;
  /** The model's reasoning (`reasoning_content`), bounded, for the trace. Absent if the model emits none. */
  reflexion?: string;
  /** Raw server response (last message or assembled stream), for the trace. */
  brut: unknown;
  /** llama.cpp server measurements when it returns them (`timings` block): what was cached, what was preloaded,
   * the throughput of each phase and the acceptance of drafts (MTP). Used for the replay bench. */
  timings?: TimingsServeur;
};

export type TimingsServeur = {
  /** Input tokens taken from the cache / actually preloaded. */
  cacheN: number;
  promptN: number;
  promptMs: number;
  predictedN: number;
  predictedMs: number;
  /** Drafts proposed / accepted (speculative decoding, MTP). */
  draftN: number;
  draftAcceptedN: number;
};

export interface FournisseurLlm {
  readonly nom: string;
  generer(demande: DemandeLlm): Promise<ReponseLlm>;
}

export type CodeErreurLlm =
  | "injoignable"
  | "modele_absent"
  | "vision_absente"
  | "sortie_invalide"
  | "interrompu"
  | "delai"
  | "flux_coupe"
  | "http";

/** Typed error: the caller (and the trace) distinguishes « the server is off »
 * from « the model does not exist » from « it answered anything ». */
export class ErreurLlm extends Error {
  constructor(
    readonly code: CodeErreurLlm,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "ErreurLlm";
  }
}
