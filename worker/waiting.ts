import type { PollResult, Suivi } from "./comfyui/types";

/** The result of a wait: finished or in error on the ComfyUI side (never « en cours »), cancellation requested, or delay elapsed. */
export type IssueAttente = Exclude<PollResult, { statut: "en_cours" }> | "annulee" | "delai";

/** The wait for a ComfyUI prompt, the same for an image, a sound and a video: first the WebSocket (it decides nothing, it wakes up as soon as
 * the prompt has finished or the connection drops), then /history read at a regular interval. The cancellation flag probe (`surveillance`,
 * worker/cancellation.ts) runs in parallel with the wait, as well as with the sleep between two reads: a cancellation costs no extra
 * database read and does not wait for the normal rhythm. The caller stops the surveillance. */
export async function attendreResultat(opts: {
  suivi: Suivi | null;
  promptId: string;
  delaiMs: number;
  intervalleMs: number;
  lire: () => Promise<PollResult>;
  surveillance: { promesse: Promise<"annulee"> };
}): Promise<IssueAttente> {
  let annulee = false;
  void opts.surveillance.promesse.then(() => {
    annulee = true;
  });

  if (opts.suivi) {
    const issue = await Promise.race([opts.suivi.attendre(opts.promptId, opts.delaiMs), opts.surveillance.promesse]);
    if (issue === "annulee") return "annulee";
  }

  const debut = Date.now();
  while (Date.now() - debut < opts.delaiMs) {
    if (annulee) return "annulee";
    const r = await opts.lire();
    if (r.statut !== "en_cours") return r;
    await Promise.race([new Promise((res) => setTimeout(res, opts.intervalleMs)), opts.surveillance.promesse]);
  }
  return "delai";
}
