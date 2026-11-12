import { and, eq, inArray } from "drizzle-orm";
import { db } from "../../db";
import { demandes } from "../../db/schema";
import type { ContexteAjoutPlan, ContexteAjoutScene } from "../tasks/requests";
import type { AjoutEnCours, AjoutSceneEnCours } from "./screenplay-view";

/** The clip or scene being written in the episode (« Ajouter un plan », « Nouvelle scène »), if there is one: the Scénario and Tournage pages keep its
 * place for it, as a ghost block, until the end of the task. Only one addition at a time per film: clip or scene. */
export async function ajoutsEnCours(episodeId: number): Promise<{ ajout: AjoutEnCours | null; ajoutScene: AjoutSceneEnCours | null }> {
  const lignes = await db
    .select()
    .from(demandes)
    .where(and(inArray(demandes.type, ["ajout-plan", "ajout-scene"]), eq(demandes.cibleType, "episode"), eq(demandes.cibleId, episodeId), eq(demandes.statut, "en_cours")));
  const plan = lignes.find((d) => d.type === "ajout-plan");
  const scene = lignes.find((d) => d.type === "ajout-scene");
  const ctxPlan = plan ? (plan.contexte as ContexteAjoutPlan) : null;
  const ctxScene = scene ? (scene.contexte as ContexteAjoutScene) : null;
  return {
    ajout: plan && ctxPlan ? { id: plan.id, sceneId: ctxPlan.sceneId, position: ctxPlan.position, consigne: ctxPlan.consigne } : null,
    ajoutScene: scene && ctxScene ? { id: scene.id, place: ctxScene.place, consigne: ctxScene.consigne } : null,
  };
}
