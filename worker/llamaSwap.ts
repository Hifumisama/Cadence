/** Small client for llama-swap, the proxy that loads/unloads the models of
 * llama.cpp on demand (see docs/CONCEPTION_AGENTS.md). The worker uses it for
 * two things that the LLM provider (lib/llm/) ignores: knowing whether the server is there
 * before taking a task, and unloading the models from VRAM before ComfyUI
 * takes the GPU back (lib/renders/gpu.ts).
 *
 * Everything is "au mieux" (best effort) and never rejects: a failure is read in the result.
 * The routes `/health`, `/running` and `/unload` are those of llama-swap
 * (project README); their exact form is checked on the user's server, see docs/FRICTIONS.md (« Ressource GPU unique »). */

type Fetch = typeof fetch;

const TIMEOUT_SONDE_MS = 5_000;
const TIMEOUT_DECHARGE_MS = 30_000; // /unload waits for the processes to stop

/** Does the server respond? (`GET /health`, « OK » with llama-swap; other route via `LLM_HEALTH_PATH`).
 * Loads no model. */
export async function llmJoignable(url: string, fetchFn: Fetch = fetch, route = "/health"): Promise<boolean> {
  try {
    const res = await fetchFn(`${url}${route}`,{ signal: AbortSignal.timeout(TIMEOUT_SONDE_MS) });
    return res.ok;
  } catch {
    return false;
  }
}

/** Models currently loaded (`GET /running`), or null if we cannot
 * know. Tolerant decoding: `{ running: [{ model, state }] }` or a simple list. */
export function decoderModelesCharges(corps: unknown): string[] | null {
  const liste = Array.isArray(corps) ? corps : (corps as { running?: unknown } | null)?.running;
  if (!Array.isArray(liste)) return null;
  return liste
    .map((x) => (typeof x === "string" ? x : typeof (x as { model?: unknown })?.model === "string" ? (x as { model: string }).model : null))
    .filter((m): m is string => m != null);
}

export async function modelesCharges(url: string, fetchFn: Fetch = fetch): Promise<string[] | null> {
  try {
    const res = await fetchFn(`${url}/running`, { signal: AbortSignal.timeout(TIMEOUT_SONDE_MS) });
    if (!res.ok) return null;
    return decoderModelesCharges(await res.json());
  } catch {
    return null;
  }
}

/** Models declared by the server (`GET /v1/models`, OpenAI format: `{ data: [{ id }] }`; llama-swap, LM Studio and Ollama
 * expose it). Tolerant decoding: a list of identifiers or of `{ id }` objects. null if the shape is unexpected. */
export function decoderListeModeles(corps: unknown): string[] | null {
  const liste = Array.isArray(corps) ? corps : (corps as { data?: unknown } | null)?.data;
  if (!Array.isArray(liste)) return null;
  const ids = liste
    .map((x) => (typeof x === "string" ? x : typeof (x as { id?: unknown })?.id === "string" ? (x as { id: string }).id : null))
    .filter((m): m is string => m != null && m.trim() !== "");
  return [...new Set(ids)].sort((a, b) => a.localeCompare(b));
}

/** The models the server can load, or null if we cannot know. Loads no model. */
export async function listerModeles(url: string, fetchFn: Fetch = fetch): Promise<string[] | null> {
  try {
    const res = await fetchFn(`${url}/v1/models`, { signal: AbortSignal.timeout(TIMEOUT_SONDE_MS) });
    if (!res.ok) return null;
    return decoderListeModeles(await res.json());
  } catch {
    return null;
  }
}

/** Unloads all models (`GET /unload`). Harmless when nothing is loaded. */
export async function decharger(url: string, fetchFn: Fetch = fetch): Promise<{ ok: boolean; detail: string }> {
  try {
    const res = await fetchFn(`${url}/unload`, { signal: AbortSignal.timeout(TIMEOUT_DECHARGE_MS) });
    const corps = (await res.text().catch(() => "")).trim().slice(0, 200);
    return { ok: res.ok, detail: `${res.status}${corps ? ` ${corps}` : ""}` };
  } catch (e) {
    return { ok: false, detail: (e as Error).message };
  }
}
