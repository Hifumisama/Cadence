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
 *   // briefPret = true → l'UI propose « Vers le briefing »
 *   await genererBrief(conversationUuid);                    // tâche « brief » → brouillon
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
import type {
  CibleDemandee,
  Position,
  Profondeur,
  Portee,
  Resultat,
  ResultatApplication,
} from "@/lib/agents/types";

/** Les écritures invalident le cache des pages : la popup relit ensuite ses données par
 * les lectures de lib/queries-agents.ts. */
async function rafraichir<T extends { ok: boolean }>(r: T): Promise<T> {
  if (r.ok) revalidatePath("/", "layout");
  return r;
}

// --- Conversation -----------------------------------------------------------

/** Ouvre la conversation du (projet, portée, cible) : la reprend si elle existe, la crée
 * sinon. `cible` désigne l'existant visé (saison/épisode : `{ id }`, plan : `{ uuid }`, asset :
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

/** Démarre une conversation NEUVE sur la même cible : écrase la précédente (messages,
 * consigne, proposition courante ; le brief VALIDE n'est jamais touché). Même signature que
 * `ouvrirConversation`. */
export async function nouvelleConversation(
  projectId: number,
  portee: Portee,
  cible: CibleDemandee | null,
  profondeur?: Profondeur,
): Promise<Resultat<{ conversationUuid: string }>> {
  return rafraichir(await service.nouvelleConversation(projectId, portee, cible, profondeur));
}

/** Profondeur complète : ajoute le message de l'utilisateur et lance un tour de
 * conversation (tâche). Refusé si un tour est déjà en cours sur cette conversation. */
export async function envoyerMessage(conversationUuid: string, texte: string): Promise<Resultat<{ runUuid: string }>> {
  return rafraichir(await service.envoyerMessage(conversationUuid, texte));
}

/** Remet la conversation à zéro (messages, consigne, brouillon de brief, proposition
 * courante rejetée). Le brief VALIDE du projet n'est pas touché. L'UI demande une
 * confirmation qui liste ce qui est perdu. */
export async function reinitialiser(conversationUuid: string): Promise<Resultat> {
  return rafraichir(await service.reinitialiser(conversationUuid));
}

// --- Brief ------------------------------------------------------------------

/** Profondeur complète : lance la génération du brief à partir de la conversation (tâche
 * `brief`, skill `brief-projet`). À la fin, un BROUILLON de brief existe (`lireBrief`) et
 * l'étape de la conversation passe à `brief`. Refusé si le projet a déjà un brief validé. */
export async function genererBrief(conversationUuid: string): Promise<Resultat<{ runUuid: string }>> {
  return rafraichir(await service.genererBrief(conversationUuid));
}

/** « Rejeter » le brief en cours (BROUILLON) : il est abandonné et la conversation revient à
 * l'étape `conversation`, messages conservés ; une génération de brief ou de proposition en
 * cours est arrêtée. Refusé si le brief est déjà validé (on le modifie section par section). */
export async function rejeterBrief(conversationUuid: string): Promise<Resultat> {
  return rafraichir(await service.rejeterBrief(conversationUuid));
}

/** Corrige à la main une section du brief (clé de premier niveau : `arc`, `style`, `lieux`…).
 * La valeur est validée contre le schéma du brief ; la section passe au statut `fourni`.
 * Valable sur un brouillon comme sur le brief valide du projet. */
export async function modifierChampBrief(projectId: number, section: string, valeur: unknown): Promise<Resultat> {
  return rafraichir(await service.modifierChampBrief(projectId, section, valeur));
}

// --- Proposition ------------------------------------------------------------

/** Lance la génération d'une proposition pour la conversation.
 * - profondeur `complete` (création de projet) : le squelette (clause de style, saison,
 *   épisodes, brief) est construit EN CODE depuis le brief : immédiat, `runUuid` null ;
 * - profondeur `courte` : tâche `proposition` (skill selon la portée : `asset` →
 *   `prompt-asset`, `episode` / `plan` → `scenario-episode`). `consigne` = l'intention en une
 *   ligne (obligatoire) ; `position` (insertion d'un plan dans un épisode) = après quel plan
 *   (uuid) ou début/fin.
 * La proposition naît `en_generation` puis `prete` (ou `echouee`). */
