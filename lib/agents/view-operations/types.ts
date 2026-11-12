import type { Liaison } from "../../clips/clip-link";
import type { Position } from "../types";

/** Operations on an episode (screenplay review). Types shared by the
 * server and the worker: no database access nor Next here. */

export const TYPES_OPERATION = ["couper_plan", "duree_plan", "deplacer_plan", "modifier_plan", "refondre_fiche", "ajouter_plan"] as const;

/** The operation as the model renders it: a FLAT structure (constrained output), the clips cited by a
 * HANDLE (« P07 »), the unused fields null. Never stored as is. */
export type OperationBrute = {
  type: string;
  plan?: string | null;
  secondes?: number | null;
  /** Move: the handle of the clip AFTER which the clip is placed (otherwise `position`). */
  apres?: string | null;
  /** ajouter_plan: the handle of the clip BEFORE which the new clip is placed (otherwise `apres` or `position`). */
  avant?: string | null;
  /** Move: « debut » or « fin » of the episode. */
  position?: string | null;
  titre?: string | null;
  description?: string | null;
  /** modifier_plan: the link with the previous clip (`suite` or `coupe`, lib/clips/clip-link.ts). */
  liaison?: string | null;
  /** refondre_fiche: what must change in the sheet, said simply (optional). */
  consigne?: string | null;
};

/** The VALIDATED operation, stored: the targets are uuids (stable), never handles nor ranks (F03). */
export type Operation =
  | { type: "couper_plan"; planUuid: string }
  | { type: "duree_plan"; planUuid: string; secondes: number }
  | { type: "deplacer_plan"; planUuid: string; position: Position }
  | { type: "modifier_plan"; planUuid: string; titre?: string; description?: string; liaison?: Liaison }
  /** Rewrite the clip's sheet (Open H3 IR recompilation). Never executed in the application of this change set (it is a model call): the code launches the
   * generation AFTER, and the result arrives as a proposal to review. */
  | { type: "refondre_fiche"; planUuid: string; consigne: string }
  /** Add a clip WITHOUT a sheet (its sheet is written afterwards, like a rewrite). `ref` is a uuid drawn at validation: the identifier of the clip
   * in the draft, for as long as it does not exist. */
  | { type: "ajouter_plan"; ref: string; position: Position; titre: string; description: string; secondes: number };

export type OperationRefusee = { brute: OperationBrute; raison: string };

