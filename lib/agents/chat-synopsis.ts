/** The synopsis the screenwriter proposes IN the chat (test feedback 2026-11-23): the FIRST milestone of the interview, before the tone, the
 * hero and the moments. 3 to 5 sentences: where we are, who the hero is, what they want, what stands in the way; never the ending (it comes
 * once the moments are laid). A card under the message with « Valider le synopsis »; the models read it as text (`contenuPourLlm`), and the
 * notes write it into `arc` on validation. Pure. */

/** Bounds: under ~40 characters it is not a synopsis; past ~1200 it is no longer 3 to 5 sentences. */
const MIN = 40;
const MAX = 1200;

/** The `synopsis` field of a turn, checked; null when absent or malformed (the message then stays text only). */
export function normaliserSynopsis(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.replace(/\s+/g, " ").trim();
  return t.length >= MIN && t.length <= MAX ? t : null;
}

/** The message the « Valider le synopsis » button sends. */
export const MESSAGE_VALIDER_SYNOPSIS = "Je valide le synopsis tel quel.";

const estValidation = (m: string): boolean => /^je valide le synopsis tel quel\.?$/i.test(m.trim());

/** The user has validated a synopsis at some point of the interview (the order then moves on to the tone). */
export const synopsisDejaValide = (messagesUtilisateur: readonly string[]): boolean => messagesUtilisateur.some(estValidation);

/** The synopsis just validated: when the user's last message is the card's validation, the text of the last card. Null otherwise. */
export function synopsisValide(messages: readonly { role: string; content: string; synopsis?: string | null }[]): string | null {
  const dernier = messages[messages.length - 1];
  if (!dernier || dernier.role !== "user" || !estValidation(dernier.content)) return null;
  return [...messages].reverse().find((x) => x.role === "assistant" && x.synopsis)?.synopsis ?? null;
}

/** The card's state: `validee` when a validation answered THIS card, `remplacee` when a later card replaced it, else `proposee`. */
export function etatSynopsis(index: number, messages: readonly { role: string; content: string; synopsis?: string | null }[]): "proposee" | "validee" | "remplacee" {
  const suivante = messages.findIndex((m, i) => i > index && m.role === "assistant" && m.synopsis);
  const fin = suivante === -1 ? messages.length : suivante;
  if (messages.slice(index + 1, fin).some((m) => m.role === "user" && estValidation(m.content))) return "validee";
  return suivante === -1 ? "proposee" : "remplacee";
}