export async function genererProposition(
  conversationUuid: string,
  options?: { consigne?: string; position?: Position },
): Promise<Resultat<{ propositionUuid: string; runUuid: string | null }>> {
  return rafraichir(await service.genererProposition(conversationUuid, options));
}

/** Étape 2 : crée le registre d'assets depuis le brief (un lot, une sous-tâche par master : personnage,
 * lieu). `codes` = les assets à traiter (par défaut : ceux qui manquent ou n'ont pas de prompt). Depuis
 * la conversation du PROJET. */
export async function genererRegistre(
  conversationUuid: string,
  options: { codes?: string[]; consigne?: string } = {},
) {
  return rafraichir(await service.genererRegistre(conversationUuid, options));
}

/** Inventaire des assets (avant les fiches de plan) : un appel qui lit tous les plans et le registre et propose les
 * assets manquants en une liste consolidée (sans doublons). Depuis la conversation du PROJET. */
export async function genererInventaire(
  conversationUuid: string,
  options: { consigne?: string } = {},
): Promise<Resultat<{ propositionUuid: string; runUuid: string }>> {
  return rafraichir(await service.genererInventaire(conversationUuid, options));
}

/** Casting des voix : crée une voix pour chaque personnage qui parle et n'en a pas (et la voix off si des
 * répliques la réclament) : un lot, une sous-tâche `prompt-voix` par voix. `cles` = les voix à traiter (par
 * défaut : toutes celles qui manquent). Depuis la conversation du PROJET. La voix s'édite ensuite au casting
 * vocal ; le son se génère à part. */
export async function genererVoix(
  conversationUuid: string,
  options: { cles?: string[]; consigne?: string } = {},
) {
  return rafraichir(await service.genererVoix(conversationUuid, options));
}

/** Étape 3 : écrire la FICHE d'un plan (conversation de portée `plan` : une proposition simple, affinable)
 * ou celles des plans d'un épisode, d'une saison ou du projet (un LOT, une sous-tâche `plan-h3` par plan,
 * clé `plan:<uuid>`). `planUuids` = les plans à traiter (par défaut : ceux qui n'ont pas de fiche). Une fiche
 * remplace ensemble les six sections et les références du plan ; un plan qui a déjà une fiche (ou un rendu)
 * apparaît en « risque d'écrasement », décoché. Les assets manquants sont proposés à la création. */
export async function genererFiches(
  conversationUuid: string,
  options: { planUuids?: string[]; consigne?: string } = {},
): Promise<Resultat<{ propositionUuid: string; nbSousTaches: number }>> {
  return rafraichir(await service.genererFiches(conversationUuid, options));
}

/** « Corriger après visionnage » (conversation de portée `plan`, plan qui a un RENDU terminé) : une tâche
 * `iteration-plan`, proposition simple et affinable. `retour` = ce que l'utilisateur a vu (obligatoire). Le worker
 * extrait la planche de vignettes du dernier rendu et mesure sa durée réelle à l'exécution ; la proposition est
 * une écriture PARTIELLE de la fiche (seules les sections corrigées), ou un diagnostic sans écriture. Refusé sans
 * rendu (jamais de correction à l'aveugle) ou sans fiche. */
export async function genererIteration(
  conversationUuid: string,
  options: { retour: string },
): Promise<Resultat<{ propositionUuid: string; runUuid: string }>> {
  return rafraichir(await service.genererIteration(conversationUuid, options));
}

/** Après l'application d'une fiche : écrire les prompts d'image des assets qu'elle a CRÉÉS (un lot
 * `prompt-asset`, dans la conversation du PROJET, seule portée où l'on modifie un asset existant). Renvoie la
 * conversation du projet, que l'interface ouvre pour suivre le lot. Jamais lancé tout seul. */
export async function genererPromptsAssetsCrees(
  propositionUuid: string,
  options: { consigne?: string } = {},
): Promise<Resultat<{ conversationUuid: string; propositionUuid: string; nbSousTaches: number }>> {
  return rafraichir(await service.genererPromptsAssetsCrees(propositionUuid, options));
}

