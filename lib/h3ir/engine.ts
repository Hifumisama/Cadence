/** Why a clip is not yet compilable by Open H3 IR (the only sheet engine). Pure rules, tested (moteur.test.ts).
 *
 * Open H3 IR compiles from the references set on the clip (`plan_refs`) and their files. A clip that does not yet have its references, or whose
 * reference has no image, first goes through the PREPARATION (lib/h3ir/preparation.ts: choice of references by the code, small `references-plan` skill
 * in case of doubt, missing assets, prompts, images), then it is compiled. `refusReferences` says why a clip is not yet compilable (this is what
 * the preparation resolves). */

import { MAX_REFS_VISUELLES } from "../clips/clip-continuity";

/** Ceiling of reference images of an Open H3 IR brief (the same as lib/h3ir/brief.ts). */
const MAX_IMAGES_H3IR = MAX_REFS_VISUELLES;

/** The state of a clip's visual references (images, videos): how many, and which ones do not yet have a file (displayable name). */
export type EtatRefsVisuelles = { total: number; sansFichier: string[] };

/** What `attentesFiches` says about one clip: the reason it is not ready, `null` when it is ready, or a message when the clip is not in the map at all.
 * (`map.get(uuid) ?? message` would be wrong: it turns « ready » (null) into « unknown ».) */
export function attenteDuPlan(attentes: Map<string, string | null>, planUuid: string): string | null {
  return attentes.has(planUuid) ? (attentes.get(planUuid) ?? null) : "état des références inconnu";
}

/** Why Open H3 IR cannot YET compile this clip because of its references (null: it is ready). The preparation answers it. */
export function refusReferences(e: EtatRefsVisuelles): string | null {
  if (e.total === 0) return "le plan n'a encore aucune image de référence";
  if (e.sansFichier.length > 0) return `${e.sansFichier.length > 1 ? "ces références n'ont" : "cette référence n'a"} pas encore d'image : ${e.sansFichier.join(", ")}`;
  if (e.total > MAX_IMAGES_H3IR) return `le plan a ${e.total} références visuelles, ${MAX_IMAGES_H3IR} au plus`;
  return null;
}
