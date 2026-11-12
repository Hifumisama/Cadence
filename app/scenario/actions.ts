"use server";

import { db } from "@/db";
import { scenes, plans } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { recomposerOrdre } from "@/lib/plans/ordre-plans";
import { creativiteOuNull, styleCameraOuNull } from "@/lib/h3ir/reglages";
import { conserverConsigneAuteur, intentAffichee, memeDescription } from "@/lib/plans/intent";

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

/** Édition d'une scène : titre, fonction (description) et ambiance (cadre visuel tenu sur toute la scène). Le genre de
 * scène est retiré (2026-11-09) : la colonne reste en base, ni lue ni écrite. */
/** `creativite` et `styleCamera` (Open H3 IR, lib/h3ir/reglages.ts) : absents = on n'y touche pas ; `null` ou vide = la scène hérite du projet ; `aucun` (style) = pas de style malgré celui du projet. */
export async function modifierScene(
  sceneId: number,
  valeurs: { titre: string; fonction: string; ambiance?: string; creativite?: string | null; styleCamera?: string | null },
) {
  const titre = valeurs.titre.trim();
  if (!titre) return;
  await db
    .update(scenes)
    .set({
      titre,
      fonction: valeurs.fonction.trim() || null,
      ambiance: valeurs.ambiance?.trim() || null,
      ...(valeurs.creativite !== undefined ? { creativite: creativiteOuNull(valeurs.creativite) } : {}),
      ...(valeurs.styleCamera !== undefined ? { styleCamera: styleCameraOuNull(valeurs.styleCamera) } : {}),
    })
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

const MAX_TEXTE_PLAN = 4000;

/** Réécrit le texte d'un plan depuis la vue Lecture. Le texte reçu est celui qu'on AFFICHE (`intentAffichee` : sans « Consigne de l'auteur » ni ancien « État en
 * fin de plan ») : la consigne de l'auteur, masquée donc absente de ce qu'on édite, est conservée ; l'ancien état de fin, abandonné depuis le 2026-11-08, part. Un
 * texte inchangé n'écrit rien (la fiche et les rendus ne sont donc pas signalés « à refaire » pour rien). */
export async function modifierTextePlan(planUuid: string, texte: string): Promise<{ ok: true } | { ok: false; erreur: string }> {
  const propre = texte.trim();
  if (!propre) return { ok: false, erreur: "Le texte d'un plan ne peut pas être vide : c'est ce que la fiche met en images." };
  if (propre.length > MAX_TEXTE_PLAN) return { ok: false, erreur: `Le texte est trop long (${MAX_TEXTE_PLAN} caractères au plus).` };
  const [plan] = await db.select({ id: plans.id, description: plans.description }).from(plans).where(eq(plans.uuid, planUuid));
  if (!plan) return { ok: false, erreur: "Plan introuvable." };
  if (memeDescription(propre, intentAffichee(plan.description))) return { ok: true };
  await db
    .update(plans)
    .set({ description: conserverConsigneAuteur(propre, plan.description), updatedAt: new Date() })
    .where(eq(plans.id, plan.id));
  revalidatePath("/", "layout");
  return { ok: true };
}
