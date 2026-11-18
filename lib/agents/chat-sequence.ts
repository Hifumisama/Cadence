/** The sequence the screenwriter proposes IN the chat (2026-11-18, mock-up « Maquettes entretien »): a card under its message, with
 * « Valider la séquence ». The moments travel in their own field of the turn (`sequence`), never in the text, so the card is the only list shown;
 * once the user validates, the notes take that exact list (one source, no more diverging lists). The models still read it: the conversation
 * history given to them carries it as text (`contenuPourLlm`). Pure. */

export type SequenceProposee = {
  /** The moments in order, one short French sentence each. */
  moments: string[];
  /** 1-based rank of the strong moment (highlighted), or null. */
  tempsFort: number | null;
};

/** Bounds: a sequence is at least two moments; past 40 it is no longer an interview proposal (a 10-minute film is told in sequences). */
const MIN_MOMENTS = 2;
const MAX_MOMENTS = 40;

/** The `sequence` field of a turn, checked; null when absent or malformed (the message then stays text only). */
export function normaliserSequence(v: unknown): SequenceProposee | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const o = v as { moments?: unknown; tempsFort?: unknown };
  if (!Array.isArray(o.moments)) return null;
  const moments = o.moments.filter((m): m is string => typeof m === "string").map((m) => m.replace(/^\s*\d+\s*[.)]\s*/, "").trim()).filter(Boolean);
  if (moments.length < MIN_MOMENTS || moments.length > MAX_MOMENTS) return null;
  const t = o.tempsFort;
  const tempsFort = typeof t === "number" && Number.isInteger(t) && t >= 1 && t <= moments.length ? t : null;
  return { moments, tempsFort };
}

/** A message as the models read it: its text, then the proposed sequence as a numbered list (the notes copy it on validation). */
export function contenuPourLlm(m: { content: string; sequence?: SequenceProposee | null }): string {
  if (!m.sequence?.moments.length) return m.content;
  const liste = m.sequence.moments.map((x, i) => `${i + 1}. ${x}${m.sequence!.tempsFort === i + 1 ? " (temps fort)" : ""}`).join("\n");
  return `${m.content}\n\nSéquence proposée :\n${liste}`;
}

/** The message the « Valider la séquence » button sends. */
export const MESSAGE_VALIDER_SEQUENCE = "Je valide la séquence telle quelle.";

const norme = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/\s+/g, " ").trim();

/** The card's state: `validee` when the notes hold this very list as settled, `remplacee` when a later card replaced it, else `proposee`. */
export function etatSequence(
  sequence: SequenceProposee,
  derniere: boolean,
  notes: { moments: string[]; tranche: boolean },
): "proposee" | "validee" | "remplacee" {
  const memes = notes.moments.length === sequence.moments.length && notes.moments.every((m, i) => norme(m) === norme(sequence.moments[i]!));
  if (notes.tranche && memes) return "validee";
  return derniere ? "proposee" : "remplacee";
}
