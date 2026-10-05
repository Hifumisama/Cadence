"use server";

import { unlink } from "node:fs/promises";
import { join } from "node:path";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { assets } from "@/db/schema";
import { TYPE_AFFICHE, avecTitreDansImage, codeAffiche, promptAffiche, type CibleAffiche } from "@/lib/affiches";
import { ecrirePoster, lirePoster } from "@/lib/affiche-application";
import { resoudreAffiche } from "@/lib/agents/affiche";
import { MEDIA_ROOT, cheminPosterMedia } from "@/lib/media";

/** Ouvre la page de génération de l'affiche d'un projet, d'une saison ou d'un épisode. L'asset d'affiche (invisible du registre) est
 * créé AU PREMIER CLIC, avec un prompt proposé à partir du titre et du résumé ; ensuite on le retrouve tel quel, prompt
 * modifié compris. Pour un meilleur prompt : « Demander à l'agent » sur la page (même parcours que pour un asset). */
export async function ouvrirAffiche(cible: CibleAffiche, id: number): Promise<void> {
  const contexte = await resoudreAffiche(db, cible, id);
  if (!contexte) throw new Error(cible === "projects" ? "Ce projet n'existe pas." : cible === "seasons" ? "Cette saison n'existe pas." : "Cet épisode n'existe pas.");
  const code = codeAffiche(cible, id);

  const [existant] = await db.select({ id: assets.id }).from(assets).where(and(eq(assets.projectId, contexte.projectId), eq(assets.code, code)));
  if (!existant) {
    await db
      .insert(assets)
      .values({
        projectId: contexte.projectId,
        code,
        type: TYPE_AFFICHE,
        statut: "a_produire",
        description: `Affiche : ${contexte.titre}`,
        promptGeneration: promptAffiche({ cible, titre: contexte.titre, resume: contexte.resume, genreTon: contexte.genreTon }),
      })
      .onConflictDoNothing();
  }
  redirect(`/p/${contexte.projectId}/affiche/${code}`);
}

/** Retire l'affiche (retour au dégradé de repli). L'asset d'affiche et ses candidats restent : on peut en réadopter un. */
export async function retirerAffiche(cible: CibleAffiche, id: number): Promise<void> {
  const courant = await lirePoster(cible, id);
  if (courant === undefined) return;
  await ecrirePoster(cible, id, null);
  if (courant) await unlink(join(MEDIA_ROOT, cheminPosterMedia(cible, id, courant))).catch(() => undefined);
  revalidatePath("/", "layout");
}

/** « Écrire le titre dans l'image » : ajoute ou retire la ligne de titre du prompt (le reste n'est pas touché). C'est le prompt qui fait
 * foi : à l'adoption, un prompt qui porte la ligne donne une affiche sans titre superposé. */
export async function reglerTitreAffiche(cible: CibleAffiche, id: number, actif: boolean): Promise<{ ok: true } | { ok: false; erreur: string }> {
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
