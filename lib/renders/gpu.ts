/** (Revised 2026-10-16: the two domains coexist in VRAM on 16 GB, the worker has one loop per lane; the `WORKER_VOIES=serie` mode
 * was removed on 2026-10-20; what follows describes its original operation.)
 *
 * The GPU as a single resource — pure rules (no database nor network), shared
 * by the worker's scheduler, the reading of tasks (lib/tasks/tasks.ts) and the tests.
 *
 * ComfyUI (images, video) and the local LLM (llama.cpp behind llama-swap) run
 * on the SAME machine and do not fit together in VRAM: the worker therefore does
 * only one thing at a time, all kinds combined, and frees the other side when
 * it changes domain (worker/gpu.ts). See docs/FRICTIONS.md (« Ressource GPU
 * unique »). */

export type GenreTache = "image" | "llm" | "video";

/** The two sides that fight over VRAM. */
export type DomaineGpu = "comfyui" | "llm";

export const DOMAINE_GENRE: Record<GenreTache, DomaineGpu> = {
  image: "comfyui",
  video: "comfyui",
  llm: "llm",
};

export const domaineDe = (genre: GenreTache): DomaineGpu => DOMAINE_GENRE[genre];

/** Taking order, smaller = higher priority: short tasks first
 * (an image is redone in seconds, an LLM call lasts 1 to 3 min, a video 1 min 30
 * to 4 min). Two kinds can share a tier: then the domain of the previous
 * task breaks the tie (fewer model reloads). */
export const PRIORITE_GENRE: Record<GenreTache, number> = { image: 0, llm: 1, video: 2 };

/** Which domain to unload before launching a task of the domain `prochain`?
 * - same domain as the previous task: nothing (the models are already there);
 * - different domain: we unload the OTHER domain (the one that has just served);
 * - previous unknown (worker that has just started): we unload the other domain
 *   out of caution, it is harmless when it is already empty (one extra call). */
export function domaineAliberer(dernier: DomaineGpu | null, prochain: DomaineGpu): DomaineGpu | null {
  if (dernier === prochain) return null;
  return prochain === "llm" ? "comfyui" : "llm";
}
