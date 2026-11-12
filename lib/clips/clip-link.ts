/** Link of a clip with the PREVIOUS one of the episode (2026-10-14). Only two values:
 *  - « suite »: the clip picks up where the other ends (same place, roughly the same instant): its render extends that of the previous one (lib/renders/video-steps.ts);
 *  - « coupe »: clean break (other place, other moment): it opens freely, without a continuity to reproduce.
 * The screenplay sets it for each clip (a clip is not described relative to another: the link is its only tie); the user changes it
 * by hand. No layout rule here: it is the clip that says whether it chains or cuts. */

const LIAISONS = ["suite", "coupe"] as const;
export type Liaison = (typeof LIAISONS)[number];

const LIAISON_PAR_DEFAUT: Liaison = "suite";

export const estLiaison = (v: unknown): v is Liaison => typeof v === "string" && (LIAISONS as readonly string[]).includes(v);

/** The link of any value (column, model output): the value if it is known, otherwise « suite » (behaviour from before). */
export const liaisonOuDefaut = (v: unknown): Liaison => (estLiaison(v) ? v : LIAISON_PAR_DEFAUT);
