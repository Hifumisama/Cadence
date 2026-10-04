/** Petit client de llama-swap, le proxy qui charge/décharge les modèles de
 * llama.cpp à la demande (voir docs/CONCEPTION_AGENTS.md). Le worker s'en sert pour
 * deux choses que le fournisseur LLM (lib/llm/) ignore : savoir si le serveur est là
 * avant de prendre une tâche, et décharger les modèles de la VRAM avant que ComfyUI
 * reprenne le GPU (lib/gpu.ts).
 *
 * Tout est « au mieux » et ne rejette jamais : un échec se lit dans le résultat.
 * Les routes `/health`, `/running` et `/unload` sont celles de llama-swap
 * (README du projet) ; leur forme exacte est vérifiée sur le serveur de
 * l'utilisateur, voir docs/FRICTIONS.md (« Ressource GPU unique »). */

type Fetch = typeof fetch;

const TIMEOUT_SONDE_MS = 5_000;
const TIMEOUT_DECHARGE_MS = 30_000; // /unload attend que les processus s'arrêtent

/** Le serveur répond-il ? (`GET /health`, « OK » chez llama-swap ; autre route via `LLM_HEALTH_PATH`).
 * Ne charge aucun modèle. */
export async function llmJoignable(url: string, fetchFn: Fetch = fetch, route = "/health"): Promise<boolean> {
  try {
    const res = await fetchFn(`${url}${route}`,{ signal: AbortSignal.timeout(TIMEOUT_SONDE_MS) });
    return res.ok;
  } catch {
    return false;
  }
}

/** Modèles actuellement chargés (`GET /running`), ou null si on ne peut pas le
 * savoir. Décodage tolérant : `{ running: [{ model, state }] }` ou une liste simple. */
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

/** Décharge tous les modèles (`GET /unload`). Inoffensif quand rien n'est chargé. */
export async function decharger(url: string, fetchFn: Fetch = fetch): Promise<{ ok: boolean; detail: string }> {
  try {
    const res = await fetchFn(`${url}/unload`, { signal: AbortSignal.timeout(TIMEOUT_DECHARGE_MS) });
    const corps = (await res.text().catch(() => "")).trim().slice(0, 200);
    return { ok: res.ok, detail: `${res.status}${corps ? ` ${corps}` : ""}` };
  } catch (e) {
    return { ok: false, detail: (e as Error).message };
  }
}
