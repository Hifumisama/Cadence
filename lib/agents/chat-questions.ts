/** The screenwriter's grouped questions IN the chat (2026-11-18, mock-up C2): one subject per card, up to three questions, each with optional
 * quick answers (Oui / Non, or short choices) and ALWAYS a free « Autre » field; one « Répondre » button sends everything as one message
 * (« 1. … 2. … »). The questions travel in their own field of the turn (`questions`), not in the text; the models read them in the history as a
 * numbered list (`questionsPourLlm`). Pure. */

export type QuestionCarte = { question: string; /** 0 to 4 quick answers (short labels). */ reponses: string[] };
export type QuestionsCarte = { /** The subject, as a short title (« La fin »). */ sujet: string; questions: QuestionCarte[] };

export const MAX_QUESTIONS = 3;
export const MAX_REPONSES_RAPIDES = 4;
const MAX_LIBELLE = 80;
const MAX_QUESTION = 240;

const net = (v: unknown, max: number): string => (typeof v === "string" ? v.replace(/\s+/g, " ").replace(/^\s*\d+\s*[.)]\s*/, "").trim().slice(0, max) : "");

/** The `questions` field of a turn, checked; null when absent or malformed (the message then stays text only). Duplicated or empty quick
 * answers are dropped; an « Autre » quick answer is dropped too (the free field is always there). */
export function normaliserQuestions(v: unknown): QuestionsCarte | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const o = v as { sujet?: unknown; questions?: unknown };
  if (!Array.isArray(o.questions)) return null;
  const questions = o.questions
    .map((q): QuestionCarte | null => {
      const x = (q && typeof q === "object" ? q : {}) as { question?: unknown; reponses?: unknown };
      const question = net(x.question, MAX_QUESTION);
      if (!question) return null;
      const reponses = (Array.isArray(x.reponses) ? x.reponses : [])
        .map((r) => net(r, MAX_LIBELLE))
        .filter((r, i, l) => r && !/^autre\b/i.test(r) && l.indexOf(r) === i)
        .slice(0, MAX_REPONSES_RAPIDES);
      return { question, reponses };
    })
    .filter((q): q is QuestionCarte => q !== null)
    .slice(0, MAX_QUESTIONS);
  if (!questions.length) return null;
  return { sujet: net(o.sujet, MAX_LIBELLE) || "Questions", questions };
}

/** A message's questions as the models read them (appended to its text). */
export function questionsPourLlm(q: QuestionsCarte): string {
  const lignes = q.questions.map((x, i) => `${i + 1}. ${x.question}${x.reponses.length ? ` (réponses proposées : ${x.reponses.join(" / ")})` : ""}`);
  return `Questions (${q.sujet}) :\n${lignes.join("\n")}`;
}

/** The message « Répondre » sends: each answered question on its line, numbered, with the question recalled so that the answer reads alone.
 * `reponses[i]`: the quick answer picked or the « Autre » text (empty: left for later, not sent). Null when nothing is answered. */
export function messageReponses(q: QuestionsCarte, reponses: readonly string[]): string | null {
  const lignes = q.questions
    .map((x, i) => ({ i, question: x.question, reponse: (reponses[i] ?? "").replace(/\s+/g, " ").trim() }))
    .filter((x) => x.reponse)
    // The subject heads each line: a quote proves only what it names (« Des plis marqués » alone did not prove the letter, project 265).
    .map((x) => `${x.i + 1}. ${q.sujet} — ${x.question.replace(/\s*\?$/, " ?")} ${x.reponse}`);
  return lignes.length ? lignes.join("\n") : null;
}
