import type { StatutChamp } from "@/lib/agents/types";

/** Ce qu'on est en train de modifier dans le brief, directement dans le bloc concerné (une seule édition à la fois).
 * - `section` : une valeur simple (titre, arc, langue, durée, genre et ton, style, notes) ;
 * - `element` : UN élément d'une liste d'objets (personnage, lieu, épisode, rime, progression, piège) ;
 * - `ligne`   : UNE ligne d'une liste de textes (règles de continuité, ajouts de l'agent, questions ouvertes).
 * Pour `element` et `ligne`, `index === longueur de la liste` = en ajouter un. */
export type Edition =
  | { type: "section"; cle: string; titre: string }
  | { type: "element"; cle: string; index: number }
  | { type: "ligne"; cle: string; index: number };

export function memeEdition(a: Edition | null, b: Edition): boolean {
  if (!a || a.type !== b.type || a.cle !== b.cle) return false;
  return a.type === "section" || (b.type !== "section" && a.index === b.index);
}

/** Provenance affichée sur un bloc : jamais la couleur seule, un symbole et un libellé (voir ETAT_CHAMP). */
export type Provenance = "fourni" | "deduit" | "confirmer";

export const PROVENANCE: Record<Provenance, { symbole: string; libelle: string }> = {
  fourni: { symbole: "●", libelle: "Fourni" },
  deduit: { symbole: "○", libelle: "Déduit" },
  confirmer: { symbole: "◇", libelle: "À confirmer" },
};

export function provenanceSection(statut: StatutChamp): Provenance {
  return statut === "fourni" ? "fourni" : statut === "a_valider" ? "confirmer" : "deduit";
}

/** Le `statut` d'un élément de liste (personnage, lieu) : fourni | deduit | incertain. */
export function provenanceElement(statut: unknown, repli: Provenance): Provenance {
  return statut === "fourni" ? "fourni" : statut === "deduit" ? "deduit" : statut === "incertain" ? "confirmer" : repli;
}
