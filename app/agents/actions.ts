"use server";

/**
 * API SERVEUR DU SYSTÈME D'AGENTS — ce que l'interface (popup à étapes) appelle.
 * Types : lib/agents/types.ts. Lectures : lib/queries-agents.ts. Conception :
 * docs/CONCEPTION_AGENTS.md §14.
 *
 * Principes (décisions du 2026-10-02) :
 * - Rien n'est écrit sur les tables métier sans `appliquerSelection`. Tout le reste
 *   écrit des conversations, briefs (brouillon) et propositions.
 * - Deux profondeurs : `courte` (Consigne → Proposition → Appliqué) et `complete`
 *   (Conversation → Brief → Proposition → Appliqué).
 * - Une conversation par (projet, portée, cible). `ouvrirConversation` reprend,
 *   `nouvelleConversation` écrase la précédente.
 * - Les appels au modèle sont des TÂCHES de la file (agent_runs, ressource GPU unique) :
 *   les actions qui en lancent renvoient immédiatement (`runUuid`) ; l'UI sonde
 *   `lireConversation` / `lireProposition` (champ `tache`) ou le panneau du header
 *   (/api/taches) jusqu'à la fin. Fermer la popup n'interrompt rien.
 * - Chaque action renvoie `{ ok: true, ... } | { ok: false, erreur }` : jamais d'exception
 *   pour un cas métier.
 *
 * Parcours type — création d'un projet (profondeur complète) :
 *   const { conversationUuid } = await ouvrirConversation(projectId, "projet", null, "complete");
 *   await envoyerMessage(conversationUuid, "Un phare où le sel recouvre tout…"); // tâche « tour »
 *   // … lireConversation(conversationUuid).tache passe à "termine", messages gagne la réponse ;
 *   // briefPret = true → la fiche de notes est complète : un BROUILLON de brief existe déjà, l'UI propose « Voir le briefing »
 *   await genererBrief(conversationUuid);                    // fige la fiche en brouillon (immédiat), même incomplète
 *   // lireBrief(projectId) ; modifierChampBrief(projectId, "arc", "…") marque la section « fourni »
 *   const { propositionUuid } = await genererProposition(conversationUuid); // squelette : immédiat, sans LLM
 *   // lireProposition(propositionUuid) : groupes, compteurs, écrasements…
 *   await cocherChangements(propositionUuid, { groupe: "episodes" }, false);
 *   await appliquerSelection(propositionUuid);               // transaction : tout ou rien
 *
 * Parcours type — itération courte (prompt d'un asset) :
 *   const { conversationUuid } = await ouvrirConversation(pid, "asset", { code: "CHAR_maya" }, "courte");
 *   await genererProposition(conversationUuid, { consigne: "Regard plus dur, cheveux courts" }); // tâche
 *   await affiner(propositionUuid, "Garde le regard, rends les cheveux plus courts");
 *   await appliquerSelection(propositionUuid, { confirmeEcrasement: true });
 *
 * Garde-fous côté serveur (l'UI n'a pas à les refaire, seulement à les montrer) :
 * - verrou de portée : un changement hors de la portée demandée est refusé
 *   (`refuseRaison`, avertissement `hors_portee`) ;
 * - écraser un élément validé exige `confirmeEcrasement: true` ;
 * - un changement `bloque` (contrôle mécanique) ne s'applique pas tant qu'il n'est pas
 *   corrigé (`corrigerChangement`) ;
 * - la sélection s'applique en UNE transaction (tout ou rien), puis la proposition passe
 *   `appliquee` (tous ses changements appliqués) ou `partielle` (certains écartés, bloqués ou
 *   refusés d'office) ;
 * - une portée courte sans consigne, un brief déjà validé, un tour déjà en cours : erreur claire.
 */

import { revalidatePath } from "next/cache";
import * as service from "@/lib/agents/service";
import type { CibleDemandee, Profondeur, Portee, Resultat } from "@/lib/agents/types";

