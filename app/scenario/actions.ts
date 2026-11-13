"use server";

import { db } from "@/db";
import { scenes, plans } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { recomposerOrdre } from "@/lib/clips/clip-order";
import { creativiteOuNull, styleCameraOuNull } from "@/lib/h3ir/settings";
import { conserverConsigneAuteur, intentAffichee, memeDescription } from "@/lib/clips/intent";
import { z } from "zod";
import { exiger, idSchema, texteSchema, uuidSchema, verifier } from "@/lib/validation/args";

/** Places a clip in a scene (or « sans scène » if `sceneId` is null),
 * right before `avantPlanId` — or, without a reference, at the end of the clips of the target
 * scene. The order of the whole episode is recomposed in a transaction:
 * `ordre` is a position, never a key. Clip and scene must belong to the same
 * episode. */
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
      // No reference: at the end of the target scene (the final grouping
      // brings the clip back into its block anyway).
      index = sans.length;
    }
    sans.splice(index, 0, { id: planId, sceneId });
    await recomposerOrdre(tx, plan.episodeId, sans);
  });
}

/** Drag and drop of a clip (Scénario): changes scene and/or position. */
export async function deplacerPlan(planId: number, sceneId: number | null, avantPlanId: number | null) {
  exiger(z.tuple([idSchema, idSchema.nullable(), idSchema.nullable()]), [planId, sceneId, avantPlanId]);
  await placerPlan(planId, sceneId, avantPlanId);
  revalidatePath("/", "layout");
}

/** Editing a scene: title, function (description) and mood (visual frame held across the whole scene). The genre of
 * scene is removed (2026-11-09): the column stays in the database, neither read nor written. */
/** `creativite` and `styleCamera` (Open H3 IR, lib/h3ir/settings.ts): absent = left untouched; `null` or empty = the scene inherits from the project; `aucun` (style) = no style despite the project's. */
export async function modifierScene(
  sceneId: number,
  valeurs: { titre: string; fonction: string; ambiance?: string; creativite?: string | null; styleCamera?: string | null },
) {
  exiger(
    z.tuple([
      idSchema,
      z.object({
        titre: texteSchema(255),
        fonction: texteSchema(),
        ambiance: texteSchema().optional(),
        creativite: z.string().max(40).nullish(),
        styleCamera: z.string().max(80).nullish(),
      }),
    ]),
    [sceneId, valeurs],
  );
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

/** Reorders the scenes (drag and drop of a scene): places it right before
 * `avantSceneId`, or at the end. The clips follow their scene: the order of the clips
 * of the episode is recomposed in blocks, in the new order of the scenes. */
export async function deplacerScene(sceneId: number, avantSceneId: number | null) {
  exiger(z.tuple([idSchema, idSchema.nullable()]), [sceneId, avantSceneId]);
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

/** Deletion without blocking (user feedback 2026-09-28): a scene
 * is only a narrative grouping, not a structural dependency — deleting it
 * simply detaches its clips ("sans scène") rather than
 * blocking the action or deleting the clips themselves. */
export async function supprimerScene(sceneId: number) {
  exiger(idSchema, sceneId);
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

/** Rewrites the text of a clip from the Lecture view. The text received is the one we DISPLAY (`intentAffichee`: without « Consigne de l'auteur » nor the former « État en
 * fin de plan »): the author's instruction, hidden and therefore absent from what is edited, is kept; the former end state, dropped since 2026-11-08, is removed. An
 * unchanged text writes nothing (the sheet and the renders are therefore not flagged « à refaire » for nothing). */
export async function modifierTextePlan(planUuid: string, texte: string): Promise<{ ok: true } | { ok: false; erreur: string }> {
  const v = verifier(z.tuple([uuidSchema, texteSchema()]), [planUuid, texte]);
  if (!v.ok) return v;
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
