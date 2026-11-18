import type { IntentionMusique } from "../projects/design";

/** The film's score on every clip (2026-11-17, bench essais/mouvement/musique.ts, T14). Open H3 IR wrote a different `non_diegetic_music` on
 * each clip (orchestra, then solo piano, then orchestra) and most of them stopped two seconds before the end: a « suite » clip takes up the
 * previous clip's audio through the latent, then its own sheet contradicted it. With ONE description copied on a chain of linked clips, the
 * music goes on across the joins and sounds like a single piece. The description comes from the brief (`musique`); the code adds what makes
 * it continuous and keeps it under the sound effects (it took too much room in the bench). Pure. */

/** What the code appends: no start, no end, mixed under the sound effects and ambience (music « discrète », and projects designed before
 * the music intention existed). */
export const CONSIGNE_CONTINUITE_MUSIQUE =
  "It is already playing at the first frame and still playing at the last frame, with no fade-in, no fade-out and no pause. It is mixed low, under the sound effects and the ambience.";
/** The same for a score that carries the film (music « présente »): still under the dialogue. */
export const CONSIGNE_CONTINUITE_MUSIQUE_PRESENTE =
  "It is already playing at the first frame and still playing at the last frame, with no fade-in, no fade-out and no pause. It is clearly present in the mix, above the ambience, under the dialogue.";

/** A section that says « no music ». */
export const estSansMusique = (texte: unknown): boolean => typeof texte === "string" && /^\s*(?:n\/?a|none|no music)\.?\s*$/i.test(texte);

/** Phrases about the score starting or stopping, which the brief's description must not carry (the code decides). */
const DEBUT_OU_FIN = /[^.]*\b(?:enters?|starts?|begins?|drops? out|fades?(?: in| out)?|stops?|ends?|cuts? out|silence|unscored)\b[^.]*\.?/gi;

/** The `non_diegetic_music` section for a clip, from the brief's description; `null` when the brief has none, or says « no music »
 * (the compiled text stays: see `sectionMusique`). */
export function musiqueDePlan(musiqueBrief: unknown, intention?: IntentionMusique): string | null {
  if (typeof musiqueBrief !== "string" || estSansMusique(musiqueBrief)) return null;
  const propre = musiqueBrief.replace(DEBUT_OU_FIN, "").replace(/\s+/g, " ").trim();
  if (!propre) return null;
  const consigne = intention === "presente" ? CONSIGNE_CONTINUITE_MUSIQUE_PRESENTE : CONSIGNE_CONTINUITE_MUSIQUE;
  return `${/[.!?]$/.test(propre) ? propre : `${propre}.`} ${consigne}`;
}

/** The final `non_diegetic_music` of a clip (2026-11-18):
 * - the user wants no music (intention « aucune », or the brief says N/A): « N/A », whatever the creativity;
 * - the compiled section is empty or N/A (creativity « Sobre »): it stays as it is;
 * - otherwise the brief's description, the same on every clip (`musiqueDePlan`), or the compiled text when the brief has none. Pure. */
export function sectionMusique(compilee: string, musiqueBrief: unknown, intention?: IntentionMusique): string {
  if (intention === "aucune" || estSansMusique(musiqueBrief)) return "N/A";
  if (!compilee.trim() || estSansMusique(compilee)) return compilee;
  return musiqueDePlan(musiqueBrief, intention) ?? compilee;
}
