"use server";

/**
 * API SERVEUR DE LA RÉVISION D'ÉPISODE (le réalisateur) — ce que l'écran `/p/<projet>/realisateur/<épisode>` appelle.
 * Le moteur est dans lib/agents/revision/ (docs/FRICTIONS.md 2026-10-09, « révision d'épisode »). Ici, aucune logique : des enveloppes.
 *
 * - Les décisions sont un BROUILLON : rien n'est écrit sur les tables métier avant `appliquerRevisionAction` (une proposition, une
 *   transaction, puis la conversation se ferme).
 * - Envoyer un message POSE des tâches dans la file (analyse puis réponse) et revient tout de suite : l'écran sonde
 *   `lireVueRevisionAction` (champ `tache`) tant qu'une tâche est active.
 * - Chaque action renvoie `{ ok: true, … } | { ok: false, erreur }` : jamais d'exception pour un cas métier.
 */

import { revalidatePath } from "next/cache";
import type { EtatTache } from "@/lib/agents/types";
import {
  abandonnerRevision,
  annulerRendusDuPlan,
  appliquerRevision,
  envoyerMessageRevision,
  lireVueRevision,
  ouvrirRevision,
  reconfirmerDecision,
  relancerTourRevision,
  retirerDecision,
  type EtatRevision,
  type ResultatApplicationRevision,
} from "@/lib/agents/revision/revision-db";

type Resultat<T = object> = ({ ok: true } & T) | { ok: false; erreur: string };

/** Les écritures invalident le cache des pages (la pastille de l'onglet « Réalisateur », les rendus périmés après application). */
async function rafraichir<T extends { ok: boolean }>(r: T): Promise<T> {
  if (r.ok) revalidatePath("/", "layout");
  return r;
}

/** Ouvre (ou reprend) la révision de l'épisode : une révision terminée laisse la place à une neuve. */
export async function ouvrirRevisionAction(projectId: number, episodeId: number): Promise<Resultat<{ conversationUuid: string; reprise: boolean }>> {
  return rafraichir(await ouvrirRevision(projectId, episodeId));
}

export async function lireVueRevisionAction(conversationUuid: string): Promise<{ etat: EtatRevision; tache: EtatTache | null } | null> {
  return lireVueRevision(conversationUuid);
}

export async function envoyerMessageRevisionAction(conversationUuid: string, texte: string): Promise<Resultat<{ runUuid: string }>> {
  return rafraichir(await envoyerMessageRevision(conversationUuid, texte));
}

export async function relancerTourRevisionAction(conversationUuid: string): Promise<Resultat<{ runUuid: string }>> {
  return rafraichir(await relancerTourRevision(conversationUuid));
}

export async function retirerDecisionAction(conversationUuid: string, decisionUuid: string): Promise<Resultat> {
  return rafraichir(await retirerDecision(conversationUuid, decisionUuid));
}

export async function reconfirmerDecisionAction(conversationUuid: string, decisionUuid: string): Promise<Resultat> {
  return rafraichir(await reconfirmerDecision(conversationUuid, decisionUuid));
}

export async function abandonnerRevisionAction(conversationUuid: string): Promise<Resultat> {
  return rafraichir(await abandonnerRevision(conversationUuid));
}

/** Applique le chantier. `confirmeEcrasement` : la glissière rouge vaut confirmation (la barre du bas a dit ce qui est écrasé). */
export async function appliquerRevisionAction(conversationUuid: string, confirmeEcrasement: boolean): Promise<ResultatApplicationRevision> {
  return rafraichir(await appliquerRevision(conversationUuid, { confirmeEcrasement }));
}

export async function annulerRendusDuPlanAction(conversationUuid: string, planUuid: string): Promise<Resultat<{ enCours: boolean }>> {
  return rafraichir(await annulerRendusDuPlan(conversationUuid, planUuid));
}