/** « Écrire les scénarios » (étape 1 du pipeline) depuis une conversation de portée PROJET ou
 * SAISON, par exemple depuis l'étape « Appliqué » du squelette : une proposition EN LOT, une
 * sous-tâche (une tâche `scenario-episode`) par épisode, exécutées l'une après l'autre dans la file.
 * Par défaut : les épisodes VIDES ; `episodeIds` en choisit d'autres (un épisode qui a déjà du
 * contenu voit ses modifications en section d'écrasement, décochées). La proposition reste
 * `en_generation` tant qu'une sous-tâche est active (`VueProposition.lot` donne l'avancement), puis
 * `prete` ; un échec isolé ne perd pas le reste. */
export async function genererScenarios(
  conversationUuid: string,
  options?: { episodeIds?: number[]; consigne?: string },
): Promise<Resultat<{ propositionUuid: string; nbSousTaches: number }>> {
  return rafraichir(await service.genererScenarios(conversationUuid, options));
}

/** Relance UNE sous-tâche d'un lot (échouée, annulée ou à refaire), avec un retour libre facultatif.
 * `cle` = `VueSousTache.cle`. Les autres sous-tâches ne bougent pas. */
export async function relancerSousTache(
  propositionUuid: string,
  cle: string,
  retour?: string,
): Promise<Resultat<{ runUuid: string }>> {
  return rafraichir(await service.relancerSousTache(propositionUuid, cle, retour));
}

/** Annule un lot : sous-tâches en attente annulées, celle qui tourne interrompue. Ce qui est déjà
 * terminé reste relisible. */
export async function annulerLot(propositionUuid: string): Promise<Resultat<{ resultat: "annule" | "demande" | "rien" }>> {
  return rafraichir(await service.annulerLotProposition(propositionUuid));
}

/** Coche/décoche un changement. Refusé pour un changement `bloque` (à corriger d'abord) ou
 * `refuseRaison` (hors portée, non pris en charge). */
export async function cocherChangement(changementId: number, coche: boolean): Promise<Resultat> {
  return rafraichir(await service.cocherChangement(changementId, coche));
}

/** Coche/décoche en lot : tout un groupe (`{ groupe: "episodes" }`, tel qu'affiché : l'id de
 * groupe de `VueGroupe`) ou une liste d'ids (`{ ids: [3, 4] }`). Les changements `bloque` ou
 * refusés sont ignorés (jamais cochés). */
export async function cocherChangements(
  propositionUuid: string,
  selection: { groupe?: string; ids?: number[] },
  coche: boolean,
): Promise<Resultat<{ modifies: number }>> {
  return rafraichir(await service.cocherChangements(propositionUuid, selection, coche));
}

/** Corrige sur place un changement bloqué par un contrôle (ex. durée d'un plan > 15 s) : le
 * contrôle est rejoué ; s'il passe, l'avertissement `bloque_controle` disparaît. */
export async function corrigerChangement(
  changementId: number,
  valeurs: { dureeGenerationSecondes?: number },
): Promise<Resultat> {
  return rafraichir(await service.corrigerChangement(changementId, valeurs));
}

/** « Rejeter » : abandonne la proposition (statut `rejetee`) ; la conversation reste, on
 * repart de l'étape précédente (Consigne ou Brief). */
export async function rejeter(propositionUuid: string): Promise<Resultat> {
  return rafraichir(await service.rejeter(propositionUuid));
}

/** « Affiner » : retour libre (« garde 1 et 3, change 2 »). Une NOUVELLE proposition naît,
 * dérivée de la précédente (`parentUuid`) : l'agent reçoit la précédente + le retour. La
 * précédente passe `rejetee`. Lance une tâche (`runUuid`). Pas pour un squelette (construit en
 * code) : corriger le brief puis régénérer. */
export async function affiner(
  propositionUuid: string,
  retour: string,
): Promise<Resultat<{ propositionUuid: string; runUuid: string }>> {
  return rafraichir(await service.affiner(propositionUuid, retour));
}

/** Applique la sélection (changements cochés) en UNE transaction. Écraser du validé exige
 * `confirmeEcrasement: true` ; sinon `{ ok: false, confirmationRequise: [...] }` liste ce qui
 * sera perdu. Refuse hors portée. Passe la proposition à `appliquee` (tous ses changements
 * appliqués) ou `partielle`. */
export async function appliquerSelection(
  propositionUuid: string,
  options?: { confirmeEcrasement?: boolean },
): Promise<ResultatApplication> {
  return rafraichir(await service.appliquerSelection(propositionUuid, options));
}
