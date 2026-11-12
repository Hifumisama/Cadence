import type { db } from "../../../db";
import type { Tx } from "../../clips/clip-order";
import type { ChangementBrut, LigneChangement } from "../changes";
import type { CibleChangement, ScopeDemandee } from "../scope";
import type { CibleType } from "../types";

/** Appliers: what a change target can do. Each has three stages:
 * - `cible`: where the target is (for the scope lock) — read-only;
 * - `previsualiser`: completes the change with the current state (before, overwrite,
 *   warnings, refusals) — read-only, called when the proposal is built;
 * - `verifier` + `appliquer`: on application, INSIDE the transaction. */

export type Db = typeof db | Tx;

/** Build context: the symbolic keys that the proposal creates itself. */
export type CtxPrevisu = { projectId: number; scope: ScopeDemandee; clesNouvelles: Set<string> };

/** Application context: the real ids of the creations already applied (key → id). */
export type CtxAppli = { projectId: number; scope: ScopeDemandee; cles: Map<string, number> };

export interface Applicateur {
  cibleType: CibleType;
  /** Refusal reason (« introuvable… ») or the target's position in the hierarchy. */
  cible(db: Db, ctx: CtxPrevisu | CtxAppli, ch: Pick<LigneChangement, "operation" | "cibleRef" | "apres">): Promise<CibleChangement | string>;
  previsualiser(db: Db, ctx: CtxPrevisu, ch: ChangementBrut): Promise<ChangementBrut>;
  /** Re-checks the state at the moment of applying: refusal reason, or null. */
  verifier(tx: Tx, ctx: CtxAppli, ch: LigneChangement): Promise<string | null>;
  appliquer(tx: Tx, ctx: CtxAppli, ch: LigneChangement): Promise<void>;
}

export type Apres = Record<string, unknown>;

export function apres(ch: { apres?: unknown }): Apres {
  return ch.apres && typeof ch.apres === "object" ? (ch.apres as Apres) : {};
}

export function entierRef(ref: string | null): number | null {
  if (ref == null) return null;
  const n = Number(ref);
  return Number.isInteger(n) ? n : null;
}

export function texte(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}

/** The real id of a parent: cited by id, or by symbolic key of a creation from the same
 * proposal (already applied, or being built). */
export function parentDe(a: Apres, cleChamp: string, idChamp: string, cles: Map<string, number> | Set<string>): { id: number | null; nouveau: boolean } {
  const cle = texte(a[cleChamp]);
  if (cle) return { id: cles instanceof Map ? (cles.get(cle) ?? null) : null, nouveau: true };
  const id = a[idChamp];
  return { id: typeof id === "number" ? id : null, nouveau: false };
}

export const REFUS_SUPPRESSION = "Suppression non prise en charge pour l'instant : fais-la à la main.";
