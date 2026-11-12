/** What is being edited in the brief, directly in the relevant block (one edit at a time).
 * - `section`: a simple value (title, arc, language, duration, genre and tone, notes);
 * - `element`: ONE element of an object list (character, location).
 * For `element`, `index === length of the list` = adding one. */
export type Edition = { type: "section"; cle: string; titre: string } | { type: "element"; cle: string; index: number };

export function memeEdition(a: Edition | null, b: Edition): boolean {
  if (!a || a.type !== b.type || a.cle !== b.cle) return false;
  return a.type === "section" || (b.type !== "section" && a.index === b.index);
}
