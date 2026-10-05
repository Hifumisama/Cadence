import type { StatutChamp } from "@/lib/agents/types";

/** Ce qu'on est en train de modifier dans le brief. `section` : une section entière (texte, nombre, style, liste de lignes) ;
 * `element` : UN élément d'une liste d'objets (un personnage, un lieu…) — `index === longueur de la liste` = en ajouter un. */
export type Edition =
  | { type: "section"; cle: string; titre: string }
  | { type: "element"; cle: string; index: number };

/** Provenance affichée sur une carte : jamais la couleur seule, un symbole et un libellé (voir ETAT_CHAMP). */
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
