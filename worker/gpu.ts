import { domaineAliberer, type DomaineGpu } from "../lib/renders/gpu";

/** Freeing VRAM on a domain change (see lib/renders/gpu.ts): before an
 * LLM task we ask ComfyUI to unload its models; before a
 * ComfyUI task, llama-swap to unload its own.
 *
 * "Au mieux" (best effort): a failure is logged, NEVER prevents the task and never blocks
 * the worker (bounded delay). The "dernier domaine utilisé" state lives in memory
 * of the worker (worker/index.ts): at startup it is unknown, so the first
 * domain change unloads the other side out of caution. */

export type Liberateurs = {
  /** POST /free on ComfyUI. */
  comfyui: () => Promise<boolean>;
  /** GET /unload on llama-swap. */
  llm: () => Promise<{ ok: boolean; detail: string }>;
};

const DELAI_MAX_MS = 40_000;

function avecDelai<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`délai de ${Math.round(ms / 1000)} s dépassé`)), ms);
    t.unref?.();
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

/** Frees the other domain if needed; returns the unloaded domain (or null).
 * Never throws. */
export async function libererAvant(
  dernier: DomaineGpu | null,
  prochain: DomaineGpu,
  lib: Liberateurs,
  journal: (message: string) => void = console.log,
  delaiMs: number = DELAI_MAX_MS,
): Promise<DomaineGpu | null> {
  const aLiberer = domaineAliberer(dernier, prochain);
  if (!aLiberer) return null;
  const qui = aLiberer === "comfyui" ? "ComfyUI" : "llama-swap";
  const contexte = dernier == null ? "démarrage, domaine précédent inconnu" : `${dernier} → ${prochain}`;
  try {
    if (aLiberer === "comfyui") {
      const ok = await avecDelai(lib.comfyui(), delaiMs);
      journal(`[worker] GPU (${contexte}) : mémoire ${qui} ${ok ? "libérée" : "NON libérée (refusée), on continue"}`);
    } else {
      const r = await avecDelai(lib.llm(), delaiMs);
      journal(`[worker] GPU (${contexte}) : modèles ${qui} ${r.ok ? "déchargés" : "NON déchargés"} (${r.detail})${r.ok ? "" : ", on continue"}`);
    }
  } catch (e) {
    journal(`[worker] GPU (${contexte}) : libération ${qui} impossible (${(e as Error).message}), on continue`);
  }
  return aLiberer;
}
