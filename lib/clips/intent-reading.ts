/** A clip's text formatted as a screenplay for the Reading view: action paragraphs and lines of dialogue. Pure, tested.
 *
 * A line `NOM : « texte »` is a line of dialogue (the same pattern as lib/clips/intent.ts and lib/h3ir/brief.ts); the rest, grouped by paragraphs (a blank line
 * separates two paragraphs), is action. Nothing is rewritten: the formatting is display, editing always happens on the raw text. */

export type BlocLecture = { type: "action"; texte: string } | { type: "replique"; perso: string; texte: string };

const REPLIQUE = /^[ \t  ]*([^:«»\n]{1,60}?)[ \t  ]*:[ \t  ]*«[ \t  ]*([\s\S]*?)[ \t  ]*»[ \t  ]*$/;

export function blocsDeLecture(intent: string | null | undefined): BlocLecture[] {
  const blocs: BlocLecture[] = [];
  let paragraphe: string[] = [];
  const vider = () => {
    if (paragraphe.length > 0) blocs.push({ type: "action", texte: paragraphe.join(" ") });
    paragraphe = [];
  };
  for (const ligne of (intent ?? "").replace(/\r\n?/g, "\n").split("\n")) {
    const t = ligne.trim();
    if (!t) {
      vider();
      continue;
    }
    const m = REPLIQUE.exec(ligne);
    if (m) {
      vider();
      blocs.push({ type: "replique", perso: m[1]!.trim(), texte: m[2]!.trim() });
    } else {
      paragraphe.push(t);
    }
  }
  vider();
  return blocs;
}
