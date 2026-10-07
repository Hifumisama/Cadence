import { and, eq, inArray } from "drizzle-orm";
import { db } from "../../db";
import { agentConversations, agentRuns, assets, briefs, plans, propositions } from "../../db/schema";
import { horsAffiches } from "../../lib/assets-visibles";
import { methodeApplicable } from "../../lib/assetCode";
import { sortieVersBrief } from "../../lib/agents/brief";
import { ecrireBrouillon } from "../../lib/agents/brief-db";
import { entreeTour, messageBriefPret } from "../../lib/agents/brief-entree";
import { appliquerNotes, ficheComplete, manquesFiche } from "../../lib/agents/fiche";
import { ficheCourante, enregistrerFiche } from "../../lib/agents/fiche-db";
import { informationsFormat } from "../../lib/conception";
import { lireConception } from "../../lib/conception-db";
import { creerRun } from "../../lib/agents/runs";
import type { ChangementBrut } from "../../lib/agents/changements";
import {
  depuisCorrectionPlan,
  depuisPlanAInserer,
  depuisPromptAffiche,
  depuisPromptAsset,
  depuisCastingVoix,
  depuisRegistreAsset,
  depuisScenarioEpisode,
  type EpisodeCourant,
  type SortiePromptAffiche,
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
import { depuisFichePlan, type OptionsFichePlan } from "../../lib/agents/conversion";
import { planUuidDeCle } from "../../lib/agents/fiches";
import type { SortiePlanH3 } from "../../lib/agents/plan-h3-controles";
import { corpusExemplesPlanH3 } from "../../lib/agents/plan-h3-corpus";
import { planDialogues, planPromptSections, planRefs, propositionChangements, repliques, scenes } from "../../db/schema";
import { depuisInventaire, type SortieInventaire } from "../../lib/agents/inventaire";
import { depuisIterationPlan, raisonSansEcriture, type PlanPourIteration, type SortieIterationPlan } from "../../lib/agents/iteration-plan";
import type { InfosExecution } from "./preparation";

/** Ce que devient le résultat validé d'une tâche du système d'agents, DANS la transaction qui
 * l'écrit (worker/llm.ts) : un échec ici annule tout et la tâche est marquée échouée.
 * - `tour`        : soit la grille de couverture d'un message (skill `couverture-entretien`, qui pose ensuite le tour de
 *                   l'agent), soit le message de l'agent, qui rejoint la conversation (`briefPret` est décidé en code) ;
 * - `brief`       : un BROUILLON de brief est écrit (jamais par-dessus un brief validé) ;
 * - `proposition` : les changements sont construits EN CODE depuis le JSON du skill. */

type RunAgent = typeof agentRuns.$inferSelect;
export type OptionsRunAgent = { modele?: string; variante?: string; position?: Position; sceneVoisineId?: number | null };

export async function postTraiterRun(tx: Tx, run: RunAgent, json: unknown, execution: InfosExecution = {}): Promise<void> {
  if (!run.but) return; // appel hors système d'agents (npm run llm:tache) : rien à faire
  if (run.but === "tour") {
    if (run.skill === "notes-entretien") return postNotes(tx, run, json);
    return postTour(tx, run, json as { reponse: string; resteADefinir?: string[] });
  }
  if (run.but === "brief") return postBrief(tx, run, json as Record<string, unknown>);
  if (run.but === "proposition") return postProposition(tx, run, json, execution);
}

/** La liste « reste à définir » d'un tour : des phrases courtes, sans doublon ni vide. */
export function resteADefinirDe(sortie: { resteADefinir?: unknown }): string[] {
  const l = Array.isArray(sortie.resteADefinir) ? sortie.resteADefinir : [];
  return [...new Set(l.filter((x): x is string => typeof x === "string").map((x) => x.trim()).filter(Boolean))].slice(0, 12);
}

/** Notes de l'entretien (skill `notes-entretien`) : un appel court posé AVANT chaque tour de l'agent. Il rend un PATCH de la fiche
 * de notes avec les citations qui le prouvent ; le code vérifie les citations, applique le patch, décide seul de ce qui manque
 * et de quand la fiche est complète (alors elle devient le brouillon du brief, sans appel de rédaction). C'est ici que le tour de
 * l'agent est posé, avec la fiche à jour et ce qui reste à demander (ou « c'est complet »). */
async function postNotes(tx: Tx, run: RunAgent, sortie: unknown) {
  if (run.conversationId == null) return;
  const [conv] = await tx.select().from(agentConversations).where(eq(agentConversations.id, run.conversationId));
  if (!conv) return; // conversation écrasée entre-temps
  const messages = ((conv.messages as { role: "user" | "assistant"; content: string }[]) ?? []).map((m) => ({ role: m.role, content: m.content }));
  const utilisateur = messages.filter((m) => m.role === "user").map((m) => m.content);
  const avant = await ficheCourante(tx, conv);
  const fiche = appliquerNotes(avant, sortie, utilisateur);
  const complete = await enregistrerFiche(tx, conv, fiche, utilisateur.length);
  if (complete && !ficheComplete(avant, utilisateur.length - 1)) {
    // La fiche vient de devenir complète : c'est le CODE qui l'annonce (résumé, suppositions, bouton « étape suivante »), sans tour
    // de l'agent. Si l'utilisateur continue, l'agent reprend pour affiner (note « complète » de entreeTour).
    const messagesStockes = [...((conv.messages as unknown[]) ?? []), { role: "assistant", content: messageBriefPret(fiche), at: new Date().toISOString() }];
    await tx.update(agentConversations).set({ messages: messagesStockes, briefPret: true, resteADefinir: [], etape: "conversation", updatedAt: new Date() }).where(eq(agentConversations.id, conv.id));
    return;
  }
  await creerRun(tx, {
    skill: "conversation-agent",
    entree: entreeTour(messages, fiche, { manques: manquesFiche(fiche), complete }, await formatDuProjet(tx, conv.projectId)),
    but: "tour",
    projectId: conv.projectId,
    conversationId: conv.id,
  });
}

/** Le format du projet conçu (film ou série), pour l'agent de conversation ; undefined pour un projet sans conception. */
async function formatDuProjet(tx: Tx, projectId: number): Promise<string | undefined> {
  const c = await lireConception(tx, projectId);
  return c ? informationsFormat(c) : undefined;
}

const majuscule = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

async function postTour(tx: Tx, run: RunAgent, sortie: { reponse: string; resteADefinir?: string[] }) {
  if (run.conversationId == null) return;
  const [conv] = await tx.select().from(agentConversations).where(eq(agentConversations.id, run.conversationId));
  if (!conv) return; // conversation écrasée entre-temps : le tour est perdu, sans erreur
  const messages = [...((conv.messages as unknown[]) ?? []), { role: "assistant", content: sortie.reponse, at: new Date().toISOString() }];
  const nbUtilisateur = messages.filter((m) => (m as { role?: string }).role === "user").length;
  // « Prêt » est décidé EN CODE, depuis la fiche de notes (postNotes) : l'essentiel dit par l'utilisateur, après un échange au moins.
  const fiche = await ficheCourante(tx, conv);
  const pret = ficheComplete(fiche, nbUtilisateur);
  // La liste affichée : ce que le code constate non dit, puis les nuances que l'agent a notées.
  const reste = [...manquesFiche(fiche).map(majuscule), ...resteADefinirDe(sortie)].filter((x, i, l) => l.indexOf(x) === i);
  await tx
    .update(agentConversations)
    .set({ messages, briefPret: pret, resteADefinir: reste.slice(0, 12), etape: "conversation", updatedAt: new Date() })
    .where(eq(agentConversations.id, conv.id));
}

async function postBrief(tx: Tx, run: RunAgent, sortie: Record<string, unknown>) {
  if (run.projectId == null) throw new Error("Brief sans projet.");
  await ecrireBrouillon(tx, run.projectId, sortieVersBrief(sortie));
  if (run.conversationId != null) {
    await tx.update(agentConversations).set({ etape: "brief", updatedAt: new Date() }).where(eq(agentConversations.id, run.conversationId));
  }
}

async function postProposition(tx: Tx, run: RunAgent, json: unknown, execution: InfosExecution) {
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
    if (run.skill === "plan-h3") return postSousTacheFiche(tx, run, prop, scope, json as SortiePlanH3);
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
  } else if (run.skill === "prompt-affiche") {
    if (prop.cibleId == null) throw new Error("Proposition d'affiche sans cible.");
    const [asset] = await tx.select().from(assets).where(eq(assets.id, prop.cibleId));
    if (!asset) throw new Error("L'affiche visée n'existe plus.");
    const entree = run.entree as { titre?: string; personnagePrincipal?: { imageDisponible?: boolean } | null };
    bruts = depuisPromptAffiche(json as SortiePromptAffiche, asset, {
      titre: entree.titre ?? "",
      imagePersonnageDisponible: entree.personnagePrincipal?.imageDisponible === true,
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
        bruts = depuisScenarioEpisode(sortie, await episodeCourant(tx, prop.projectId, prop.cibleId), { dureeCibleSecondes: await dureeCibleDuProjet(tx, prop.projectId) });
      }
    } else {
      throw new Error(`Portée « ${prop.portee} » non prise en charge pour le skill scenario-episode.`);
    }
  } else if (run.skill === "plan-h3") {
    // La fiche d'UN plan (portée plan) : la fiche et ses assets manquants, dans les groupes communs.
    if (prop.cibleId == null) throw new Error("Proposition de fiche sans plan.");
    const [plan] = await tx.select({ uuid: plans.uuid }).from(plans).where(eq(plans.id, prop.cibleId));
    if (!plan) throw new Error("Le plan visé n'existe plus.");
    bruts = await brutsFiche(tx, prop.projectId, plan.uuid, json as SortiePlanH3);
  } else if (run.skill === "inventaire-assets") {
    // Les assets que les plans réclament et que le registre n'a pas : des créations sans prompt (il s'écrit ensuite).
    const sortie = json as SortieInventaire;
    const registre = await tx.select({ code: assets.code, type: assets.type, description: assets.description }).from(assets).where(and(eq(assets.projectId, prop.projectId), horsAffiches));
    bruts = depuisInventaire(sortie, registre.map((a) => ({ code: a.code, type: a.type, description: a.description ?? "" })));
    await enregistrerChangements(tx, prop.id, prop.projectId, scope, bruts);
    // Rien à ajouter : la proposition le dit (avec les notes du modèle) plutôt que d'afficher une liste vide.
    if (bruts.length === 0) {
      const notes = (sortie.notes ?? "").trim();
      await tx.update(propositions).set({ resume: `Le registre suffit : aucun asset à ajouter.${notes ? ` ${notes}` : ""}` }).where(eq(propositions.id, prop.id));
    }
    if (prop.conversationId != null) {
      await tx.update(agentConversations).set({ etape: "proposition", updatedAt: new Date() }).where(eq(agentConversations.id, prop.conversationId));
    }
    return;
  } else if (run.skill === "iteration-plan") {
    // Correction après visionnage : une écriture PARTIELLE de la fiche, ou rien (le diagnostic seul) avec la raison.
    if (prop.cibleId == null) throw new Error("Correction de plan sans plan.");
    return postIteration(tx, run, prop, scope, json as SortieIterationPlan, execution);
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

/** La durée visée d'un épisode, telle que le brief du projet la porte (null sans brief ni durée). */
async function dureeCibleDuProjet(tx: Tx, projectId: number): Promise<number | null> {
  const [b] = await tx.select({ contenu: briefs.contenu }).from(briefs).where(eq(briefs.projectId, projectId));
  const d = (b?.contenu as { dureeEpisodeSecondes?: unknown } | undefined)?.dureeEpisodeSecondes;
  return typeof d === "number" && d > 0 ? d : null;
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
    dureeCibleSecondes: await dureeCibleDuProjet(tx, prop.projectId),
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

/** Les changements d'une fiche de plan (sortie de `plan-h3`), depuis l'état du plan MAINTENANT : ses voix
 * (slots `<Audio N>` de plan_dialogues, entrée de l'assemblage), ses répliques (verbatim), le registre. */
async function brutsFiche(tx: Tx, projectId: number, planUuid: string, sortie: SortiePlanH3, options: OptionsFichePlan = {}): Promise<ChangementBrut[]> {
  const [plan] = await tx.select({ id: plans.id, titre: plans.titre }).from(plans).where(and(eq(plans.uuid, planUuid), eq(plans.projectId, projectId)));
  if (!plan) throw new Error("Le plan visé n'existe plus.");
  const [dialogues, registre] = await Promise.all([
    tx
      .select({ uuid: repliques.uuid, texte: repliques.texte, slot: planDialogues.slot })
      .from(planDialogues)
      .innerJoin(repliques, eq(repliques.id, planDialogues.repliqueId))
      .where(eq(planDialogues.planId, plan.id)),
    tx.select({ code: assets.code, type: assets.type }).from(assets).where(and(eq(assets.projectId, projectId), horsAffiches)),
  ]);
  return depuisFichePlan(
    sortie,
    { uuid: planUuid, titre: plan.titre, slotsAudioPris: dialogues.map((d) => d.slot), repliques: dialogues.map((d) => ({ uuid: d.uuid, texte: d.texte })), registre },
    { corpusExemples: corpusExemplesPlanH3(), ...options },
  );
}

/** Une sous-tâche du lot « fiches de plan » (un plan) : sa fiche et ses assets manquants, rangés sous son
 * épisode et sa scène. Même règle que les autres lots : ses changements REMPLACENT ceux qu'elle avait posés
 * (relance), idempotent ; un asset manquant dont un autre plan du lot propose déjà la création n'est pas
 * proposé deux fois ; puis le lot décide de son statut. */
async function postSousTacheFiche(
  tx: Tx,
  run: RunAgent,
  prop: typeof propositions.$inferSelect,
  scope: { type: "projet" | "saison" | "episode" | "plan" | "asset"; cibleId: number | null },
  sortie: SortiePlanH3,
) {
  const cle = run.cleSousTache;
  const planUuid = planUuidDeCle(cle);
  if (!cle || !planUuid) throw new Error(`Sous-tâche de fiche inconnue (« ${cle ?? "?"} »).`);
  const [plan] = await tx.select({ episodeId: plans.episodeId, sceneId: plans.sceneId }).from(plans).where(and(eq(plans.uuid, planUuid), eq(plans.projectId, prop.projectId)));
  if (!plan) throw new Error("Le plan visé n'existe plus.");
  const [scene] = plan.sceneId != null ? await tx.select({ titre: scenes.titre }).from(scenes).where(eq(scenes.id, plan.sceneId)) : [];
  const autres = await tx
    .select({ apres: propositionChangements.apres, sousTache: propositionChangements.sousTache, refuse: propositionChangements.refuseRaison })
    .from(propositionChangements)
    .where(and(eq(propositionChangements.propositionId, prop.id), eq(propositionChangements.cibleType, "asset"), eq(propositionChangements.operation, "creer")));
  const codesDejaProposes = new Set(
    autres.filter((a) => a.sousTache !== cle && !a.refuse).map((a) => (a.apres as { code?: unknown } | null)?.code).filter((c): c is string => typeof c === "string"),
  );
  const bruts = await brutsFiche(tx, prop.projectId, planUuid, sortie, { groupe: groupeEpisode(plan.episodeId), sousGroupe: scene?.titre ?? null, codesDejaProposes });
  const base = rangSousTache(await runsDuLot(tx, prop.id), cle) * PAS_ORDRE_SOUS_TACHE;
  await enregistrerChangements(tx, prop.id, prop.projectId, scope, bruts, { sousTache: cle, baseOrdre: base });
  await finaliserLot(tx, prop.id, { runTermineId: run.id });
}

/** Une correction après visionnage (`iteration-plan`) : le plan tel qu'il est MAINTENANT (le prompt a pu changer
 * pendant la génération : un passage introuvable sera alors bloqué, jamais appliqué à l'aveugle), la conversion
 * pure, puis la proposition. Sans écriture (durée incohérente, abandon, cause hors du prompt…), la proposition est
 * prête SANS changement et son résumé dit pourquoi ; la revue affiche le diagnostic. Le « contexte utilisé » gagne
 * la mesure du rendu (durée réelle, nombre de vignettes). */
async function postIteration(
  tx: Tx,
  run: RunAgent,
  prop: typeof propositions.$inferSelect,
  scope: { type: "projet" | "saison" | "episode" | "plan" | "asset"; cibleId: number | null },
  sortie: SortieIterationPlan,
  execution: InfosExecution,
) {
  const [plan] = await tx.select({ id: plans.id, uuid: plans.uuid, titre: plans.titre, duree: plans.dureeGenerationSecondes }).from(plans).where(eq(plans.id, prop.cibleId!));
  if (!plan) throw new Error("Le plan visé n'existe plus.");
  const [lignes, refs, voix, registre] = await Promise.all([
    tx.select({ section: planPromptSections.section, contenu: planPromptSections.contenu }).from(planPromptSections).where(eq(planPromptSections.planId, plan.id)),
    tx
      .select({ type: planRefs.type, slot: planRefs.slot, role: planRefs.role, retention: planRefs.retention, asset: assets.code })
      .from(planRefs)
      .leftJoin(assets, eq(assets.id, planRefs.assetId))
      .where(eq(planRefs.planId, plan.id)),
    tx.select({ slot: planDialogues.slot }).from(planDialogues).where(eq(planDialogues.planId, plan.id)),
    tx.select({ code: assets.code, type: assets.type }).from(assets).where(and(eq(assets.projectId, prop.projectId), horsAffiches)),
  ]);
  const sections: Record<string, string> = {};
  for (const l of lignes) sections[l.section] = sections[l.section] ? `${sections[l.section]}\n${l.contenu}` : l.contenu;
  // La durée voulue est celle qu'a vue le modèle (celle de l'entrée), même si le plan a changé depuis.
  const voulue = (run.entree as { plan?: { dureeVoulueSecondes?: number } } | null)?.plan?.dureeVoulueSecondes ?? plan.duree;
  const courant: PlanPourIteration = {
    uuid: plan.uuid,
    titre: plan.titre,
    sections,
    refs,
    registre,
    slotsVoix: voix.map((v) => v.slot),
    dureeGenerationSecondes: voulue,
    dureeReelleSecondes: execution.dureeReelleSecondes ?? null,
  };
  const bruts = depuisIterationPlan(sortie, courant);
  await enregistrerChangements(tx, prop.id, prop.projectId, scope, bruts);
  const raison = raisonSansEcriture(sortie, courant);
  const mesure =
    execution.dureeReelleSecondes != null
      ? [{ type: "plan" as const, libelle: `Rendu mesuré : ${String(execution.dureeReelleSecondes).replace(".", ",")} s pour ${voulue} s voulues · ${execution.nbVignettes ?? "?"} vignettes regardées` }]
      : [];
  await tx
    .update(propositions)
    .set({
      ...(raison ? { resume: `Diagnostic sans écriture. ${raison}` } : {}),
      ...(mesure.length ? { contexte: [...((prop.contexte as unknown[]) ?? []), ...mesure] } : {}),
    })
    .where(eq(propositions.id, prop.id));
  if (prop.conversationId != null) {
    await tx.update(agentConversations).set({ etape: "proposition", updatedAt: new Date() }).where(eq(agentConversations.id, prop.conversationId));
  }
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
