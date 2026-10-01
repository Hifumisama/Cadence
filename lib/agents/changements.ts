import type { Avertissement, CibleType, Operation, Position } from "./types";

/** Un changement tel que le construisent les convertisseurs (squelette, sorties de
 * skills) AVANT enrichissement par l'applicateur de sa cible (état courant, écrasement,
 * contrôles). Pur : aucune lecture. */
export type ChangementBrut = {
  /** Groupe d'affichage stable : brief | projet | saison | episodes | scenes | plans | assets. */
  groupe: string;
  /** Clé symbolique d'une création (« saison-1 », « episode-2 ») citée par ses enfants. */
  cle?: string | null;
  cibleType: CibleType;
  /** Référence stable de l'existant (id interne, uuid du plan, clé de section) ; null = création. */
  cibleRef: string | null;
  libelle: string;
  operation: Operation;
  avant?: unknown;
  apres?: unknown;
  position?: Position | null;
  avertissements?: Avertissement[];
  ecrase?: string | null;
  /** Refusé d'office (non pris en charge, hors portée, parent refusé). */
  refuseRaison?: string | null;
  /** Lot : titre de la scène sous laquelle la revue range ce plan ou cette réplique. */
  sousGroupe?: string | null;
};

/** Une ligne de proposition_changements, jsonb en `unknown`. */
export type LigneChangement = {
  id: number;
  propositionId: number;
  ordre: number;
  groupe: string;
  cle: string | null;
  cibleType: CibleType;
  cibleRef: string | null;
  libelle: string;
  operation: Operation;
  avant: unknown;
  apres: unknown;
  position: Position | null;
  avertissements: Avertissement[];
  ecrase: string | null;
  coche: boolean;
  refuseRaison: string | null;
  sousGroupe?: string | null;
};

export const TITRES_GROUPES: Record<string, string> = {
  ecrasement: "Risque d'écrasement",
  brief: "Brief",
  projet: "Projet",
  saison: "Saison",
  episodes: "Épisodes",
  scenes: "Scènes",
  plans: "Plans",
  repliques: "Répliques",
  assets: "Assets",
};

/** Ordre d'affichage des groupes ; l'écrasement vient toujours en tête. */
export const ORDRE_GROUPES = ["ecrasement", "brief", "projet", "saison", "episodes", "scenes", "plans", "repliques", "assets"];
