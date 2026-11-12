/** Cancellation of ComfyUI tasks — pure rules, without database or network, shared by
 * the server action (app/taches/actions.ts), the worker (worker/cancellation.ts) and the
 * panel. A PENDING task is cancelled directly; an IN-PROGRESS task receives a
 * flag (`annulation_demandee_at`) and it is the worker that interrupts ComfyUI. */

/** Error of a cancelled video: no extra enum status (job_statut is a
 * Postgres enum), a cancelled video ends `echoue` with this message. */
export const ERREUR_ANNULEE = "Annulée";

/** Where a prompt stands on the ComfyUI side. `inconnu` = we could not know (server
 * unreachable, unreadable response): never a reason to interrupt. */
export type EtatDansLaFile = "en_cours" | "en_file" | "absent" | "inconnu";

/** Tolerant decoding of `GET /queue`. ComfyUI returns
 * `{ queue_running: [...], queue_pending: [...] }`; each item is a tuple
 * `[numero, prompt_id, graphe, extra_data, sorties]` (same shape as the history,
 * observed on the user's server), but we also accept an object carrying
 * `prompt_id` / `id`, in case the format evolves. */
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

/** What to do on the ComfyUI side to cancel this prompt?
 * - running on our side AND on its side → `interrompre` (POST /interrupt: it cuts what runs on the WHOLE server, hence the prior check);
 * - still in the queue → `retirer` (POST /queue {delete});
 * - neither → `rien` (already finished, or never arrived);
 * - we do not know → `reessayer`, never an interruption blindly (a job launched by hand by the user could be the one running). */
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

/** Status of the clip when its video job is cancelled: it goes back to the state of its
 * last success (a final render « termine », a preview « previsualise », as the worker sets them), otherwise « brouillon ». `precedents` =
 * the other jobs of the clip, from most recent to oldest. */
export function statutPlanApresAnnulation(
  precedents: { statut: string; activerUpscale: boolean }[],
): "termine" | "previsualise" | "brouillon" {
  const dernier = precedents.find((j) => j.statut === "termine");
  if (!dernier) return "brouillon";
  return dernier.activerUpscale ? "termine" : "previsualise";
}

/** A task to purge: failed or cancelled for more than `seuilMs`. Never a
 * finished task (candidates follow the rule of 8 per asset) nor an active one. */
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
