"use server";

import { db } from "@/db";
import { assetGenerations, assets, projects } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { copyFile, mkdir, unlink } from "node:fs/promises";
import { dirname, extname, join } from "node:path";
import { estAspect, nouvelleSeed, raisonNonGenerable } from "@/lib/asset-generation";
import { MEDIA_ROOT, cheminAssetMedia, cheminGenerationMedia } from "@/lib/media";

// Génération d'images d'un asset (tâche ComfyUI dédiée). Ces actions ne
// parlent jamais à ComfyUI : elles posent une demande en base, le worker la
// prend (worker/images.ts). Le résultat est un candidat que l'utilisateur adopte.

type Resultat = { ok: true } | { ok: false; erreur: string };

export async function lancerGeneration(
  assetId: number,
  valeurs: { aspect: string; megapixels: number; loraPersonnage: boolean },
): Promise<Resultat> {
  const [asset] = await db.select().from(assets).where(eq(assets.id, assetId));
  if (!asset) return { ok: false, erreur: "Cet asset n'existe pas." };
  const raison = raisonNonGenerable(asset);
  if (raison) return { ok: false, erreur: raison };
  if (!estAspect(valeurs.aspect)) return { ok: false, erreur: "Format inconnu." };
  if (!Number.isFinite(valeurs.megapixels) || valeurs.megapixels < 0.3 || valeurs.megapixels > 4) {
    return { ok: false, erreur: "Mégapixels hors limites (0,3 à 4)." };
  }
  const [projet] = await db.select({ clauseStyle: projects.clauseStyle }).from(projects).where(eq(projects.id, asset.projectId));
  await db.insert(assetGenerations).values({
    assetId,
    methode: "generation",
    prompt: asset.promptGeneration!.trim(),
    clauseStyle: projet?.clauseStyle ?? "",
    aspect: valeurs.aspect,
    megapixels: valeurs.megapixels,
    loraPersonnage: valeurs.loraPersonnage,
    seed: nouvelleSeed(),
  });
  revalidatePath("/", "layout");
  return { ok: true };
}

/** Adopte un candidat : son image devient celle de l'asset (elle remplace la
 * précédente, F01). L'asset repasse « en cours » : une image nouvelle est à
 * revalider. */
export async function adopterGeneration(generationId: number): Promise<Resultat> {
  const [gen] = await db.select().from(assetGenerations).where(eq(assetGenerations.id, generationId));
  if (!gen || gen.statut !== "termine" || !gen.fichier) return { ok: false, erreur: "Ce candidat n'est pas disponible." };
  const [asset] = await db.select().from(assets).where(eq(assets.id, gen.assetId));
  if (!asset) return { ok: false, erreur: "Cet asset n'existe pas." };

  const nom = `${asset.code}${extname(gen.fichier).toLowerCase() || ".png"}`;
  const cible = join(MEDIA_ROOT, cheminAssetMedia(nom));
  try {
    await mkdir(dirname(cible), { recursive: true });
    await copyFile(join(MEDIA_ROOT, cheminGenerationMedia(gen.assetId, gen.fichier)), cible);
  } catch {
    return { ok: false, erreur: "Le fichier du candidat est introuvable sur le stockage." };
  }
  if (asset.fichier && asset.fichier !== nom) {
    await unlink(join(MEDIA_ROOT, cheminAssetMedia(asset.fichier))).catch(() => undefined);
  }
  await db.update(assets).set({ fichier: nom, statut: "en_cours" }).where(eq(assets.id, asset.id));
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function supprimerGeneration(generationId: number): Promise<Resultat> {
  const [gen] = await db.select().from(assetGenerations).where(eq(assetGenerations.id, generationId));
  if (!gen) return { ok: true };
  if (gen.statut === "en_cours") return { ok: false, erreur: "Génération en cours : attends sa fin." };
  if (gen.fichier) await unlink(join(MEDIA_ROOT, cheminGenerationMedia(gen.assetId, gen.fichier))).catch(() => undefined);
  await db.delete(assetGenerations).where(and(eq(assetGenerations.id, generationId)));
  revalidatePath("/", "layout");
  return { ok: true };
}
