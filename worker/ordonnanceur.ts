/** Ordre de prise des tâches du worker. Une seule carte graphique : le worker
 * ne fait qu'une chose à la fois, il choisit donc la prochaine à chaque tour.
 *
 * - **Images avant vidéo** : une image se refait en quelques secondes, une vidéo
 *   dure des minutes. Pendant la journée (itérations), les images ne doivent pas
 *   attendre derrière un plan H3 en file ; la nuit, la file vidéo se vide (F04).
 * - **FIFO à égalité** : à genre égal, la plus ancienne d'abord (puis `id`).
 * - **Sans préemption** : ce choix ne se fait qu'entre deux tâches. Une vidéo en
 *   cours n'est jamais coupée, et une image qui arrive pendant ce temps attend sa
 *   fin (jusqu'à 30 min, voir DUREE_MAX_POLL_MS du worker). */

export type GenreTache = "image" | "video";

export type TacheEnAttente = { genre: GenreTache; id: number; createdAt: Date };

/** Plus petit = plus prioritaire. */
const PRIORITE: Record<GenreTache, number> = { image: 0, video: 1 };

export function comparerTaches(a: TacheEnAttente, b: TacheEnAttente): number {
  return (
    PRIORITE[a.genre] - PRIORITE[b.genre] ||
    a.createdAt.getTime() - b.createdAt.getTime() ||
    a.id - b.id
  );
}

/** La prochaine tâche à traiter parmi celles en attente, ou null s'il n'y en a pas. */
export function choisirProchaineTache(enAttente: TacheEnAttente[]): TacheEnAttente | null {
  if (enAttente.length === 0) return null;
  return [...enAttente].sort(comparerTaches)[0] ?? null;
}
