/** Le MOTEUR qui écrit la fiche d'un plan (2026-11-08) : Open H3 IR par défaut, `plan-h3` en repli. Règles pures, testées (moteur.test.ts).
 *
 * Open H3 IR compile depuis les références DÉJÀ posées sur le plan (`plan_refs`) et leurs fichiers : il ne choisit pas les références et ne
 * déclare pas d'assets manquants (docs/PLAN_INTEGRATION_OPEN_H3_IR.md, « option B », étape 5 non faite). Tant que cette étape n'existe pas, un plan
 * sans référence d'image, ou dont une référence n'a pas encore de fichier, ne peut pas être compilé : `plan-h3` écrit alors sa fiche (il choisit
 * les références et crée les assets manquants). C'est le SEUL repli automatique ; tout autre refus du brief (pas de description, réglage inconnu)
 * reste un échec d'Open H3 IR, avec sa raison.
 *
 * `plan-h3` s'impose aussi à la demande : explicitement (`moteur: "plan-h3"`, option interne de lib/demandes-db.ts et lib/agents/service.ts), ou
 * pour toute l'application avec la variable d'environnement `CADENCE_MOTEUR_FICHE=plan-h3` (retour arrière d'urgence, lue par le web ET le worker). */

import { MAX_REFS_VISUELLES } from "../plan-raccord";

export type MoteurFiche = "h3ir" | "plan-h3";
/** Ce qu'un point d'entrée demande : un moteur imposé, ou `auto` (Open H3 IR si le plan est compilable, sinon plan-h3). */
export type DemandeMoteur = MoteurFiche | "auto";

/** Plafond d'images de référence d'un brief Open H3 IR (le même que lib/h3ir/brief.ts). */
const MAX_IMAGES_H3IR = MAX_REFS_VISUELLES;

/** L'état des références visuelles (images, vidéos) d'un plan : combien, et lesquelles n'ont pas encore de fichier (nom affichable). */
export type EtatRefsVisuelles = { total: number; sansFichier: string[] };

/** Le moteur par défaut de l'application : `auto`, sauf retour arrière par l'environnement. */
export function moteurParDefaut(env: Record<string, string | undefined> = process.env): DemandeMoteur {
  return env.CADENCE_MOTEUR_FICHE?.trim() === "plan-h3" ? "plan-h3" : "auto";
}

/** Pourquoi Open H3 IR ne peut pas compiler CE plan à cause de ses références (null : elles conviennent). */
export function refusReferences(e: EtatRefsVisuelles): string | null {
  if (e.total === 0) return "le plan n'a encore aucune image de référence";
  if (e.sansFichier.length > 0) return `${e.sansFichier.length > 1 ? "ces références n'ont" : "cette référence n'a"} pas encore d'image : ${e.sansFichier.join(", ")}`;
  if (e.total > MAX_IMAGES_H3IR) return `le plan a ${e.total} références visuelles, ${MAX_IMAGES_H3IR} au plus`;
  return null;
}

/** Le moteur retenu et, pour un repli, sa raison en une phrase (montrée dans la proposition et la file). */
export type ChoixMoteur = { moteur: MoteurFiche; repli: string | null };

export function choisirMoteurFiche(demande: DemandeMoteur, refs: EtatRefsVisuelles): ChoixMoteur {
  if (demande === "plan-h3") return { moteur: "plan-h3", repli: "plan-h3 imposé" };
  if (demande === "h3ir") return { moteur: "h3ir", repli: null };
  const refus = refusReferences(refs);
  return refus ? { moteur: "plan-h3", repli: `Repli sur plan-h3 : ${refus} (Open H3 IR ne choisit pas les références).` } : { moteur: "h3ir", repli: null };
}
