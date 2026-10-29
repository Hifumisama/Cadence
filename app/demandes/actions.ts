"use server";

import { revalidatePath } from "next/cache";
import { annulerDemande, lancerDemandeAjoutPlan, lancerDemandeIteration, lireDemandeVue, type VueDemande } from "@/lib/demandes-db";
import type { ContexteAjoutPlan, ContexteIteration } from "@/lib/demandes";

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
