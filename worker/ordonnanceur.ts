import { DOMAINE_GENRE, PRIORITE_GENRE, type DomaineGpu, type GenreTache } from "../lib/gpu";

/** Ordre de prise des tâches du worker. Une seule carte graphique partagée entre
 * ComfyUI et le LLM local : le worker ne fait qu'une chose à la fois, il choisit
 * donc la prochaine à chaque tour.
 *
 * - **Image avant LLM avant vidéo** : les tâches courtes d'abord. Pendant la
 *   journée (itérations), une image ne doit pas attendre derrière un plan H3 en
 *   file ; un appel LLM (1 à 3 min) passe avant une vidéo (1 min 30 à 4 min) ; la
 *   nuit, la file vidéo se vide (F04).
 * - **Même domaine à égalité de palier** : si deux genres partageaient un palier,
 *   celui du domaine GPU de la tâche précédente passerait d'abord (pas de
 *   déchargement/rechargement inutile). Avec l'ordre actuel chaque genre a son
 *   palier : ce critère ne tranche que des tâches de même genre, donc de même
 *   domaine — il est là pour le jour où l'on regroupe deux genres dans un palier.
 * - **FIFO à égalité** : à genre égal, la plus ancienne d'abord (puis `id`).
 * - **Sans préemption** : ce choix ne se fait qu'entre deux tâches. Une vidéo en
 *   cours n'est jamais coupée, et une tâche qui arrive pendant ce temps attend sa
 *   fin (jusqu'à 30 min pour une vidéo, voir DUREE_MAX_POLL_MS du worker). Pas de
 *   famine : seules des tâches NOUVELLES peuvent en dépasser une, jamais une plus
 *   ancienne d'un même genre ; une vidéo passe dès qu'il n'y a plus d'image ni
 *   d'appel LLM en attente. */

export type { DomaineGpu, GenreTache };

export type TacheEnAttente = { genre: GenreTache; id: number; createdAt: Date };

export function comparerTaches(a: TacheEnAttente, b: TacheEnAttente, precedent: DomaineGpu | null = null): number {
  const collant = (t: TacheEnAttente) => (precedent != null && DOMAINE_GENRE[t.genre] === precedent ? 0 : 1);
  return (
    PRIORITE_GENRE[a.genre] - PRIORITE_GENRE[b.genre] ||
    collant(a) - collant(b) ||
    a.createdAt.getTime() - b.createdAt.getTime() ||
    a.id - b.id ||
    a.genre.localeCompare(b.genre)
  );
}

/** La prochaine tâche à traiter parmi celles en attente, ou null s'il n'y en a pas.
 * `precedent` = domaine GPU de la tâche qui vient de finir (null = inconnu). */
export function choisirProchaineTache(enAttente: TacheEnAttente[], precedent: DomaineGpu | null = null): TacheEnAttente | null {
  if (enAttente.length === 0) return null;
  return [...enAttente].sort((a, b) => comparerTaches(a, b, precedent))[0] ?? null;
}
