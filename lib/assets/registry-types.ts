/** Types shared by the asset registry (server page, cards and client-side list) — with no disk dependency. */

export type MediaKind = "image" | "video" | "audio";
export type FichierEtat = "aucun" | "manquant" | "ok";

/** A registry row: everything needed to display, filter and select it, already computed server-side. */
export type LigneRegistre = {
  id: number;
  code: string;
  /** The displayed name (label, otherwise the readable code); the code remains the identifier. */
  libelle: string;
  type: string;
  statut: "a_produire" | "en_cours" | "valide";
  critique: boolean;
  description: string | null;
  /** Number of clips that cite this asset (0 = « sans plan »). */
  nbPlans: number;
  /** Character only: its fixed voice (master), `null` = no fixed voice; `undefined` for any other type. */
  voix?: { code: string } | null;
  kind: MediaKind;
  etat: FichierEtat;
  src: string | null;
  fichier: string | null;
  /** Why deletion is blocked, or null if the asset can be deleted. */
  blocageSuppression: string | null;
  /** Why the asset cannot go into batch generation, or null if it can go. */
  raisonLot: string | null;
};

export const LIBELLE_STATUT: Record<LigneRegistre["statut"], string> = {
  a_produire: "À produire",
  en_cours: "En cours",
  valide: "Validé",
};

export const LIBELLE_TYPE_ASSET: Record<string, string> = {
  personnage: "Personnage",
  decor: "Décor",
  prop: "Prop",
  vfx: "VFX",
  keyframe: "Keyframe",
  oth: "Autre",
};
