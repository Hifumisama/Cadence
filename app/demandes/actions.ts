"use server";

import { revalidatePath } from "next/cache";
import { annulerDemande, lancerDemandeAjoutPlan, lancerDemandeAjoutScene, lancerDemandeFichePlan, lancerDemandeIteration, lireDemandeVue, type VueDemande } from "@/lib/demandes-db";
import type { ContexteAjoutPlan, ContexteAjoutScene, ContexteIteration } from "@/lib/demandes";

// Les DEMANDES (lib/demandes.ts) côté interface : « Itérer » en pose une, le worker l'enchaîne jusqu'au rendu (lib/demandes-db.ts), la page
// ne fait que la suivre. Quitter la page ne coupe rien.

/** « Itérer » un plan : pose la demande (consigne → agent → réécriture si besoin → rendu). Refusée si le plan en a déjà une en cours. */
export async function demanderIteration(
  conversationUuid: string,
  options: { retour: string; renduId?: number | null; planche?: boolean; depuisNumero: number | null; reglages?: ContexteIteration["reglages"] },
): Promise<{ ok: true; demandeId: number } | { ok: false; erreur: string }> {
  const r = await lancerDemandeIteration(conversationUuid, options);
  revalidatePath("/", "layout");
  return r.ok ? { ok: true, demandeId: r.demandeId } : r;
}

/** « Ajouter un plan » (page Scénario) : pose la demande (l'agent écrit le plan, il est ajouté à la scène sans relecture). Une seule à la fois par film. */
export async function demanderAjoutPlan(
  projectId: number,
  episodeId: number,
  options: { consigne: string; position: ContexteAjoutPlan["position"]; sceneId: number | null; scene: string },
): Promise<{ ok: true; demandeId: number } | { ok: false; erreur: string }> {
  const r = await lancerDemandeAjoutPlan(projectId, episodeId, options);
  revalidatePath("/", "layout");
  return r;
}

/** « Nouvelle scène » (page Scénario) : pose la demande (l'agent écrit la scène et ses plans, ajoutés au film sans relecture). Une seule à la fois par film,
 * plan ou scène. Une consigne vide laisse l'agent proposer la suite. */
export async function demanderAjoutScene(
  projectId: number,
  episodeId: number,
  options: { consigne: string; place: ContexteAjoutScene["place"]; apres: string },
): Promise<{ ok: true; demandeId: number } | { ok: false; erreur: string }> {
  const r = await lancerDemandeAjoutScene(projectId, episodeId, options);
  revalidatePath("/", "layout");
  return r;
}

/** « Générer la fiche » d'un plan sans fiche : pose la demande (l'agent écrit la fiche, elle est enregistrée sans relecture). Une seule à la fois par plan. */
export async function demanderFichePlan(projectId: number, planUuid: string): Promise<{ ok: true; demandeId: number } | { ok: false; erreur: string }> {
  const r = await lancerDemandeFichePlan(projectId, planUuid);
  revalidatePath("/", "layout");
  return r;
}

/** « Écrire les fiches » (page Scénario) : une demande « Générer la fiche » par plan choisi, dans l'ordre donné (la file les écrit l'une après l'autre).
 * Un plan refusé (déjà une fiche, demande en cours) n'arrête pas les autres : ses raisons sont rendues avec le nombre de fiches lancées. */
export async function demanderFichesPlans(projectId: number, planUuids: string[]): Promise<{ lancees: number; erreurs: string[] }> {
  let lancees = 0;
  const erreurs: string[] = [];
  for (const uuid of planUuids) {
    const r = await lancerDemandeFichePlan(projectId, uuid);
    if (r.ok) lancees += 1;
    else erreurs.push(r.erreur);
  }
  revalidatePath("/", "layout");
  return { lancees, erreurs: [...new Set(erreurs)] };
}

/** Où en est une demande (sondage de la page d'un plan). */
export async function lireDemande(demandeId: number): Promise<VueDemande | null> {
  return lireDemandeVue(demandeId);
}

/** Annule une demande en cours (le ✕ de la page ; le panneau passe par `annulerTache`). */
export async function annulerLaDemande(demandeId: number): Promise<{ ok: true }> {
  await annulerDemande(demandeId);
  revalidatePath("/", "layout");
  return { ok: true };
}
