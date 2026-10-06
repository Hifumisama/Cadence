/** Types partagés par le registre d'assets (page serveur, cartes et liste côté client) — sans dépendance au disque. */

export type MediaKind = "image" | "video" | "audio";
export type FichierEtat = "aucun" | "manquant" | "ok";

/** Une ligne du registre : tout ce qu'il faut pour l'afficher, la filtrer et la sélectionner, déjà calculé côté serveur. */
export type LigneRegistre = {
  id: number;
  code: string;
  type: string;
  statut: "a_produire" | "en_cours" | "valide";
  critique: boolean;
  description: string | null;
  /** Nombre de plans qui citent cet asset (0 = « sans plan »). */
  nbPlans: number;
  /** Personnage uniquement : sa voix au casting, `null` = sans voix ; `undefined` pour tout autre type. */
  voix?: { code: string } | null;
  kind: MediaKind;
  etat: FichierEtat;
  src: string | null;
  fichier: string | null;
  /** Pourquoi la suppression est bloquée, ou null si l'asset peut être supprimé. */
  blocageSuppression: string | null;
  /** Pourquoi l'asset ne peut pas partir en génération par lot, ou null s'il peut partir. */
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
  voix: "Voix",
  prop: "Prop",
  vfx: "VFX",
  sfx: "SFX",
  keyframe: "Keyframe",
  oth: "Autre",
};
