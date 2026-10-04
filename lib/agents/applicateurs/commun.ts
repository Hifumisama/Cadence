import type { db } from "../../../db";
import type { Tx } from "../../ordre-plans";
import type { ChangementBrut, LigneChangement } from "../changements";
import type { CibleChangement, ScopeDemandee } from "../portee";
import type { CibleType } from "../types";

/** Applicateurs : ce que sait faire une cible de changement. Chacun a trois temps :
 * - `cible` : où se trouve la cible (pour le verrou de portée) — lecture seule ;
 * - `previsualiser` : complète le changement avec l'état courant (avant, écrasement,
 *   avertissements, refus) — lecture seule, appelé à la construction de la proposition ;
 * - `verifier` + `appliquer` : à l'application, DANS la transaction. */

export type Db = typeof db | Tx;

/** Contexte de construction : les clés symboliques que la proposition crée elle-même. */
export type CtxPrevisu = { projectId: number; scope: ScopeDemandee; clesNouvelles: Set<string> };

/** Contexte d'application : les ids réels des créations déjà appliquées (clé → id). */
export type CtxAppli = { projectId: number; scope: ScopeDemandee; cles: Map<string, number> };

export interface Applicateur {
  cibleType: CibleType;
  /** Raison d'un refus (« introuvable… ») ou la position de la cible dans la hiérarchie. */
  cible(db: Db, ctx: CtxPrevisu | CtxAppli, ch: Pick<LigneChangement, "operation" | "cibleRef" | "apres">): Promise<CibleChangement | string>;
  previsualiser(db: Db, ctx: CtxPrevisu, ch: ChangementBrut): Promise<ChangementBrut>;
  /** Re-vérifie l'état au moment d'appliquer : raison d'un refus, ou null. */
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

/** L'id réel d'un parent : cité par id, ou par clé symbolique d'une création de la même
 * proposition (déjà appliquée, ou en cours de construction). */
export function parentDe(a: Apres, cleChamp: string, idChamp: string, cles: Map<string, number> | Set<string>): { id: number | null; nouveau: boolean } {
  const cle = texte(a[cleChamp]);
  if (cle) return { id: cles instanceof Map ? (cles.get(cle) ?? null) : null, nouveau: true };
  const id = a[idChamp];
  return { id: typeof id === "number" ? id : null, nouveau: false };
}

export const REFUS_SUPPRESSION = "Suppression non prise en charge pour l'instant : fais-la à la main.";
