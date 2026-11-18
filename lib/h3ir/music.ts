/** The film's score on every clip (2026-11-17, bench essais/mouvement/musique.ts, T14). Open H3 IR wrote a different `non_diegetic_music` on
 * each clip (orchestra, then solo piano, then orchestra) and most of them stopped two seconds before the end: a « suite » clip takes up the
 * previous clip's audio through the latent, then its own sheet contradicted it. With ONE description copied on a chain of linked clips, the
 * music goes on across the joins and sounds like a single piece. The description comes from the brief (`musique`); the code adds what makes
 * it continuous and keeps it under the sound effects (it took too much room in the bench). Pure. */

/** What the code appends: no start, no end, mixed under the sound effects and ambience. */
export const CONSIGNE_CONTINUITE_MUSIQUE =
  "It is already playing at the first frame and still playing at the last frame, with no fade-in, no fade-out and no pause. It is mixed low, under the sound effects and the ambience.";

/** Phrases about the score starting or stopping, which the brief's description must not carry (the code decides). */
const DEBUT_OU_FIN = /[^.]*\b(?:enters?|starts?|begins?|drops? out|fades?(?: in| out)?|stops?|ends?|cuts? out|silence|unscored)\b[^.]*\.?/gi;

/** The `non_diegetic_music` section for a clip, from the brief's description; `null` when the brief has none (the compiled text stays). */
export function musiqueDePlan(musiqueBrief: unknown): string | null {
  if (typeof musiqueBrief !== "string") return null;
  const propre = musiqueBrief.replace(DEBUT_OU_FIN, "").replace(/\s+/g, " ").trim();
  if (!propre) return null;
  return `${/[.!?]$/.test(propre) ? propre : `${propre}.`} ${CONSIGNE_CONTINUITE_MUSIQUE}`;
}
