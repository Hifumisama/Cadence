/** Annulation des tâches ComfyUI — règles pures, sans base ni réseau, partagées par
 * l'action serveur (app/taches/actions.ts), le worker (worker/annulation.ts) et le
 * panneau. Une tâche EN ATTENTE s'annule directement ; une tâche EN COURS reçoit un
 * drapeau (`annulation_demandee_at`) et c'est le worker qui interrompt ComfyUI. */

/** Erreur d'une vidéo annulée : pas de statut d'enum de plus (job_statut est un
 * enum Postgres), une vidéo annulée finit `echoue` avec ce message. */
export const ERREUR_ANNULEE = "Annulée";

/** Où en est un prompt côté ComfyUI. `inconnu` = on n'a pas pu le savoir (serveur
 * injoignable, réponse illisible) : jamais une raison d'interrompre. */
export type EtatDansLaFile = "en_cours" | "en_file" | "absent" | "inconnu";

/** Décodage tolérant de `GET /queue`. ComfyUI renvoie
 * `{ queue_running: [...], queue_pending: [...] }` ; chaque élément est un tuple
 * `[numero, prompt_id, graphe, extra_data, sorties]` (même forme que l'historique,
 * relevée sur le serveur de l'utilisateur), mais on accepte aussi un objet portant
 * `prompt_id` / `id`, au cas où le format évoluerait. */
export function etatDansLaFile(queue: unknown, promptId: string): EtatDansLaFile {
  if (!queue || typeof queue !== "object") return "inconnu";
  const q = queue as Record<string, unknown>;
  if (!Array.isArray(q.queue_running) || !Array.isArray(q.queue_pending)) return "inconnu";
  const idDe = (item: unknown): string | null => {
    if (Array.isArray(item)) return typeof item[1] === "string" ? item[1] : null;
    if (item && typeof item === "object") {
      const o = item as Record<string, unknown>;
      const id = o.prompt_id ?? o.id;
      return typeof id === "string" ? id : null;
    }
    return null;
  };
  if (q.queue_running.some((i) => idDe(i) === promptId)) return "en_cours";
  if (q.queue_pending.some((i) => idDe(i) === promptId)) return "en_file";
  return "absent";
}

export type GestePourAnnuler = "interrompre" | "retirer" | "rien" | "reessayer";

/** Que faire côté ComfyUI pour annuler ce prompt ?
 * - en cours chez nous ET chez lui → `interrompre` (POST /interrupt : il coupe ce
 *   qui tourne sur TOUT le serveur, d'où la vérification préalable) ;
 * - encore en file → `retirer` (POST /queue {delete}) ;
 * - ni l'un ni l'autre → `rien` (déjà fini, ou jamais arrivé) ;
 * - on ne sait pas → `reessayer`, jamais d'interruption à l'aveugle (un job lancé à
 *   la main par l'utilisateur pourrait être celui qui tourne). */
export function gestePourAnnuler(etat: EtatDansLaFile): GestePourAnnuler {
  switch (etat) {
    case "en_cours":
      return "interrompre";
    case "en_file":
      return "retirer";
    case "absent":
      return "rien";
    default:
      return "reessayer";
  }
}

/** Statut du plan quand son job vidéo est annulé : on le remet dans l'état de sa
 * dernière réussite (un rendu final « termine », une prévisualisation
 * « previsualise », comme le worker les pose), sinon « brouillon ». `precedents` =
 * les autres jobs du plan, du plus récent au plus ancien. */
export function statutPlanApresAnnulation(
  precedents: { statut: string; activerUpscale: boolean }[],
): "termine" | "previsualise" | "brouillon" {
  const dernier = precedents.find((j) => j.statut === "termine");
  if (!dernier) return "brouillon";
  return dernier.activerUpscale ? "termine" : "previsualise";
}

/** Vue d'une tâche pour la décision d'annuler. */
export type AnnulableVue = { statut: string; annulationDemandeeAt: Date | string | null };

/** Ce que fait une demande d'annulation :
 * - `directe` : en attente, on l'annule tout de suite ;
 * - `drapeau` : en cours, on pose le drapeau (le worker agit) ;
 * - `deja` : drapeau déjà posé (idempotent) ;
 * - `rien` : déjà finie, échouée ou annulée. */
export function actionAnnulation(t: AnnulableVue): "directe" | "drapeau" | "deja" | "rien" {
  if (t.statut === "en_attente") return "directe";
  if (t.statut === "en_cours") return t.annulationDemandeeAt ? "deja" : "drapeau";
  return "rien";
}

/** Une tâche à purger : échouée ou annulée depuis plus de `seuilMs`. Jamais une
 * tâche terminée (les candidats suivent la règle des 8 par asset) ni une active. */
export const SEUIL_PURGE_ECHECS_MS = 24 * 3600 * 1000;

export function estPurgeable(
  t: { statut: string; finishedAt: Date | null; createdAt: Date },
  maintenant: Date,
  seuilMs: number = SEUIL_PURGE_ECHECS_MS,
): boolean {
  if (t.statut !== "echoue" && t.statut !== "annulee") return false;
  const fin = (t.finishedAt ?? t.createdAt).getTime();
  return maintenant.getTime() - fin > seuilMs;
}
