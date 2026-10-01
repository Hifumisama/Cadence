/** Le GPU comme ressource unique — règles pures (sans base ni réseau), partagées
 * par l'ordonnanceur du worker, la lecture des tâches (lib/taches.ts) et les tests.
 *
 * ComfyUI (images, vidéo) et le LLM local (llama.cpp derrière llama-swap) tournent
 * sur la MÊME machine et ne tiennent pas ensemble en VRAM : le worker ne fait donc
 * qu'une chose à la fois, tous genres confondus, et libère l'autre côté quand il
 * change de domaine (worker/gpu.ts). Voir docs/FRICTIONS.md (« Ressource GPU
 * unique »). */

export type GenreTache = "image" | "llm" | "video";

/** Les deux côtés qui se disputent la VRAM. */
export type DomaineGpu = "comfyui" | "llm";

export const DOMAINE_GENRE: Record<GenreTache, DomaineGpu> = {
  image: "comfyui",
  video: "comfyui",
  llm: "llm",
};

export const domaineDe = (genre: GenreTache): DomaineGpu => DOMAINE_GENRE[genre];

/** Ordre de prise, plus petit = plus prioritaire : les tâches courtes d'abord
 * (une image se refait en secondes, un appel LLM dure 1 à 3 min, une vidéo 1 min 30
 * à 4 min). Deux genres peuvent partager un palier : c'est alors le domaine de la
 * tâche précédente qui départage (moins de rechargements de modèles). */
export const PRIORITE_GENRE: Record<GenreTache, number> = { image: 0, llm: 1, video: 2 };

/** Quel domaine décharger avant de lancer une tâche du domaine `prochain` ?
 * - même domaine que la tâche précédente : rien (les modèles sont déjà là) ;
 * - domaine différent : on décharge l'AUTRE domaine (celui qui vient de servir) ;
 * - précédent inconnu (worker qui vient de démarrer) : on décharge l'autre domaine
 *   par prudence, c'est inoffensif quand il est déjà vide (un appel de plus). */
export function domaineAliberer(dernier: DomaineGpu | null, prochain: DomaineGpu): DomaineGpu | null {
  if (dernier === prochain) return null;
  return prochain === "llm" ? "comfyui" : "llm";
}
