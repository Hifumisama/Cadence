import { copyFile, mkdir, unlink } from "node:fs/promises";
import { dirname, extname, join } from "node:path";
import { and, eq, isNull, notExists } from "drizzle-orm";
import { db } from "../../db";
import { assetGenerations, assets } from "../../db/schema";
import { appliquerAffiche } from "../posters/poster-application";
import { TYPE_AFFICHE, titreDansPrompt } from "../posters/posters";
import { cheminAssetMedia, cheminGenerationMedia } from "../media";
import { relancerAfficheApresHeros } from "../agents/poster-clap";
import { poserGenerationsLot } from "./generation-launch";

/** Adopt a candidate: its file becomes the asset's image, and its prompt the asset's. Shared by
 * the « Adopter » action of the interface (app/assets/generation-actions.ts) and by the worker, which adopts on its own the generations of a
 * BATCH (`asset_generations.adoption_auto`: generating in batch means wanting to use the result). No dependency on Next. */
export async function adopterCandidat(generationId: number, mediaRoot: string): Promise<{ ok: true } | { ok: false; erreur: string }> {
  const [gen] = await db.select().from(assetGenerations).where(eq(assetGenerations.id, generationId));
  if (!gen || gen.statut !== "termine" || !gen.fichier) return { ok: false, erreur: "Ce candidat n'est pas disponible." };
  const [asset] = await db.select().from(assets).where(eq(assets.id, gen.assetId));
  if (!asset) return { ok: false, erreur: "Cet asset n'existe pas." };

  const nom = `${asset.projectId}/${asset.code}${extname(gen.fichier).toLowerCase() || ".png"}`; // one folder per project
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
  // The hero's image: the project's poster waits for it and is made from it (decision 2026-11-17). A failure here never undoes the adoption.
  if (asset.type === "personnage") await relancerAfficheApresHeros(db, asset.projectId, asset.id).catch(() => false);
  // Its states waiting for this image (an edit of it) leave now: the creation's pilot loop may already be over (projects 259 and 261: the states
  // never left). Only states never generated, with a prompt; the batch rules decide the rest (lib/assets/generation-batch.ts).
  await lancerEtatsEnAttente(asset.projectId, asset.id).catch(() => undefined);
  // Adopting means having seen the result: the header indicator no longer flags it.
  if (!gen.vuAt) await db.update(assetGenerations).set({ vuAt: new Date() }).where(eq(assetGenerations.id, gen.id));
  return { ok: true };
}

/** The states (assets derived from `parentId`) that have no image and were never generated: queued as a batch, in edit from the parent. */
async function lancerEtatsEnAttente(projectId: number, parentId: number): Promise<number> {
  const etats = await db
    .select({ id: assets.id, prompt: assets.promptGeneration })
    .from(assets)
    .where(
      and(
        eq(assets.deriveDeId, parentId),
        isNull(assets.fichier),
        notExists(db.select({ id: assetGenerations.id }).from(assetGenerations).where(eq(assetGenerations.assetId, assets.id))),
      ),
    );
  const ids = etats.filter((e) => (e.prompt ?? "").trim()).map((e) => e.id);
  if (ids.length === 0) return 0;
  const r = await poserGenerationsLot(projectId, ids);
  return r.ok ? r.lancees : 0;
}
