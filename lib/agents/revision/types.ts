import type { Position } from "../types";

/** La révision d'un épisode (le réalisateur, docs/FRICTIONS.md 2026-10-09 « révision d'épisode »). Types partagés par le
 * serveur, le worker et l'interface : aucun accès base ni Next ici. */

export const TYPES_OPERATION = ["couper_plan", "duree_plan", "deplacer_plan", "modifier_plan", "remplacer_replique", "supprimer_replique"] as const;
export type TypeOperation = (typeof TYPES_OPERATION)[number];

/** L'opération telle que le modèle la rend : une structure PLATE (sortie contrainte), les plans et les répliques cités par une
 * POIGNÉE (« P07 », « R12 »), les champs inutilisés à null. Jamais stockée telle quelle. */
export type OperationBrute = {
  type: string;
  plan?: string | null;
  replique?: string | null;
  secondes?: number | null;
  /** Déplacement : la poignée du plan APRÈS lequel on pose le plan (sinon `position`). */
  apres?: string | null;
  /** Déplacement : « debut » ou « fin » de l'épisode. */
  position?: string | null;
  titre?: string | null;
  description?: string | null;
  texte?: string | null;
  locuteur?: string | null;
};

/** L'opération VALIDÉE, stockée : les cibles sont des uuid (stables), jamais des poignées ni des rangs (F03). */
export type Operation =
  | { type: "couper_plan"; planUuid: string }
  | { type: "duree_plan"; planUuid: string; secondes: number }
  | { type: "deplacer_plan"; planUuid: string; position: Position }
  | { type: "modifier_plan"; planUuid: string; titre?: string; description?: string }
  | { type: "remplacer_replique"; repliqueUuid: string; texte?: string; locuteur?: string }
  | { type: "supprimer_replique"; repliqueUuid: string };

export type OperationRefusee = { brute: OperationBrute; raison: string };

/** Un constat : `ok` (rassure), `alerte` (à savoir, n'empêche rien), `bloquant` (empêche d'appliquer). `source` dit qui a jugé :
 * le code (mécanique, fiable) ou le modèle (narratif). */
export type Constat = { niveau: "ok" | "alerte" | "bloquant"; texte: string; source: "code" | "modele" };

export const STATUTS_DECISION = ["discussion", "retenue", "attention", "conflit", "appliquee"] as const;
export type StatutDecision = (typeof STATUTS_DECISION)[number];

/** Une piste : une idée proposée à partir d'un ressenti, avec ses opérations déjà préparées et validées. Choisie, elle devient
 * une décision sans nouvel appel d'écriture. */
export type Piste = { titre: string; resume: string; operations: Operation[] };
