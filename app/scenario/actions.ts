"use server";

import { db } from "@/db";
import { scenes, plans } from "@/db/schema";
import { and, desc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { recomposerOrdre, type Tx } from "@/lib/ordre-plans";
import { genreOuNull } from "@/lib/scene-genres";

/** Un plan naît toujours en brouillon (défaut du schéma) — il faudra le
 * "développer" explicitement en fiche de plan avant qu'il entre dans Plans.
 * Il reçoit un `uuid` (identifiant public) ; sa position dans l'épisode est
 * `ordre`, déplaçable ensuite. Aucun numéro de plan. */
export async function creerPlanScenario(
  projectId: number,
  episodeId: number,
  valeurs: {
    titre: string;
    sceneId: number | null;
    dureeMontageSecondes: number;
    description: string;
  },
) {
  const [dernier] = await db
    .select({ ordre: plans.ordre })
    .from(plans)
    .where(eq(plans.episodeId, episodeId))
    .orderBy(desc(plans.ordre))
    .limit(1);
  const [cree] = await db.insert(plans).values({
    projectId,
    episodeId,
    ordre: (dernier?.ordre ?? -1) + 1,
    titre: valeurs.titre,
    sceneId: valeurs.sceneId,
    dureeMontageSecondes: valeurs.dureeMontageSecondes,
    dureeGenerationSecondes: valeurs.dureeMontageSecondes,
    description: valeurs.description || null,
  }).returning({ id: plans.id });
  // Né dans une scène : se place à la fin de celle-ci plutôt qu'à la fin de l'épisode.
  if (cree && valeurs.sceneId != null) await placerPlan(cree.id, valeurs.sceneId, null);
  revalidatePath("/", "layout");
}

/** Une scène naît vide : ses plans s'y rattachent au fur et à mesure
 * (rattacherPlanAScene). Plage de numéros et durée se déduisent des plans. */
export async function creerScene(episodeId: number, valeurs: { titre: string; fonction: string; genre?: string | null; ambiance?: string }) {
  const existantes = await db.select().from(scenes).where(eq(scenes.episodeId, episodeId));
  const ordre = existantes.reduce((acc, sc) => Math.max(acc, sc.ordre), -1) + 1;
  await db.insert(scenes).values({
    episodeId,
    ordre,
    titre: valeurs.titre,
    fonction: valeurs.fonction || null,
    genre: genreOuNull(valeurs.genre),
    ambiance: valeurs.ambiance?.trim() || null,
  });
  revalidatePath("/", "layout");
}

/** Place un plan dans une scène (ou « sans scène » si `sceneId` est null),
 * juste avant `avantPlanId` — ou, sans repère, à la fin des plans de la scène
 * cible. L'ordre de tout l'épisode est recomposé dans une transaction :
 * `ordre` est une position, jamais une clé. Plan et scène doivent être du même
 * épisode. */
async function placerPlan(planId: number, sceneId: number | null, avantPlanId: number | null) {
  const [plan] = await db.select({ episodeId: plans.episodeId }).from(plans).where(eq(plans.id, planId));
  if (!plan) return;
  if (sceneId != null) {
    const [scene] = await db
      .select({ id: scenes.id })
      .from(scenes)
      .where(and(eq(scenes.id, sceneId), eq(scenes.episodeId, plan.episodeId)));
    if (!scene) return;
  }

  await db.transaction(async (tx) => {
    const tous = await tx
      .select({ id: plans.id, sceneId: plans.sceneId })
      .from(plans)
      .where(eq(plans.episodeId, plan.episodeId))
      .orderBy(plans.ordre, plans.id);

    const sans = tous.filter((p) => p.id !== planId);
    let index = avantPlanId != null ? sans.findIndex((p) => p.id === avantPlanId) : -1;
    if (index === -1) {
      // Pas de repère : à la fin de la scène cible (le regroupement final
      // ramène de toute façon le plan dans son bloc).
      index = sans.length;
    }
    sans.splice(index, 0, { id: planId, sceneId });
    await recomposerOrdre(tx, plan.episodeId, sans);
  });
}

/** Glisser-déposer d'un plan (Scénario) : change de scène et/ou de position. */
export async function deplacerPlan(planId: number, sceneId: number | null, avantPlanId: number | null) {
  await placerPlan(planId, sceneId, avantPlanId);
  revalidatePath("/", "layout");
}

/** Rattache un plan existant à une scène, ou le détache (`sceneId` null) —
 * sélecteur de la page d'un plan. Le plan se place à la fin de la scène. */
export async function rattacherPlanAScene(planId: number, sceneId: number | null) {
  await placerPlan(planId, sceneId, null);
  revalidatePath("/", "layout");
}

/** Édition d'une scène : titre, fonction (description), genre (qui choisit les guides de rédaction de ses plans) et
 * ambiance (cadre visuel tenu sur toute la scène). */
export async function modifierScene(sceneId: number, valeurs: { titre: string; fonction: string; genre?: string | null; ambiance?: string }) {
  const titre = valeurs.titre.trim();
  if (!titre) return;
  await db
    .update(scenes)
    .set({ titre, fonction: valeurs.fonction.trim() || null, genre: genreOuNull(valeurs.genre), ambiance: valeurs.ambiance?.trim() || null })
    .where(eq(scenes.id, sceneId));
  revalidatePath("/", "layout");
}

/** Réordonne les scènes (glisser-déposer d'une scène) : la place juste avant
 * `avantSceneId`, ou à la fin. Les plans suivent leur scène : l'ordre des plans
 * de l'épisode est recomposé en blocs, dans le nouvel ordre des scènes. */
export async function deplacerScene(sceneId: number, avantSceneId: number | null) {
  const [scene] = await db.select().from(scenes).where(eq(scenes.id, sceneId));
  if (!scene) return;
  await db.transaction(async (tx) => {
    const toutes = await tx
      .select({ id: scenes.id })
      .from(scenes)
      .where(eq(scenes.episodeId, scene.episodeId))
      .orderBy(scenes.ordre, scenes.id);
    const sans = toutes.filter((sc) => sc.id !== sceneId);
    let index = avantSceneId != null ? sans.findIndex((sc) => sc.id === avantSceneId) : -1;
    if (index === -1) index = sans.length;
    sans.splice(index, 0, { id: sceneId });
    for (const [i, sc] of sans.entries()) {
      await tx.update(scenes).set({ ordre: i }).where(eq(scenes.id, sc.id));
    }
    const sequence = await tx
      .select({ id: plans.id, sceneId: plans.sceneId })
      .from(plans)
      .where(eq(plans.episodeId, scene.episodeId))
      .orderBy(plans.ordre, plans.id);
    await recomposerOrdre(tx, scene.episodeId, sequence);
  });
  revalidatePath("/", "layout");
}

/** Suppression sans blocage (retour utilisateur 2026-09-28) : une scène
 * n'est qu'un regroupement narratif, pas une dépendance structurelle — la
 * supprimer détache simplement ses plans ("sans scène") plutôt que de
 * bloquer l'action ou de supprimer les plans eux-mêmes. */
export async function supprimerScene(sceneId: number) {
  const [scene] = await db.select().from(scenes).where(eq(scenes.id, sceneId));
  if (!scene) return;
  await db.transaction(async (tx) => {
    await tx.update(plans).set({ sceneId: null }).where(eq(plans.sceneId, sceneId));
    await tx.delete(scenes).where(eq(scenes.id, sceneId));
    const sequence = await tx
      .select({ id: plans.id, sceneId: plans.sceneId })
      .from(plans)
      .where(eq(plans.episodeId, scene.episodeId))
      .orderBy(plans.ordre, plans.id);
    await recomposerOrdre(tx, scene.episodeId, sequence);
  });
  revalidatePath("/", "layout");
}
