import type { Resultat } from "./types";
import { dernieresSousTaches, estRunActif, sceneIdDeCle, episodeIdDeCle } from "./batches-pure";
import { runsDuLot } from "./batches";
import { db } from "../../db";
import { codeDeCleAsset } from "./registry";
import { planUuidDeCle } from "./sheets";
import { agentRuns, assets, propositions, agentConversations } from "../../db/schema";
import { eq, and } from "drizzle-orm";
import { SKILL_H3IR } from "../h3ir/result";
import { entreePromptAsset, entreePromptAssetCandidat, entreeScenarioScene, entreeTraitement, entreeRelecture, entreeScenarioEpisode } from "./context";
import { groupeInventaireDeCle } from "./inventory";
import { assetsACreer } from "./inventory-db";
import { creerRun } from "./runs";
import { propositionParUuid } from "./service-proposals";
import { CONSIGNE_PROMPTS_CREES, CONSIGNE_REGISTRE, CONSIGNE_RELECTURE, CONSIGNE_SCENARIO, CONSIGNE_TRAITEMENT, ERR } from "./service-shared";
import { candidatsDuProjet } from "./service-episodes";

/** Re-runs ONE subtask of a batch (failed, cancelled, or to redo), with an optional
 * free-form feedback. Its old changes stay until the new reply replaces them;
 * the other subtasks do not move. */
export async function relancerSousTache(propositionUuid: string, cle: string, retour?: string): Promise<Resultat<{ runUuid: string }>> {
  const prop = await propositionParUuid(propositionUuid);
  if (!prop) return ERR("Proposition introuvable.");
  if (!prop.lot) return ERR("Cette proposition n'est pas un lot.");
  if (prop.statut !== "prete" && prop.statut !== "en_generation" && prop.statut !== "echouee") return ERR("Cette proposition est close : plus de relance possible.");
  const sous = dernieresSousTaches(await runsDuLot(db, prop.id)).find((x) => x.run.cle === cle);
  if (!sous) return ERR("Sous-tâche introuvable.");
  if (estRunActif(sous.run)) return ERR("Cette sous-tâche est déjà en file ou en cours.");
  let cible: { skill: string; entree: object; options: { variante?: string; [cle: string]: unknown } | null };
  const codeAsset = codeDeCleAsset(cle);
  const planUuid = planUuidDeCle(cle);
  if (planUuid) {
    // Batch of sheets (Open H3 IR): the subtask is re-run with the same input (the brief is re-read at run time).
    const [ancien] = await db.select({ entree: agentRuns.entree }).from(agentRuns).where(eq(agentRuns.id, sous.run.id));
    cible = { skill: SKILL_H3IR, entree: (ancien?.entree as object | null) ?? { planUuid }, options: null };
  } else if (codeAsset && prop.skill === "prompts-assets") {
    // Prompts of the assets created by the sheets: the asset exists, we start from it (and from its parent).
    const [a] = await db.select({ id: assets.id }).from(assets).where(and(eq(assets.projectId, prop.projectId), eq(assets.code, codeAsset)));
    const e = a ? await entreePromptAsset(db, prop.projectId, a.id, prop.consigne || CONSIGNE_PROMPTS_CREES, retour?.trim() || undefined) : null;
    if (!e) return ERR("L'asset n'existe plus.");
    cible = { skill: "prompt-asset", entree: e.entree, options: e.variante ? { variante: e.variante } : null };
  } else if (codeAsset) {
    const cand = (await candidatsDuProjet(prop.projectId)).find((c) => c.code === codeAsset);
    if (!cand) return ERR("Cet asset n'est plus décrit par le brief.");
    const e = await entreePromptAssetCandidat(db, prop.projectId, cand, prop.consigne || CONSIGNE_REGISTRE, retour?.trim() || undefined);
    if (!e) return ERR("L'asset n'existe plus.");
    cible = { skill: "prompt-asset", entree: e.entree, options: e.variante ? { variante: e.variante } : null };
  } else if (groupeInventaireDeCle(cle) != null && prop.skill === "inventaire-assets") {
    // A scene group of a split inventory: the same input and the same options (clip handles, following groups), with the assets that
    // the OTHER groups now propose.
    const [ancien] = await db.select({ entree: agentRuns.entree, options: agentRuns.options }).from(agentRuns).where(eq(agentRuns.id, sous.run.id));
    const autres = (await assetsACreer(db, prop.id, { saufSousTache: cle })).map((a) => ({ code: a.code, type: a.type, description: a.description }));
    const entree = { ...((ancien?.entree as object | null) ?? {}), assetsDejaProposes: autres, ...(retour?.trim() ? { retourUtilisateur: retour.trim() } : {}) };
    cible = { skill: "inventaire-assets", entree, options: (ancien?.options as { [cle: string]: unknown } | null) ?? null };
  } else {
    const sceneId = sceneIdDeCle(cle);
    const episodeId = episodeIdDeCle(cle);
    if (sceneId != null) {
      // A screenplay scene: its treatment as it is now, with the free-form feedback.
      const entree = await entreeScenarioScene(db, prop.projectId, sceneId, prop.consigne || CONSIGNE_SCENARIO, { retour: retour?.trim() || undefined });
      if (!entree) return ERR("La scène n'existe plus ou n'a plus de traitement.");
      cible = { skill: "scenario-scene", entree: entree.entree, options: null };
    } else if (episodeId == null) {
      return ERR("Sous-tâche non relançable.");
    } else if (prop.skill === "traitements") {
      const entree = await entreeTraitement(db, prop.projectId, episodeId, prop.consigne || CONSIGNE_TRAITEMENT, { retour: retour?.trim() || undefined });
      if (!entree) return ERR("L'épisode n'existe plus.");
      cible = { skill: "traitement-episode", entree: entree.entree, options: null };
    } else if (prop.skill === "relectures") {
      // Review: the episode as it is now (its clips may have changed since), with the free-form feedback.
      const r = await entreeRelecture(db, prop.projectId, episodeId, prop.consigne || CONSIGNE_RELECTURE, { retour: retour?.trim() || undefined });
      if (!r) return ERR("L'épisode n'existe plus ou n'a plus de plan.");
      cible = { skill: "relecture-scenario", entree: r.entree, options: { planUuids: r.planUuids } };
    } else {
      const entree = await entreeScenarioEpisode(db, prop.projectId, episodeId, prop.consigne || CONSIGNE_SCENARIO, { retour: retour?.trim() || undefined });
      if (!entree) return ERR("L'épisode n'existe plus.");
      cible = { skill: "scenario-episode", entree: entree.entree, options: null };
    }
  }

  const run = await creerRun(db, {
    skill: cible.skill,
    entree: cible.entree,
    options: cible.options,
    but: "proposition",
    projectId: prop.projectId,
    conversationId: prop.conversationId,
    propositionId: prop.id,
    cleSousTache: cle,
    libelleSousTache: sous.run.libelle,
  });
  await db.update(propositions).set({ statut: "en_generation", erreur: null }).where(eq(propositions.id, prop.id));
  if (prop.conversationId != null) {
    await db.update(agentConversations).set({ etape: "proposition", propositionId: prop.id, updatedAt: new Date() }).where(eq(agentConversations.id, prop.conversationId));
  }
  return { ok: true, runUuid: run.uuid };
}
