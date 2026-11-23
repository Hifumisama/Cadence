/** Reference sheet templates, added BY THE CODE at the end of an asset's generation prompt (cartography of project 259, 2026-11-17:
 * the « 4 views » template was left to the model, which forgot it for the heroine; the set sheets had a different layout each time and
 * repeated the same wide view instead of a reverse shot). Same principle as the poster's title line (lib/posters/posters.ts, `avecTitreDansImage`):
 * the model's own template sentence is removed wherever it is, then the fixed sentence is appended. Pure, tested. */

/** Character sheet (agents/skills/prompt-asset/references/guide-h3-image-generation.md, « Character sheet »). */
export const GABARIT_PERSONNAGE =
  "Neutral standing pose, empty hands, plain light background, character has 4 views : front full-body view, body side view, body back view, detailed single headshot portrait on the right side of the image, in the foreground.";

/** Set sheet: always the same layout, so that every set of every project reads the same way. */
export function gabaritDecor(repere: string): string {
  return `The place has 3 views in a fixed layout : one wide establishing view at eye level across the whole top half of the image; below it, on the left, a reverse view of the same place from the opposite side; on the right, a close-up detail of ${repere}.`;
}

const REPERE_PAR_DEFAUT = "one architectural or natural landmark of the place";

/** Sentences that are a template written by the model (any wording of « N views », turnaround, sheet layout). */
const PHRASE_GABARIT = /(?:has|with|showing|in)\s+(?:\d|three|four|two)\s+views?\b|\bturnaround\b|\bcharacter sheet\b|\bmulti-view layout\b|\bplain (?:light|white|neutral) background\b|^\s*close-up detail of\b/i;

/** The landmark of the close-up view the model chose, if it wrote one (« close-up detail of X »). */
export function repereDuDetail(prompt: string): string | null {
  const m = /close-up detail of ([^.;\n]+)/i.exec(prompt);
  const r = m?.[1]?.trim().replace(/[,\s]+$/, "");
  return r ? r : null;
}

/** Removes the model's template sentences (a sentence is cut at « . » or a line break). */
export function sansGabarit(prompt: string): string {
  return prompt
    .split("\n")
    .map((ligne) =>
      (ligne.match(/[^.]+(?:\.|$)/g) ?? [ligne])
        .filter((phrase) => !PHRASE_GABARIT.test(phrase))
        .join("")
        .trim(),
    )
    .filter((l) => l !== "")
    .join("\n")
    .trim();
}

/** The prompt with its sheet template: character and set in generation get the fixed sheet sentence. An edit is left as it is: its
 * image 1 already carries the layout, and an edit may legitimately change the framing (a close-up variant is a crop). Other types (prop,
 * effect, poster) are left as they are. */
export function avecGabarit(prompt: string, type: string, methode: "generation" | "edition"): string {
  if ((type !== "personnage" && type !== "decor") || methode === "edition") return prompt;
  const repere = type === "decor" ? repereDuDetail(prompt) : null;
  const corps = sansGabarit(prompt);
  const fin = type === "personnage" ? GABARIT_PERSONNAGE : gabaritDecor(repere ?? REPERE_PAR_DEFAUT);
  return `${corps.replace(/\s+$/, "")}${/[.!?]$/.test(corps) ? "" : "."} ${fin}`;
}
