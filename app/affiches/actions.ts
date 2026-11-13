"use server";

import { unlink } from "node:fs/promises";
import { join } from "node:path";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { assets } from "@/db/schema";
import { TYPE_AFFICHE, avecTitreDansImage, codeAffiche, promptAffiche, type CibleAffiche } from "@/lib/posters/posters";
import { ecrirePoster, lirePoster } from "@/lib/posters/poster-application";
import { resoudreAffiche } from "@/lib/agents/poster";
import { MEDIA_ROOT, cheminPosterMedia } from "@/lib/media";
import { z } from "zod";
import { exiger, idSchema, verifier } from "@/lib/validation/args";

const cibleAfficheSchema = z.string().max(20);

/** Opens the poster generation page of a project or an episode. The poster asset (hidden from the registry) is
 * created ON THE FIRST CLICK, with a prompt proposed from the title and summary; afterwards it is found as-is, edited prompt
 * included. For a better prompt: « Demander à l'agent » on the page (same path as for an asset). */
export async function ouvrirAffiche(cible: CibleAffiche, id: number): Promise<void> {
  exiger(z.tuple([cibleAfficheSchema, idSchema]), [cible, id]);
  const contexte = await resoudreAffiche(db, cible, id);
  if (!contexte) throw new Error(cible === "projects" ? "Ce projet n'existe pas." : "Cet épisode n'existe pas.");
  const code = codeAffiche(cible, id);

  const [existant] = await db.select({ id: assets.id }).from(assets).where(and(eq(assets.projectId, contexte.projectId), eq(assets.code, code)));
  if (!existant) {
    await db
      .insert(assets)
      .values({
        projectId: contexte.projectId,
        code,
        type: TYPE_AFFICHE,
        description: `Affiche : ${contexte.titre}`,
        promptGeneration: promptAffiche({ cible, titre: contexte.titre, resume: contexte.resume, genreTon: contexte.genreTon }),
      })
      .onConflictDoNothing();
  }
  redirect(`/p/${contexte.projectId}/affiche/${code}`);
}

/** Removes the poster (back to the fallback gradient). The poster asset and its candidates remain: one can re-adopt one. */
export async function retirerAffiche(cible: CibleAffiche, id: number): Promise<void> {
  exiger(z.tuple([cibleAfficheSchema, idSchema]), [cible, id]);
  const courant = await lirePoster(cible, id);
  if (courant === undefined) return;
  await ecrirePoster(cible, id, null);
  if (courant) await unlink(join(MEDIA_ROOT, cheminPosterMedia(cible, id, courant))).catch(() => undefined);
  revalidatePath("/", "layout");
}

/** « Écrire le titre dans l'image »: adds or removes the title line of the prompt (the rest is not touched). The prompt is
 * the reference: on adoption, a prompt that carries the line gives a poster without an overlaid title. */
export async function reglerTitreAffiche(cible: CibleAffiche, id: number, actif: boolean): Promise<{ ok: true } | { ok: false; erreur: string }> {
  const v = verifier(z.tuple([cibleAfficheSchema, idSchema, z.boolean()]), [cible, id, actif]);
  if (!v.ok) return v;
  const contexte = await resoudreAffiche(db, cible, id);
  if (!contexte) return { ok: false, erreur: "Introuvable." };
  const [asset] = await db.select().from(assets).where(and(eq(assets.projectId, contexte.projectId), eq(assets.code, codeAffiche(cible, id))));
  if (!asset) return { ok: false, erreur: "Ouvre d'abord la page de génération de l'affiche." };
  await db
    .update(assets)
    .set({ promptGeneration: avecTitreDansImage(asset.promptGeneration ?? promptAffiche({ cible, titre: contexte.titre }), contexte.titre, actif) })
    .where(eq(assets.id, asset.id));
  revalidatePath(`/p/${contexte.projectId}/affiche/${asset.code}`);
  return { ok: true };
}
