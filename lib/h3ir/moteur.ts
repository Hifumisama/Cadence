/** Pourquoi un plan n'est pas encore compilable par Open H3 IR (le seul moteur de fiche). Règles pures, testées (moteur.test.ts).
 *
 * Open H3 IR compile depuis les références posées sur le plan (`plan_refs`) et leurs fichiers. Un plan qui n'a pas encore ses références, ou dont une
 * référence n'a pas d'image, passe d'abord par la PRÉPARATION (lib/h3ir/preparation.ts : choix des références par le code, petit skill `references-plan`
 * en cas de doute, assets manquants, prompts, images), puis il est compilé. `refusReferences` dit pourquoi un plan n'est pas encore compilable (c'est ce
 * que la préparation résout). */

import { MAX_REFS_VISUELLES } from "../plan-raccord";

/** Plafond d'images de référence d'un brief Open H3 IR (le même que lib/h3ir/brief.ts). */
const MAX_IMAGES_H3IR = MAX_REFS_VISUELLES;

/** L'état des références visuelles (images, vidéos) d'un plan : combien, et lesquelles n'ont pas encore de fichier (nom affichable). */
export type EtatRefsVisuelles = { total: number; sansFichier: string[] };

/** Pourquoi Open H3 IR ne peut pas ENCORE compiler ce plan à cause de ses références (null : il est prêt). La préparation y répond. */
export function refusReferences(e: EtatRefsVisuelles): string | null {
  if (e.total === 0) return "le plan n'a encore aucune image de référence";
  if (e.sansFichier.length > 0) return `${e.sansFichier.length > 1 ? "ces références n'ont" : "cette référence n'a"} pas encore d'image : ${e.sansFichier.join(", ")}`;
  if (e.total > MAX_IMAGES_H3IR) return `le plan a ${e.total} références visuelles, ${MAX_IMAGES_H3IR} au plus`;
  return null;
}
