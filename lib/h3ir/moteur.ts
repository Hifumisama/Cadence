/** Le MOTEUR qui écrit la fiche d'un plan (2026-11-09, vague 4a) : Open H3 IR SEUL. Règles pures, testées (moteur.test.ts).
 *
 * Open H3 IR compile depuis les références posées sur le plan (`plan_refs`) et leurs fichiers. Un plan qui n'a pas encore ses références, ou dont une
 * référence n'a pas d'image, n'est plus confié à `plan-h3` : il passe d'abord par la PRÉPARATION (lib/h3ir/preparation.ts : choix des références par le
 * code, petit skill `references-plan` en cas de doute, assets manquants, prompts, images), puis il est compilé. `refusReferences` dit pourquoi un plan
 * n'est pas encore compilable (c'est ce que la préparation résout).
 *
 * `plan-h3` ne reste qu'en RETOUR ARRIÈRE D'URGENCE, tant que le banc de rendu n'est pas fait : explicitement (`moteur: "plan-h3"`, option interne de
 * lib/demandes-db.ts et lib/agents/service.ts, aucun bouton), ou pour toute l'application avec la variable d'environnement `CADENCE_MOTEUR_FICHE=plan-h3`
 * (lue par le web ET le worker). Aucun chemin par défaut n'y mène. */

import { MAX_REFS_VISUELLES } from "../plan-raccord";

export type MoteurFiche = "h3ir" | "plan-h3";
/** Ce qu'un point d'entrée demande. `auto` (ancien nom du défaut, gardé pour les appelants existants) vaut désormais Open H3 IR. */
export type DemandeMoteur = MoteurFiche | "auto";

/** Plafond d'images de référence d'un brief Open H3 IR (le même que lib/h3ir/brief.ts). */
const MAX_IMAGES_H3IR = MAX_REFS_VISUELLES;

/** L'état des références visuelles (images, vidéos) d'un plan : combien, et lesquelles n'ont pas encore de fichier (nom affichable). */
export type EtatRefsVisuelles = { total: number; sansFichier: string[] };

/** Le moteur de l'application : Open H3 IR, sauf retour arrière d'urgence par l'environnement. */
export function moteurParDefaut(env: Record<string, string | undefined> = process.env): MoteurFiche {
  return env.CADENCE_MOTEUR_FICHE?.trim() === "plan-h3" ? "plan-h3" : "h3ir";
}

/** Pourquoi Open H3 IR ne peut pas ENCORE compiler ce plan à cause de ses références (null : il est prêt). La préparation y répond. */
export function refusReferences(e: EtatRefsVisuelles): string | null {
  if (e.total === 0) return "le plan n'a encore aucune image de référence";
  if (e.sansFichier.length > 0) return `${e.sansFichier.length > 1 ? "ces références n'ont" : "cette référence n'a"} pas encore d'image : ${e.sansFichier.join(", ")}`;
  if (e.total > MAX_IMAGES_H3IR) return `le plan a ${e.total} références visuelles, ${MAX_IMAGES_H3IR} au plus`;
  return null;
}

/** Le moteur retenu pour un plan. `repli` : toujours null depuis la vague 4a (gardé pour la forme lue par les appelants). `attente` : pourquoi le plan
 * doit d'abord être préparé (références, images), ou null s'il se compile tout de suite. */
export type ChoixMoteur = { moteur: MoteurFiche; repli: string | null; attente: string | null };

export function choisirMoteurFiche(demande: DemandeMoteur, refs: EtatRefsVisuelles): ChoixMoteur {
  if (demande === "plan-h3") return { moteur: "plan-h3", repli: null, attente: null };
  return { moteur: "h3ir", repli: null, attente: refusReferences(refs) };
}
