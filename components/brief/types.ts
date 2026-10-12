/** Ce qu'on est en train de modifier dans le brief, directement dans le bloc concerné (une seule édition à la fois).
 * - `section` : une valeur simple (titre, arc, langue, durée, genre et ton, notes) ;
 * - `element` : UN élément d'une liste d'objets (personnage, lieu).
 * Pour `element`, `index === longueur de la liste` = en ajouter un. */
export type Edition = { type: "section"; cle: string; titre: string } | { type: "element"; cle: string; index: number };

export function memeEdition(a: Edition | null, b: Edition): boolean {
  if (!a || a.type !== b.type || a.cle !== b.cle) return false;
  return a.type === "section" || (b.type !== "section" && a.index === b.index);
}