/** Les écritures invalident le cache des pages : la popup relit ensuite ses données par
 * les lectures de lib/queries-agents.ts. */
async function rafraichir<T extends { ok: boolean }>(r: T): Promise<T> {
  if (r.ok) revalidatePath("/", "layout");
  return r;
}

// --- Conversation -----------------------------------------------------------

/** Ouvre la conversation du (projet, portée, cible) : la reprend si elle existe, la crée
 * sinon. `cible` désigne l'existant visé (épisode : `{ id }`, plan : `{ uuid }`, asset :
 * `{ code }` ou `{ id }`) ; null pour la portée `projet`. `profondeur` n'est prise en compte
 * qu'à la création (défaut : `complete` pour un projet, `courte` sinon). `reprise` dit si une
 * conversation existait déjà (l'UI affiche « conversation en cours reprise »). */
export async function ouvrirConversation(
  projectId: number,
  portee: Portee,
  cible: CibleDemandee | null,
  profondeur?: Profondeur,
): Promise<Resultat<{ conversationUuid: string; reprise: boolean }>> {
  return rafraichir(await service.ouvrirConversation(projectId, portee, cible, profondeur));
}

/** Projet CONÇU dont l'accroche du scénariste a échoué : la relance (jamais une régénération d'une accroche réussie). */
export async function relancerAccroche(conversationUuid: string): Promise<Resultat> {
  return rafraichir(await service.relancerAccroche(conversationUuid));
}

/** Profondeur complète : ajoute le message de l'utilisateur et lance un tour de
 * conversation (tâche). Refusé si un tour est déjà en cours sur cette conversation. */
export async function envoyerMessage(conversationUuid: string, texte: string): Promise<Resultat<{ runUuid: string }>> {
  return rafraichir(await service.envoyerMessage(conversationUuid, texte));
}

/** Réponse par une carte de choix du scénariste (libellés retenus) : le texte envoyé est formulé côté serveur. */
export async function repondreAuChoix(conversationUuid: string, libelles: string[]): Promise<Resultat<{ runUuid: string }>> {
  return rafraichir(await service.repondreAuChoix(conversationUuid, libelles));
}

// --- Brief ------------------------------------------------------------------

/** Corrige à la main une section du brief (clé de premier niveau : `arc`, `style`, `lieux`…).
 * La valeur est validée contre le schéma du brief ; la section passe au statut `fourni`.
 * Valable sur un brouillon comme sur le brief valide du projet. */
export async function modifierChampBrief(projectId: number, section: string, valeur: unknown): Promise<Resultat> {
  return rafraichir(await service.modifierChampBrief(projectId, section, valeur));
}

// --- Proposition ------------------------------------------------------------

/** « Corriger après visionnage » (conversation de portée `plan`, plan qui a un RENDU terminé) : une tâche
 * `iteration-plan`, proposition simple et affinable. `retour` = ce que l'utilisateur a vu (obligatoire). Le worker
 * extrait la planche de vignettes du dernier rendu et mesure sa durée réelle à l'exécution ; la proposition est
 * une écriture PARTIELLE de la fiche (seules les sections corrigées), ou un diagnostic sans écriture. Refusé sans
 * rendu (jamais de correction à l'aveugle) ou sans fiche. */
export async function genererIteration(
  conversationUuid: string,
  options: { retour: string; renduId?: number | null; planche?: boolean },
): Promise<Resultat<{ propositionUuid: string; runUuid: string }>> {
  return rafraichir(await service.genererIteration(conversationUuid, { retour: options.retour, renduId: options.renduId, planche: options.planche }));
}

/** « Rejeter » : abandonne la proposition (statut `rejetee`) ; la conversation reste, on
 * repart de l'étape précédente (Consigne ou Brief). */
export async function rejeter(propositionUuid: string): Promise<Resultat> {
  return rafraichir(await service.rejeter(propositionUuid));
}

