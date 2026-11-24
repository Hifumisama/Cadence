import { questionsPourLlm, type QuestionsCarte } from "./chat-questions";
import { SECONDES_PAR_MOMENT, momentsRequis } from "./sheet";

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
export function contenuPourLlm(m: { content: string; sequence?: SequenceProposee | null; questions?: QuestionsCarte | null; synopsis?: string | null }): string {
  let texte = m.content;
  // The proposed synopsis (lib/agents/chat-synopsis.ts): a card on screen, text for the models (the notes copy it into `arc` on validation).
  if (m.synopsis) texte += `\n\nSynopsis proposé :\n${m.synopsis}`;
  if (m.sequence?.moments.length) {
    const liste = m.sequence.moments.map((x, i) => `${i + 1}. ${x}${m.sequence!.tempsFort === i + 1 ? " (temps fort)" : ""}`).join("\n");
    texte += `\n\nSéquence proposée :\n${liste}`;
  }
  // The grouped questions (lib/agents/chat-questions.ts) are shown as a card: the models read them here.
  if (m.questions?.questions.length) texte += `\n\n${questionsPourLlm(m.questions)}`;
  return texte;
}

/** The message the « Valider la séquence » button sends (without a strong moment). */
export const MESSAGE_VALIDER_SEQUENCE = "Je valide la séquence telle quelle.";

/** The validation message, with the strong moment the user kept on the card (the AI's, or the one they clicked). */
export function messageValiderSequence(tempsFort: number | null): string {
  return tempsFort ? `Je valide la séquence telle quelle (temps fort : moment ${tempsFort}).` : MESSAGE_VALIDER_SEQUENCE;
}

/** The mark the strong moment carries in the sheet's `moments` (then the brief, the treatment, the scenes: scenario-scene keeps it in ONE fast plan). */
export const MARQUE_TEMPS_FORT = " (temps fort)";
const MARQUE_RE = /\s*\(temps fort\)\s*$/i;
export const sansMarqueTempsFort = (m: string): string => m.replace(MARQUE_RE, "");
export const estTempsFort = (m: string): boolean => MARQUE_RE.test(m);

/** The validated sequence, decided by the CODE (2026-11-18): when the user's last message is the card's validation, the moments are exactly those
 * of the last card, the strong moment marked. Null otherwise (the notes model handles the free answers). */
export function sequenceValidee(messages: readonly { role: string; content: string; sequence?: SequenceProposee | null }[]): string[] | null {
  const dernier = messages[messages.length - 1];
  if (!dernier || dernier.role !== "user") return null;
  const m = /^je valide la s[ée]quence telle quelle(?:\s*\(temps fort\s*:\s*moment\s*(\d+)\))?\.?$/i.exec(dernier.content.trim());
  if (!m) return null;
  const carte = [...messages].reverse().find((x) => x.role === "assistant" && x.sequence?.moments.length)?.sequence;
  if (!carte) return null;
  const rang = m[1] ? Number(m[1]) : carte.tempsFort;
  return carte.moments.map((x, i) => (rang === i + 1 ? `${sansMarqueTempsFort(x)}${MARQUE_TEMPS_FORT}` : sansMarqueTempsFort(x)));
}

const norme = (s: string) => sansMarqueTempsFort(s).normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/\s+/g, " ").trim();

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

/** The material gauge under the sequence card (2026-11-18, mock-up C7): how many seconds the moments cover (one moment per ~10 s, the rule
 * that also holds the interview open: `momentsRequis`) against the target duration. Null when the duration is unknown. */
export type Matiere = { couvertes: number; visees: number; cases: number; pleines: number; manquants: number };
export function matiere(nbMoments: number, dureeSecondes: unknown): Matiere | null {
  const requis = momentsRequis(dureeSecondes);
  if (!requis) return null;
  const visees = dureeSecondes as number;
  return {
    couvertes: nbMoments * SECONDES_PAR_MOMENT,
    visees,
    cases: Math.max(requis, nbMoments),
    pleines: nbMoments,
    manquants: Math.max(0, requis - nbMoments),
  };
}

/** The message « Propose-moi la suite » sends. */
export function messageProposerSuite(m: Matiere): string {
  return `Propose-moi la suite : il manque ${m.manquants} moment${m.manquants > 1 ? "s" : ""} (environ ${m.manquants * SECONDES_PAR_MOMENT} s) pour tenir la durée. Garde les moments déjà là et ajoute la suite.`;
}
