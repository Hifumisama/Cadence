"use server";

import { db } from "@/db";
import { plans } from "@/db/schema";
import { asc, eq } from "drizzle-orm";
import type {
  CibleDemandee,
  ContexteUtilise,
  EpisodePourScenario,
  EstimationGeneration,
  EtatIterationPlan,
  Portee,
  PlanPourFiche,
  VueBrief,
  VueConversation,
  VueProposition,
} from "@/lib/agents/types";
import type { ResumeConversation } from "@/lib/queries-agents";
import type { CandidatRegistre } from "@/lib/agents/registre";
import type { CandidatVoix } from "@/lib/agents/voix-casting";
import { assetsCreesSansPrompt, candidatsDuProjet, candidatsVoixDuProjet, episodesPourScenarios, lireEtatIteration, plansPourFiches, propositionParUuid } from "@/lib/agents/service";
import {
  apercuContexte,
  estimerGeneration,
  estimerIteration,
  estimerRegistre,
  estimerFiches,
  estimerVoix,
  estimerScenarios,
  lireBrief,
  lireConversation,
  listerConversationsProjet,
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

/** Les masters que décrit le brief (personnages, lieux) avec ce qui existe déjà dans le registre :
 * le sélecteur de « créer le registre ». `aTraiter` = coché d'office (manque ou sans prompt). */
export async function listerCandidatsRegistreVue(projectId: number): Promise<CandidatRegistre[]> {
  return candidatsDuProjet(projectId);
}

/** Les voix à créer (personnages qui parlent sans voix, voix off) : le sélecteur du « casting des voix ». */
export async function listerCandidatsVoixVue(projectId: number): Promise<CandidatVoix[]> {
  return candidatsVoixDuProjet(projectId);
}

export async function estimerVoixVue(nbVoix: number): Promise<EstimationGeneration> {
  return estimerVoix(nbVoix);
}

export async function estimerRegistreVue(nbAssets: number): Promise<EstimationGeneration> {
  return estimerRegistre(nbAssets);
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

/** Les plans d'une portée (projet, saison, épisode, un plan) proposables à l'écriture de leur fiche : le
 * sélecteur du lot « fiches de plan ». `aDesSections` = déjà écrit : décoché d'office (écrasement). */
export async function listerPlansPourFichesVue(projectId: number, portee: Portee, cibleId: number | null): Promise<PlanPourFiche[]> {
  return plansPourFiches(projectId, portee, cibleId);
}

export async function estimerFichesVue(nbPlans: number): Promise<EstimationGeneration> {
  return estimerFiches(nbPlans);
}

/** « Corriger après visionnage » : le rendu qui sera regardé, la fiche, les corrections déjà tentées. */
export async function lireEtatIterationVue(projectId: number, planUuid: string): Promise<EtatIterationPlan | null> {
  return lireEtatIteration(projectId, planUuid);
}

export async function estimerIterationVue(): Promise<EstimationGeneration> {
  return estimerIteration();
}

/** Les assets créés par une proposition de fiches (appliquée) qui attendent encore leur prompt d'image :
 * la suite « écrire les prompts des assets créés ». */
export async function assetsCreesSansPromptVue(propositionUuid: string): Promise<{ id: number; code: string; type: string }[]> {
  const p = await propositionParUuid(propositionUuid);
  return p ? assetsCreesSansPrompt(p.id) : [];
}

/** Les conversations du projet (trace de ce qui a déjà été demandé), pour la fenêtre de l'agent. */
export async function listerConversationsProjetVue(projectId: number): Promise<ResumeConversation[]> {
  return listerConversationsProjet(projectId);
}
