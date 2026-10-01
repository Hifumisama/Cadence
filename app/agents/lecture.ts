"use server";

import { db } from "@/db";
import { plans } from "@/db/schema";
import { asc, eq } from "drizzle-orm";
import type {
  CibleDemandee,
  ContexteUtilise,
  EpisodePourScenario,
  EstimationGeneration,
  Portee,
  VueBrief,
  VueConversation,
  VueProposition,
} from "@/lib/agents/types";
import { episodesPourScenarios } from "@/lib/agents/service";
import {
  apercuContexte,
  estimerGeneration,
  estimerScenarios,
  lireBrief,
  lireConversation,
  lirePropositionCourante,
  lireProposition,
  trouverConversation,
} from "@/lib/queries-agents";

// Enveloppes de LECTURE du système d'agents pour l'interface (le sondage de la popup).
// lib/queries-agents.ts n'est pas appelable depuis un composant client : ces fonctions
// serveur le sont, sans rien écrire. Les écritures vivent dans app/agents/actions.ts.

export async function lireConversationVue(conversationUuid: string): Promise<VueConversation | null> {
  return lireConversation(conversationUuid);
}

export async function trouverConversationVue(
  projectId: number,
  portee: Portee,
  cible: CibleDemandee | null,
): Promise<VueConversation | null> {
  return trouverConversation(projectId, portee, cible);
}

export async function lireBriefVue(projectId: number): Promise<VueBrief | null> {
  return lireBrief(projectId);
}

export async function lirePropositionVue(propositionUuid: string): Promise<VueProposition | null> {
  return lireProposition(propositionUuid);
}

export async function lirePropositionCouranteVue(conversationUuid: string): Promise<VueProposition | null> {
  return lirePropositionCourante(conversationUuid);
}

export async function apercuContexteVue(
  projectId: number,
  portee: Portee,
  cible: CibleDemandee | null,
): Promise<ContexteUtilise[]> {
  return apercuContexte(projectId, portee, cible);
}

export async function estimerGenerationVue(conversationUuid: string): Promise<EstimationGeneration | null> {
  return estimerGeneration(conversationUuid);
}

/** Les épisodes proposables à l'écriture de leur scénario (le sélecteur du lot) : tout le projet,
 * ou une saison. `vide` = rien d'écrit : ceux-là sont cochés d'office. */
export async function listerEpisodesPourScenariosVue(projectId: number, saisonId: number | null): Promise<EpisodePourScenario[]> {
  return episodesPourScenarios(projectId, saisonId);
}

export async function estimerScenariosVue(episodeIds: number[]): Promise<EstimationGeneration> {
  return estimerScenarios(episodeIds);
}

/** Les plans d'un épisode dans l'ordre, avec leur RANG affiché (base 1) : le sélecteur
 * « position » d'une création de plan. L'identifiant reste l'uuid (F03). */
export async function listerPlansEpisode(episodeId: number): Promise<{ uuid: string; titre: string; rang: number }[]> {
  const lignes = await db
    .select({ uuid: plans.uuid, titre: plans.titre })
    .from(plans)
    .where(eq(plans.episodeId, episodeId))
    .orderBy(asc(plans.ordre), asc(plans.id));
  return lignes.map((p, i) => ({ uuid: p.uuid, titre: p.titre, rang: i + 1 }));
}
