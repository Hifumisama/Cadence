import { copyFile, mkdir, unlink } from "node:fs/promises";
import { dirname, extname, join } from "node:path";
import { eq } from "drizzle-orm";
import { db } from "../../db";
import { assetGenerations, assets } from "../../db/schema";
import { appliquerAffiche } from "../posters/poster-application";
import { TYPE_AFFICHE, titreDansPrompt } from "../posters/posters";
import { cheminAssetMedia, cheminGenerationMedia } from "../media";

/** Adopt a candidate: its file becomes the asset's image, and its prompt the asset's. Shared by
 * the « Adopter » action of the interface (app/assets/generation-actions.ts) and by the worker, which adopts on its own the generations of a
 * BATCH (`asset_generations.adoption_auto`: generating in batch means wanting to use the result). No dependency on Next. */
export async function adopterCandidat(generationId: number, mediaRoot: string): Promise<{ ok: true } | { ok: false; erreur: string }> {
  const [gen] = await db.select().from(assetGenerations).where(eq(assetGenerations.id, generationId));
  if (!gen || gen.statut !== "termine" || !gen.fichier) return { ok: false, erreur: "Ce candidat n'est pas disponible." };
  const [asset] = await db.select().from(assets).where(eq(assets.id, gen.assetId));
  if (!asset) return { ok: false, erreur: "Cet asset n'existe pas." };

  const nom = `${asset.code}${extname(gen.fichier).toLowerCase() || ".png"}`;
  const cible = join(mediaRoot, cheminAssetMedia(nom));
  try {
    await mkdir(dirname(cible), { recursive: true });
    await copyFile(join(mediaRoot, cheminGenerationMedia(gen.assetId, gen.fichier)), cible);
  } catch {
    return { ok: false, erreur: "Le fichier du candidat est introuvable sur le stockage." };
  }
  if (asset.fichier && asset.fichier !== nom) {
    await unlink(join(mediaRoot, cheminAssetMedia(asset.fichier))).catch(() => undefined);
  }
  const maintenant = new Date();
  await db
    .update(assets)
    .set({
      fichier: nom,
      fichierAt: maintenant,
      valide: false, // a new file replaces the one that was validated: to validate again
      promptGeneration: gen.prompt,
    })
    .where(eq(assets.id, asset.id));
  // The kept attempt: same instant as the asset's file (see `assetGenerations.adopteAt`).
  await db.update(assetGenerations).set({ adopteAt: maintenant }).where(eq(assetGenerations.id, gen.id));
  // A presentation poster: the adopted image becomes the project's or episode's (lib/posters/posters.ts).
  if (asset.type === TYPE_AFFICHE) {
    const appliquee = await appliquerAffiche(asset.code, nom, mediaRoot, titreDansPrompt(gen.prompt));
    if (!appliquee.ok) return appliquee;
  }
  // Adopting means having seen the result: the header indicator no longer flags it.
  if (!gen.vuAt) await db.update(assetGenerations).set({ vuAt: new Date() }).where(eq(assetGenerations.id, gen.id));
  return { ok: true };
}
