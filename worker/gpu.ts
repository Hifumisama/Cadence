import { domaineAliberer, type DomaineGpu } from "../lib/gpu";

/** Libération de la VRAM au changement de domaine (voir lib/gpu.ts) : avant une
 * tâche LLM on demande à ComfyUI de décharger ses modèles ; avant une tâche
 * ComfyUI, à llama-swap de décharger les siens.
 *
 * « Au mieux » : un échec est journalisé, n'empêche JAMAIS la tâche et ne bloque
 * jamais le worker (délai borné). L'état « dernier domaine utilisé » vit en mémoire
 * du worker (worker/index.ts) : au démarrage il est inconnu, donc le premier
 * changement de domaine décharge l'autre côté par prudence. */

export type Liberateurs = {
  /** POST /free sur ComfyUI. */
  comfyui: () => Promise<boolean>;
  /** GET /unload sur llama-swap. */
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

/** Libère l'autre domaine si besoin ; renvoie le domaine déchargé (ou null).
 * Ne lève jamais. */
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
