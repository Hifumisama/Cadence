"use server";

import { revalidatePath } from "next/cache";
import { annulerDemande, lancerDemandeAjoutPlan, lancerDemandeAjoutScene, lancerDemandeFichePlan, lancerDemandesFiches, lancerDemandeIteration, deplacerIterationEnAttente, lireDemandeVue, modifierConsigneIteration, type VueDemande } from "@/lib/tasks/requests-db";
import type { ContexteAjoutPlan, ContexteAjoutScene, ContexteIteration } from "@/lib/tasks/requests";

// The REQUESTS (lib/tasks/requests.ts) on the interface side: « Itérer » submits one, the worker chains it through to the render (lib/tasks/requests-db.ts), the page
// only follows it. Leaving the page cancels nothing.

/** « Itérer » a clip: submits the request (instruction → agent → rewrite if needed → render). Refused if the clip already has one in progress. */
export async function demanderIteration(
  conversationUuid: string,
  options: { retour: string; renduId?: number | null; planche?: boolean; depuisNumero: number | null; reglages?: ContexteIteration["reglages"] },
): Promise<{ ok: true; demandeId: number; enAttente: boolean } | { ok: false; erreur: string }> {
  const r = await lancerDemandeIteration(conversationUuid, options);
  revalidatePath("/", "layout");
  return r.ok ? { ok: true, demandeId: r.demandeId, enAttente: r.enAttente } : r;
}

/** Corrects the instruction of an iteration waiting its turn (tasks panel). Refused once the iteration has started. */
export async function corrigerConsigneIteration(demandeId: number, texte: string): Promise<{ ok: true } | { ok: false; erreur: string }> {
  const r = await modifierConsigneIteration(demandeId, texte);
  revalidatePath("/", "layout");
  return r.ok ? { ok: true } : r;
}

/** Moves a waiting iteration up or down in the queue (tasks panel). */
export async function deplacerIteration(demandeId: number, sens: -1 | 1): Promise<{ ok: true } | { ok: false; erreur: string }> {
  const r = await deplacerIterationEnAttente(demandeId, sens);
  revalidatePath("/", "layout");
  return r.ok ? { ok: true } : r;
}

/** « Ajouter un plan » (Screenplay page): submits the request (the agent writes the clip, it is added to the scene without review). Only one at a time per film. */
export async function demanderAjoutPlan(
  projectId: number,
  episodeId: number,
  options: { consigne: string; position: ContexteAjoutPlan["position"]; sceneId: number | null; scene: string },
): Promise<{ ok: true; demandeId: number } | { ok: false; erreur: string }> {
  const r = await lancerDemandeAjoutPlan(projectId, episodeId, options);
  revalidatePath("/", "layout");
  return r;
}

/** « Nouvelle scène » (Screenplay page): submits the request (the agent writes the scene and its clips, added to the film without review). Only one at a time per film,
 * clip or scene. An empty instruction lets the agent propose what comes next. */
export async function demanderAjoutScene(
  projectId: number,
  episodeId: number,
  options: { consigne: string; place: ContexteAjoutScene["place"]; apres: string },
): Promise<{ ok: true; demandeId: number } | { ok: false; erreur: string }> {
  const r = await lancerDemandeAjoutScene(projectId, episodeId, options);
  revalidatePath("/", "layout");
  return r;
}

/** « Générer la fiche » of a clip: submits the request (the clip is prepared if needed: references, missing assets, prompts, images; then Open H3 IR compiles
 * the clip sheet, saved without review). Only one at a time per clip. Open H3 IR only (lib/h3ir/preparation.ts). */
export async function demanderFichePlan(projectId: number, planUuid: string): Promise<{ ok: true; demandeId: number } | { ok: false; erreur: string }> {
  const r = await lancerDemandeFichePlan(projectId, planUuid);
  revalidatePath("/", "layout");
  return r;
}

/** « Écrire les fiches » (Screenplay page): one « Générer la fiche » request per chosen clip, submitted in screenplay order (lib/tasks/requests-db.ts,
 * `lancerDemandesFiches`). A clip refused (request in progress) does not stop the others: its reasons are returned along with the number of clip sheets launched. */
export async function demanderFichesPlans(projectId: number, planUuids: string[]): Promise<{ lancees: number; erreurs: string[] }> {
  const r = await lancerDemandesFiches(projectId, planUuids);
  revalidatePath("/", "layout");
  return { lancees: r.lancees, erreurs: r.erreurs };
}

/** Where a request stands (polling of the clip's page). */
export async function lireDemande(demandeId: number): Promise<VueDemande | null> {
  return lireDemandeVue(demandeId);
}

/** Cancels an ongoing request (the ✕ on the page; the panel goes through `annulerTache`). */
export async function annulerLaDemande(demandeId: number): Promise<{ ok: true }> {
  await annulerDemande(demandeId);
  revalidatePath("/", "layout");
  return { ok: true };
}
