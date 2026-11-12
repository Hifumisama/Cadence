/** Screenwriter's choice cards (`choix` in the output of `conversation-agent`). Pure: used by the worker (reading the output),
 * the service (checking the reply) and the screen. A malformed output is NEVER an error: `normaliserChoix` returns null, and the turn
 * is shown with its text alone. */

import type { Choix, MessageConversation, OptionChoix } from "./types";

const CHOIX_MIN = 2;
const CHOIX_MAX = 4;
const MAX_QUESTION = 200;
const MAX_LIBELLE = 60;
const MAX_DESCRIPTION = 160;

const sansAccents = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** True for the delegation option ("Je te laisse décider", ignoring case and accents). */
export const estDecider = (libelle: string): boolean => sansAccents(libelle).includes("je te laisse decider");

const texte = (v: unknown, max: number): string | undefined => {
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  if (!t) return undefined;
  return t.length > max ? t.slice(0, max).trimEnd() : t;
};

/** Validates and normalizes a `choix` output. Returns null if the shape is invalid (the choice is then ignored, without reporting anything). Rules:
 * `multiple` boolean; 2 to 4 options; non-empty label of at most 60 characters, no duplicates; one "Je te laisse décider" option;
 * optional description (truncated); optional question (ignored if it is not text). */
export function normaliserChoix(v: unknown): Choix | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const brut = v as { question?: unknown; multiple?: unknown; options?: unknown };
  if (typeof brut.multiple !== "boolean") return null;
  if (!Array.isArray(brut.options) || brut.options.length < CHOIX_MIN || brut.options.length > CHOIX_MAX) return null;

  const options: OptionChoix[] = [];
  for (const o of brut.options) {
    if (!o || typeof o !== "object" || Array.isArray(o)) return null;
    const libelleBrut = (o as { libelle?: unknown }).libelle;
    const libelle = typeof libelleBrut === "string" ? libelleBrut.trim() : "";
    if (!libelle || libelle.length > MAX_LIBELLE) return null;
    if (options.some((x) => x.libelle.toLowerCase() === libelle.toLowerCase())) return null;
    const description = texte((o as { description?: unknown }).description, MAX_DESCRIPTION);
    options.push(description ? { libelle, description } : { libelle });
  }
  if (!options.some((o) => estDecider(o.libelle))) return null;

  const question = texte(brut.question, MAX_QUESTION);
  return question ? { question, multiple: brut.multiple, options } : { multiple: brut.multiple, options };
}

/** Is a card reply acceptable for this choice? Single choice: exactly one option. Multiple choice: at least one, and
 * "Je te laisse décider" alone (it does not mix with the others). */
export function selectionValide(choix: Choix, libelles: string[]): boolean {
  if (libelles.length === 0 || new Set(libelles).size !== libelles.length) return false;
  if (!libelles.every((l) => choix.options.some((o) => o.libelle === l))) return false;
  if (!choix.multiple) return libelles.length === 1;
  return !libelles.some(estDecider) || libelles.length === 1;
}

/** The text sent to the screenwriter for a card reply: the label, or the ticked labels, in option order. */
export function formulerReponse(choix: Choix, libelles: string[]): string {
  return choix.options.map((o) => o.libelle).filter((l) => libelles.includes(l)).join(", ");
}

/** The choice of the agent's LAST message, if no message follows it: the only case where the cards still reply. */
export function choixActif(messages: MessageConversation[]): Choix | null {
  const dernier = messages[messages.length - 1];
  return dernier && dernier.role === "assistant" && dernier.choix ? dernier.choix : null;
}
