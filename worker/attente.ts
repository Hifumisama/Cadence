import type { PollResult, Suivi } from "./comfyui/types";

/** Le résultat d'une attente : fini ou en erreur côté ComfyUI (jamais « en cours »), annulation demandée, ou délai écoulé. */
export type IssueAttente = Exclude<PollResult, { statut: "en_cours" }> | "annulee" | "delai";

/** L'attente d'un prompt ComfyUI, la même pour une image, un son et une vidéo : d'abord le WebSocket (il ne décide de rien, il réveille dès
 * que le prompt a fini ou que la connexion tombe), puis /history lu à intervalle régulier. La sonde du drapeau d'annulation (`surveillance`,
 * worker/annulation.ts) court en parallèle de l'attente comme du sommeil entre deux lectures : une annulation ne coûte aucune lecture de
 * base supplémentaire et n'attend pas le rythme normal. L'appelant arrête la surveillance. */
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
