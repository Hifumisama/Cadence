import type { CibleType, Operation, Portee } from "./types";

/** Verrou de portée : un agent ne touche que ce qu'on lui a demandé. Pur, testé ; appelé à la
 * construction de la proposition (refus d'office, avec raison) ET à l'application (l'état a pu
 * changer). Voir docs/FRICTIONS.md, décisions du 2026-10-02. */

export type ScopeDemandee = { type: Portee; cibleId: number | null };

/** Où se trouve la cible d'un changement, résolu par son applicateur. Pour une création, les
 * parents sont ceux sous lesquels elle naîtrait ; `parentNouveau` : le parent est lui-même créé
 * par la même proposition (le verdict est alors celui du parent, déjà vérifié). */
export type CibleChangement = {
  type: CibleType;
  operation: Operation;
  saisonId?: number | null;
  episodeId?: number | null;
  planId?: number | null;
  assetId?: number | null;
  parentNouveau?: boolean;
};

const LIBELLE_PORTEE: Record<Portee, string> = {
  projet: "le projet",
  saison: "cette saison",
  episode: "cet épisode",
  plan: "ce plan",
  asset: "cet asset",
};

/** `null` = autorisé ; sinon la raison du refus (en français, montrée à l'utilisateur).
 *
 * Règles :
 * - le brief est autorisé à toute portée (un nouvel élément peut faire évoluer sa référence) ;
 *   la clause de style du projet seulement à la portée `projet` ;
 * - `projet` : tout ;
 * - `saison` : la saison, ses épisodes, scènes et plans ;
 * - `episode` : l'épisode, ses scènes et ses plans (créer, modifier) ;
 * - `plan` : ce plan seulement (modifier) ;
 * - `asset` : cet asset seulement (modifier) ;
 * - un asset peut toujours être CRÉÉ (un asset manquant se propose depuis n'importe quelle
 *   portée), mais ne se MODIFIE que dans la portée projet ou si c'est la cible. */
export function verifierPortee(scope: ScopeDemandee, c: CibleChangement): string | null {
  const refus = (detail: string) => `Hors portée : la demande vise ${LIBELLE_PORTEE[scope.type]}, ${detail}.`;
  if (c.type === "brief") return null;
  if (scope.type === "projet") return null;
  if (c.parentNouveau) return null;

  const creation = c.operation === "creer";
  switch (c.type) {
    case "projet":
      return refus("ce changement touche le projet entier");
    case "saison":
      if (creation) return refus("créer une saison dépasse cette portée");
      if (scope.type === "saison" && c.saisonId === scope.cibleId) return null;
      return refus("cette saison n'est pas celle visée");
    case "episode":
      if (scope.type === "saison" && c.saisonId === scope.cibleId) return null;
      if (scope.type === "episode" && !creation && c.episodeId === scope.cibleId) return null;
      return refus(creation ? "un épisode ne se crée pas depuis cette portée" : "cet épisode n'est pas celui visé");
    case "scene":
    case "plan": {
      if (scope.type === "saison" && c.saisonId === scope.cibleId) return null;
      if (scope.type === "episode" && c.episodeId === scope.cibleId) return null;
      if (scope.type === "plan" && c.type === "plan" && !creation && c.planId === scope.cibleId) return null;
      return refus(c.type === "plan" ? "ce plan n'est pas dans la portée visée" : "cette scène n'est pas dans la portée visée");
    }
    case "asset":
      if (creation) return null;
      if (scope.type === "asset" && c.assetId === scope.cibleId) return null;
      return refus("cet asset n'est pas celui visé");
    default:
      return refus("type de changement inconnu");
  }
}
