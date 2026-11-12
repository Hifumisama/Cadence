import type { Liaison } from "../../plans/plan-liaison";
import type { Position } from "../types";

/** Les opérations sur un épisode (relecture du scénario). Types partagés par le
 * serveur et le worker : aucun accès base ni Next ici. */

export const TYPES_OPERATION = ["couper_plan", "duree_plan", "deplacer_plan", "modifier_plan", "refondre_fiche", "ajouter_plan"] as const;

/** L'opération telle que le modèle la rend : une structure PLATE (sortie contrainte), les plans cités par une
 * POIGNÉE (« P07 »), les champs inutilisés à null. Jamais stockée telle quelle. */
export type OperationBrute = {
  type: string;
  plan?: string | null;
  secondes?: number | null;
  /** Déplacement : la poignée du plan APRÈS lequel on pose le plan (sinon `position`). */
  apres?: string | null;
  /** ajouter_plan : la poignée du plan AVANT lequel on pose le nouveau plan (sinon `apres` ou `position`). */
  avant?: string | null;
  /** Déplacement : « debut » ou « fin » de l'épisode. */
  position?: string | null;
  titre?: string | null;
  description?: string | null;
  /** modifier_plan : la liaison avec le plan précédent (`suite` ou `coupe`, lib/plans/plan-liaison.ts). */
  liaison?: string | null;
  /** refondre_fiche : ce qu'il faut changer dans la fiche, dit simplement (facultatif). */
  consigne?: string | null;
};

/** L'opération VALIDÉE, stockée : les cibles sont des uuid (stables), jamais des poignées ni des rangs (F03). */
export type Operation =
  | { type: "couper_plan"; planUuid: string }
  | { type: "duree_plan"; planUuid: string; secondes: number }
  | { type: "deplacer_plan"; planUuid: string; position: Position }
  | { type: "modifier_plan"; planUuid: string; titre?: string; description?: string; liaison?: Liaison }
  /** Réécrire la fiche du plan (recompilation Open H3 IR). Jamais exécuté dans l'application du chantier (c'est un appel de modèle) : le code lance la
   * génération APRÈS, et le résultat arrive en proposition à relire. */
  | { type: "refondre_fiche"; planUuid: string; consigne: string }
  /** Ajouter un plan SANS fiche (sa fiche s'écrit ensuite, comme une refonte). `ref` est un uuid tiré à la validation : l'identifiant du plan
   * dans le brouillon, tant qu'il n'existe pas. */
  | { type: "ajouter_plan"; ref: string; position: Position; titre: string; description: string; secondes: number };

export type OperationRefusee = { brute: OperationBrute; raison: string };

