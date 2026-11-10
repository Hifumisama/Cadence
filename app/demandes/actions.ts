"use server";

import { revalidatePath } from "next/cache";
import { annulerDemande, lancerDemandeAjoutPlan, lancerDemandeAjoutScene, lancerDemandeFichePlan, lancerDemandesFiches, lancerDemandeIteration, deplacerIterationEnAttente, lireDemandeVue, modifierConsigneIteration, type VueDemande } from "@/lib/demandes-db";
import type { ContexteAjoutPlan, ContexteAjoutScene, ContexteIteration } from "@/lib/demandes";

// Les DEMANDES (lib/demandes.ts) côté interface : « Itérer » en pose une, le worker l'enchaîne jusqu'au rendu (lib/demandes-db.ts), la page
// ne fait que la suivre. Quitter la page ne coupe rien.

/** « Itérer » un plan : pose la demande (consigne → agent → réécriture si besoin → rendu). Refusée si le plan en a déjà une en cours. */
export async function demanderIteration(
  conversationUuid: string,
  options: { retour: string; renduId?: number | null; planche?: boolean; depuisNumero: number | null; reglages?: ContexteIteration["reglages"] },
): Promise<{ ok: true; demandeId: number; enAttente: boolean } | { ok: false; erreur: string }> {
  const r = await lancerDemandeIteration(conversationUuid, options);
  revalidatePath("/", "layout");
  return r.ok ? { ok: true, demandeId: r.demandeId, enAttente: r.enAttente } : r;
}

/** Corrige la consigne d'une itération qui attend son tour (panneau des tâches). Refusée une fois l'itération démarrée. */
export async function corrigerConsigneIteration(demandeId: number, texte: string): Promise<{ ok: true } | { ok: false; erreur: string }> {
  const r = await modifierConsigneIteration(demandeId, texte);
  revalidatePath("/", "layout");
  return r.ok ? { ok: true } : r;
}

/** Monte ou descend une itération en attente dans la file (panneau des tâches). */
export async function deplacerIteration(demandeId: number, sens: -1 | 1): Promise<{ ok: true } | { ok: false; erreur: string }> {
  const r = await deplacerIterationEnAttente(demandeId, sens);
  revalidatePath("/", "layout");
  return r.ok ? { ok: true } : r;
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

/** « Générer la fiche » d'un plan : pose la demande (le plan est préparé si besoin : références, assets manquants, prompts, images ; puis Open H3 IR compile
 * la fiche, enregistrée sans relecture). Une seule à la fois par plan. Open H3 IR seul (lib/h3ir/preparation.ts). */
export async function demanderFichePlan(projectId: number, planUuid: string): Promise<{ ok: true; demandeId: number } | { ok: false; erreur: string }> {
  const r = await lancerDemandeFichePlan(projectId, planUuid);
  revalidatePath("/", "layout");
  return r;
}

/** « Écrire les fiches » (page Scénario) : une demande « Générer la fiche » par plan choisi, posées dans l'ordre du scénario (lib/demandes-db.ts,
 * `lancerDemandesFiches`). Un plan refusé (demande en cours) n'arrête pas les autres : ses raisons sont rendues avec le nombre de fiches lancées. */
export async function demanderFichesPlans(projectId: number, planUuids: string[]): Promise<{ lancees: number; erreurs: string[] }> {
  const r = await lancerDemandesFiches(projectId, planUuids);
  revalidatePath("/", "layout");
  return { lancees: r.lancees, erreurs: r.erreurs };
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
