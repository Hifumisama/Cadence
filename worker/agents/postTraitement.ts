import { and, eq } from "drizzle-orm";
import { db } from "../../db";
import { agentConversations, agentRuns, assets, briefs, plans, propositions } from "../../db/schema";
import { methodeApplicable } from "../../lib/assetCode";
import { fusionnerPartielDansBrouillon, sortieVersBrief } from "../../lib/agents/brief";
import type { ChangementBrut } from "../../lib/agents/changements";
import {
  depuisCorrectionPlan,
  depuisPlanAInserer,
  depuisPromptAsset,
  depuisCastingVoix,
  depuisRegistreAsset,
  depuisScenarioEpisode,
  type EpisodeCourant,
  type SortiePromptAsset,
  type SortiePromptVoix,
  type SortieScenarioEpisode,
} from "../../lib/agents/conversion";
import { finaliserLot, runsDuLot } from "../../lib/agents/lots";
import { PAS_ORDRE_SOUS_TACHE, episodeIdDeCle, groupeEpisode, rangSousTache } from "../../lib/agents/lots-pur";
import { entreeScenarioEpisode } from "../../lib/agents/contexte";
import { codeDeCleAsset } from "../../lib/agents/registre";
import { codeDeCleVoix } from "../../lib/agents/voix-casting";
import { enregistrerChangements } from "../../lib/agents/proposition-db";
import type { BriefContenu, Position, StatutChamp } from "../../lib/agents/types";
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
  const genere = sortieVersBrief(sortie);
  const [existant] = await tx.select().from(briefs).where(eq(briefs.projectId, run.projectId));
  if (existant?.statut === "valide") throw new Error("Le projet a déjà un brief validé : le brouillon n'a pas été écrit par-dessus.");
  // Un brief partiel (style, notes… posés à la main) : ce que l'utilisateur a posé gagne sur ce que l'agent rédige.
  const { contenu, statuts } =
    existant?.statut === "partiel"
      ? fusionnerPartielDansBrouillon(genere, { contenu: existant.contenu as BriefContenu, statuts: existant.statuts as Record<string, StatutChamp> })
      : genere;
  if (existant) {
    await tx
      .update(briefs)
      .set({ statut: "brouillon", source: "conversation", contenu, statuts, version: existant.version + 1, updatedAt: new Date() })
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
  // Lot : cette tâche n'est qu'une SOUS-TÂCHE (un épisode) d'une proposition plus grande.
  if (prop.lot) {
    if (run.skill === "prompt-asset") return postSousTacheRegistre(tx, run, prop, scope, json as SortiePromptAsset);
    if (run.skill === "prompt-voix") return postSousTacheVoix(tx, run, prop, scope, json as SortiePromptVoix);
    return postSousTacheLot(tx, run, prop, scope, json as SortieScenarioEpisode);
  }

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
        bruts = depuisScenarioEpisode(sortie, await episodeCourant(tx, prop.projectId, prop.cibleId));
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

/** L'épisode tel qu'il est maintenant (titre, résumé, scènes, plans) : ce que la conversion compare à la sortie du skill. */
async function episodeCourant(tx: Tx, projectId: number, episodeId: number): Promise<EpisodeCourant> {
  const ep = await entreeScenarioEpisode(tx, projectId, episodeId, "");
  if (!ep) throw new Error("L'épisode visé n'existe plus.");
  const entree = ep.entree as { episode: { titre: string; resume: string }; scenesExistantes: { id: number; titre: string }[] };
  const lesPlans = await tx.select({ uuid: plans.uuid, titre: plans.titre, sceneId: plans.sceneId }).from(plans).where(eq(plans.episodeId, episodeId));
  return { id: episodeId, titre: entree.episode.titre, resume: entree.episode.resume, scenes: entree.scenesExistantes, plans: lesPlans };
}

/** Une sous-tâche d'un lot de scénarios (un épisode) : ses changements REMPLACENT ceux qu'elle avait
 * déjà posés (relance) sans toucher aux autres sous-tâches, dans la même transaction que son résultat
 * (idempotent : rejouer le même résultat ne double rien) ; puis le lot décide de son statut. */
async function postSousTacheLot(
  tx: Tx,
  run: RunAgent,
  prop: typeof propositions.$inferSelect,
  scope: { type: "projet" | "saison" | "episode" | "plan" | "asset"; cibleId: number | null },
  sortie: SortieScenarioEpisode,
) {
  const cle = run.cleSousTache;
  const episodeId = episodeIdDeCle(cle);
  if (!cle || episodeId == null || run.skill !== "scenario-episode") throw new Error(`Sous-tâche de lot inconnue (« ${cle ?? "?"} », skill « ${run.skill} »).`);
  const bruts = depuisScenarioEpisode(sortie, await episodeCourant(tx, prop.projectId, episodeId), {
    prefixeCle: `ep${episodeId}-`,
    groupe: groupeEpisode(episodeId),
    signalerEcrasement: true,
  });
  const base = rangSousTache(await runsDuLot(tx, prop.id), cle) * PAS_ORDRE_SOUS_TACHE;
  await enregistrerChangements(tx, prop.id, prop.projectId, scope, bruts, { sousTache: cle, baseOrdre: base });
  await finaliserLot(tx, prop.id, { runTermineId: run.id });
}

/** Une sous-tâche du lot « registre » (un master) : l'asset est créé s'il n'existe pas (description du
 * brief + prompt), sinon son prompt est proposé. Même règle que pour un épisode : ses changements
 * REMPLACENT ceux qu'elle avait posés (relance), idempotent, puis le lot décide de son statut. */
async function postSousTacheRegistre(
  tx: Tx,
  run: RunAgent,
  prop: typeof propositions.$inferSelect,
  scope: { type: "projet" | "saison" | "episode" | "plan" | "asset"; cibleId: number | null },
  sortie: SortiePromptAsset,
) {
  const cle = run.cleSousTache;
  const code = codeDeCleAsset(cle);
  if (!cle || !code) throw new Error(`Sous-tâche de registre inconnue (« ${cle ?? "?"} »).`);
  const entree = run.entree as { asset?: { code?: string; type?: string; descriptionCanonique?: string } };
  const type = entree.asset?.type;
  if (!type) throw new Error("Sous-tâche de registre sans type d'asset.");
  const [existant] = await tx.select().from(assets).where(and(eq(assets.projectId, prop.projectId), eq(assets.code, code)));
  const suffixe = code.includes("_") ? code.slice(code.indexOf("_") + 1) : code;
  const bruts = depuisRegistreAsset(sortie, {
    code,
    type,
    suffixe,
    description: entree.asset?.descriptionCanonique ?? "",
    descriptionVide: existant ? !(existant.description ?? "").trim() : false,
    existant: existant
      ? { id: existant.id, code: existant.code, type: existant.type, methodeGeneration: existant.methodeGeneration, methodeApplicable: methodeApplicable(existant.type) }
      : null,
  });
  const base = rangSousTache(await runsDuLot(tx, prop.id), cle) * PAS_ORDRE_SOUS_TACHE;
  await enregistrerChangements(tx, prop.id, prop.projectId, scope, bruts, { sousTache: cle, baseOrdre: base });
  await finaliserLot(tx, prop.id, { runTermineId: run.id });
}

/** Une sous-tâche du lot « casting des voix » (une voix) : la création de la voix est proposée avec son
 * instruction de timbre. Même règle que le registre : ses changements REMPLACENT ceux qu'elle avait posés
 * (relance), idempotent, puis le lot décide de son statut. */
async function postSousTacheVoix(
  tx: Tx,
  run: RunAgent,
  prop: typeof propositions.$inferSelect,
  scope: { type: "projet" | "saison" | "episode" | "plan" | "asset"; cibleId: number | null },
  sortie: SortiePromptVoix,
) {
  const cle = run.cleSousTache;
  if (!cle || codeDeCleVoix(cle) == null) throw new Error(`Sous-tâche de voix inconnue (« ${cle ?? "?"} »).`);
  const entree = run.entree as { voix?: { code?: string; personnage?: { code?: string; descriptionCanonique?: string } | null } };
  const codeVoix = entree.voix?.code;
  if (!codeVoix) throw new Error("Sous-tâche de voix sans code de voix.");
  const personnageCode = entree.voix?.personnage?.code ?? null;
  let personnageId: number | null = null;
  if (personnageCode) {
    const [perso] = await tx.select({ id: assets.id }).from(assets).where(and(eq(assets.projectId, prop.projectId), eq(assets.code, personnageCode), eq(assets.type, "personnage")));
    if (!perso) throw new Error(`Le personnage ${personnageCode} n'existe plus : la voix n'a pas pu être rattachée.`);
    personnageId = perso.id;
  }
  const bruts = depuisCastingVoix(sortie, {
    codeVoix,
    suffixe: codeVoix.includes("_") ? codeVoix.slice(codeVoix.indexOf("_") + 1) : codeVoix,
    personnageId,
    personnageCode,
    description: entree.voix?.personnage?.descriptionCanonique ?? "",
  });
  const base = rangSousTache(await runsDuLot(tx, prop.id), cle) * PAS_ORDRE_SOUS_TACHE;
  await enregistrerChangements(tx, prop.id, prop.projectId, scope, bruts, { sousTache: cle, baseOrdre: base });
  await finaliserLot(tx, prop.id, { runTermineId: run.id });
}

/** Échec ou annulation d'une tâche d'agent : la proposition liée n'attendra pas indéfiniment. */
export async function surEchecRun(run: RunAgent, message: string): Promise<void> {
  if (run.but === "proposition" && run.propositionId != null) {
    // Une sous-tâche de lot qui échoue ne fait pas échouer le lot : il décide d'après toutes ses tâches.
    const [prop] = await db.select({ lot: propositions.lot }).from(propositions).where(eq(propositions.id, run.propositionId));
    if (prop?.lot) {
      await finaliserLot(db, run.propositionId);
      return;
    }
    await db
      .update(propositions)
      .set({ statut: "echouee", erreur: message.slice(0, 2000) })
      .where(eq(propositions.id, run.propositionId));
  }
}
