import type { CibleType, Operation, Portee } from "./types";

/** Scope lock: an agent only touches what it was asked to. Pure, tested; called when
 * the proposal is built (refused outright, with a reason) AND when it is applied (the state may
 * have changed). See docs/FRICTIONS.md, decisions of 2026-10-02. */

export type ScopeDemandee = { type: Portee; cibleId: number | null };

/** Where a change's target is, resolved by its applier. For a creation, the
 * parents are those it would be born under; `parentNouveau`: the parent is itself created
 * by the same proposal (the verdict is then the parent's, already checked). */
export type CibleChangement = {
  type: CibleType;
  operation: Operation;
  episodeId?: number | null;
  planId?: number | null;
  assetId?: number | null;
  parentNouveau?: boolean;
};

const LIBELLE_PORTEE: Record<Portee, string> = {
  projet: "le projet",
  episode: "cet épisode",
  plan: "ce plan",
  asset: "cet asset",
};

/** `null` = allowed; otherwise the reason for refusal (in French, shown to the user).
 *
 * Rules:
 * - the brief is allowed at any scope (a new element may change its reference); the
 *   project's style clause only at the `projet` scope;
 * - `projet`: everything;
 * - `episode`: the episode, its scenes and its clips (create, modify);
 * - `plan`: this clip only (modify, and write its sheet);
 * - `fiche` (a clip's H3 prompt): like modifying a clip, from its episode or from itself;
 * - `asset`: this asset only (modify);
 * - an asset can always be CREATED (a missing asset is proposed from any
 *   scope), but is only MODIFIED in the project scope or if it is the target. */
export function verifierPortee(scope: ScopeDemandee, c: CibleChangement): string | null {
  const refus = (detail: string) => `Hors portée : la demande vise ${LIBELLE_PORTEE[scope.type]}, ${detail}.`;
  if (c.type === "brief") return null;
  if (scope.type === "projet") return null;
  if (c.parentNouveau) return null;

  const creation = c.operation === "creer";
  switch (c.type) {
    case "projet":
      return refus("ce changement touche le projet entier");
    case "episode":
      if (scope.type === "episode" && !creation && c.episodeId === scope.cibleId) return null;
      return refus(creation ? "un épisode ne se crée pas depuis cette portée" : "cet épisode n'est pas celui visé");
    case "scene":
    case "plan": {
      if (scope.type === "episode" && c.episodeId === scope.cibleId) return null;
      if (scope.type === "plan" && c.type === "plan" && !creation && c.planId === scope.cibleId) return null;
      return refus(c.type === "plan" ? "ce plan n'est pas dans la portée visée" : "cette scène n'est pas dans la portée visée");
    }
    case "fiche":
      // The sheet (H3 prompt + references) of an EXISTING clip: never a creation.
      if (creation) return refus("une fiche s'écrit sur un plan existant");
      if (scope.type === "episode" && c.episodeId === scope.cibleId) return null;
      if (scope.type === "plan" && c.planId === scope.cibleId) return null;
      return refus("la fiche de ce plan n'est pas dans la portée visée");
    case "asset":
      if (creation) return null;
      if (scope.type === "asset" && c.assetId === scope.cibleId) return null;
      return refus("cet asset n'est pas celui visé");
    default:
      return refus("type de changement inconnu");
  }
}
