import { eq } from "drizzle-orm";
import { db } from "../../db";
import { agentConversations, agentRuns, assets, briefs, plans, propositions } from "../../db/schema";
import { methodeApplicable } from "../../lib/assetCode";
import { sortieVersBrief } from "../../lib/agents/brief";
import type { ChangementBrut } from "../../lib/agents/changements";
import {
  depuisCorrectionPlan,
  depuisPlanAInserer,
  depuisPromptAsset,
  depuisScenarioEpisode,
  type SortiePromptAsset,
  type SortieScenarioEpisode,
} from "../../lib/agents/conversion";
import { entreeScenarioEpisode } from "../../lib/agents/contexte";
import { enregistrerChangements } from "../../lib/agents/proposition-db";
import type { Position } from "../../lib/agents/types";
import type { Tx } from "../../lib/ordre-plans";

/** Ce que devient le résultat validé d'une tâche du système d'agents, DANS la transaction qui
 * l'écrit (worker/llm.ts) : un échec ici annule tout et la tâche est marquée échouée.
 * - `tour`        : le message de l'agent rejoint la conversation ; `briefPret` est mis à jour ;
 * - `brief`       : un BROUILLON de brief est écrit (jamais par-dessus un brief validé) ;
 * - `proposition` : les changements sont construits EN CODE depuis le JSON du skill. */

type RunAgent = typeof agentRuns.$inferSelect;
export type OptionsRunAgent = { modele?: string; variante?: string; position?: Position; sceneVoisineId?: number | null };

export async function postTraiterRun(tx: Tx, run: RunAgent, json: unknown): Promise<void> {
  if (!run.but) return; // appel hors système d'agents (npm run llm:tache) : rien à faire
  if (run.but === "tour") return postTour(tx, run, json as { reponse: string; briefPret: boolean });
  if (run.but === "brief") return postBrief(tx, run, json as Record<string, unknown>);
  if (run.but === "proposition") return postProposition(tx, run, json);
}

async function postTour(tx: Tx, run: RunAgent, sortie: { reponse: string; briefPret: boolean }) {
  if (run.conversationId == null) return;
  const [conv] = await tx.select().from(agentConversations).where(eq(agentConversations.id, run.conversationId));
  if (!conv) return; // conversation écrasée entre-temps : le tour est perdu, sans erreur
  const messages = [...((conv.messages as unknown[]) ?? []), { role: "assistant", content: sortie.reponse, at: new Date().toISOString() }];
  await tx
    .update(agentConversations)
    .set({ messages, briefPret: sortie.briefPret === true, etape: "conversation", updatedAt: new Date() })
    .where(eq(agentConversations.id, conv.id));
}

async function postBrief(tx: Tx, run: RunAgent, sortie: Record<string, unknown>) {
  if (run.projectId == null) throw new Error("Brief sans projet.");
  const { contenu, statuts } = sortieVersBrief(sortie);
  const [existant] = await tx.select().from(briefs).where(eq(briefs.projectId, run.projectId));
  if (existant?.statut === "valide") throw new Error("Le projet a déjà un brief validé : le brouillon n'a pas été écrit par-dessus.");
  if (existant) {
    await tx
      .update(briefs)
      .set({ contenu, statuts, version: existant.version + 1, updatedAt: new Date() })
      .where(eq(briefs.id, existant.id));
  } else {
    await tx.insert(briefs).values({ projectId: run.projectId, statut: "brouillon", source: "conversation", contenu, statuts });
  }
  if (run.conversationId != null) {
    await tx.update(agentConversations).set({ etape: "brief", updatedAt: new Date() }).where(eq(agentConversations.id, run.conversationId));
  }
}

async function postProposition(tx: Tx, run: RunAgent, json: unknown) {
  if (run.propositionId == null) throw new Error("Tâche de proposition sans proposition.");
  const [prop] = await tx.select().from(propositions).where(eq(propositions.id, run.propositionId));
  if (!prop) return; // proposition supprimée entre-temps
  if (prop.statut !== "en_generation") return; // rejetée pendant la génération : on n'écrit rien
  const options = (run.options ?? {}) as OptionsRunAgent;
  const scope = { type: prop.portee as "projet" | "saison" | "episode" | "plan" | "asset", cibleId: prop.cibleId };

  let bruts: ChangementBrut[] = [];
  if (run.skill === "prompt-asset") {
    if (prop.cibleId == null) throw new Error("Proposition d'asset sans cible.");
    const [asset] = await tx.select().from(assets).where(eq(assets.id, prop.cibleId));
    if (!asset) throw new Error("L'asset visé n'existe plus.");
    bruts = depuisPromptAsset(json as SortiePromptAsset, {
      id: asset.id,
      code: asset.code,
      type: asset.type,
      methodeGeneration: asset.methodeGeneration,
      methodeApplicable: methodeApplicable(asset.type),
    });
  } else if (run.skill === "scenario-episode") {
    const sortie = json as SortieScenarioEpisode;
    if (prop.portee === "plan") {
      if (prop.cibleId == null) throw new Error("Proposition de plan sans cible.");
      const [plan] = await tx.select({ uuid: plans.uuid, titre: plans.titre }).from(plans).where(eq(plans.id, prop.cibleId));
      if (!plan) throw new Error("Le plan visé n'existe plus.");
      bruts = depuisCorrectionPlan(sortie, plan);
    } else if (prop.portee === "episode" && prop.cibleId != null) {
      if (options.position) {
        bruts = depuisPlanAInserer(sortie, { episodeId: prop.cibleId, position: options.position, sceneId: options.sceneVoisineId ?? null });
      } else {
        const ep = await entreeScenarioEpisode(tx, prop.projectId, prop.cibleId, "");
        if (!ep) throw new Error("L'épisode visé n'existe plus.");
        const entree = ep.entree as { episode: { titre: string; resume: string }; scenesExistantes: { id: number; titre: string }[] };
        const lesPlans = await tx
          .select({ uuid: plans.uuid, titre: plans.titre, sceneId: plans.sceneId })
          .from(plans)
          .where(eq(plans.episodeId, prop.cibleId));
        bruts = depuisScenarioEpisode(sortie, {
          id: prop.cibleId,
          titre: entree.episode.titre,
          resume: entree.episode.resume,
          scenes: entree.scenesExistantes,
          plans: lesPlans,
        });
      }
    } else {
      throw new Error(`Portée « ${prop.portee} » non prise en charge pour le skill scenario-episode.`);
    }
  } else {
    throw new Error(`Skill « ${run.skill} » : pas de conversion en proposition.`);
  }

  await enregistrerChangements(tx, prop.id, prop.projectId, scope, bruts);
  if (prop.conversationId != null) {
    await tx.update(agentConversations).set({ etape: "proposition", updatedAt: new Date() }).where(eq(agentConversations.id, prop.conversationId));
  }
}

/** Échec ou annulation d'une tâche d'agent : la proposition liée n'attendra pas indéfiniment. */
export async function surEchecRun(run: RunAgent, message: string): Promise<void> {
  if (run.but === "proposition" && run.propositionId != null) {
    await db
      .update(propositions)
      .set({ statut: "echouee", erreur: message.slice(0, 2000) })
      .where(eq(propositions.id, run.propositionId));
  }
}
