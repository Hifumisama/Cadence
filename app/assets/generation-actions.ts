"use server";

import { db } from "@/db";
import { assetGenerations, assets } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, extname, join } from "node:path";
import {
  STATUT_TRADUCTION,
} from "@/lib/assets/asset-generation";
import { annulerTraductionEssai } from "@/lib/agents/asset-attempt";
import { horsAffiches } from "@/lib/assets/assets-visible";
import { adopterCandidat } from "@/lib/assets/generation-adoption";
import { poserGenerationsLot } from "@/lib/assets/generation-launch";
import { idsSansImage } from "@/lib/assets/project-images";
import { type EcarteLot } from "@/lib/assets/generation-batch";
import { supprimerGenerationEtFichiers } from "@/lib/assets/generation-sources";
import { z } from "zod";
import { idSchema, verifier } from "@/lib/validation/args";

import {
  MEDIA_ROOT,
  TAILLE_MAX_UPLOAD_ASSET,
  cheminSourceImportMedia,
  sourceImportMediaSrc,
} from "@/lib/media";

// Image generation for an asset (dedicated ComfyUI task). These actions never
// talk to ComfyUI: they record a request in the database, and the worker picks
// it up (worker/images.ts). The result is a candidate the user adopts.
// Two modes (see DemandeGeneration): « texte » (Krea 2 Turbo) and « images »
// (Qwen Image Edit 2511, 1 to 3 sources, the first one is the target).

type Resultat = { ok: true } | { ok: false; erreur: string };

/** `position`: 1 = the generation starts right away; n = n-1 tasks go ahead of it. */


const EXTENSIONS_IMPORT = [".png", ".jpg", ".jpeg", ".webp"];

/** BATCH generation (asset registry): see poserGenerationsLot. */
export async function lancerGenerationsLot(
  projectId: number,
  assetIds: number[],
): Promise<{ ok: true; lancees: number; ecartes: EcarteLot[] } | { ok: false; erreur: string }> {
  const v = verifier(z.tuple([idSchema, z.array(idSchema).max(5000)]), [projectId, assetIds]);
  if (!v.ok) return v;
  const r = await poserGenerationsLot(projectId, assetIds);
  revalidatePath("/", "layout");
  return r;
}

/** « Générer toutes les images de référence » (preparation clap, « Prochaine étape » banner, registry): the batch above
 * applied to all assets to illustrate that have no image (definition in lib/assets/project-images.ts). Same rules as the batch: default prompt
 * and format for each type, automatic adoption, assets already queued are skipped. An editing derivative whose master has no
 * image yet is set aside (with its reason): it goes on the next click, once the master is adopted. */
export async function genererImagesManquantes(
  projectId: number,
): Promise<{ ok: true; lancees: number; ecartes: EcarteLot[] } | { ok: false; erreur: string }> {
  const v = verifier(idSchema, projectId);
  if (!v.ok) return v;
  const lignes = await db.select({ id: assets.id, type: assets.type, fichier: assets.fichier }).from(assets).where(and(eq(assets.projectId, projectId), horsAffiches));
  const ids = idsSansImage(lignes);
  if (ids.length === 0) return { ok: false, erreur: "Toutes les images de référence sont déjà là." };
  return lancerGenerationsLot(projectId, ids);
}

/** Drops a disposable source image for the « images » mode: stored under the
 * asset's folder (generations/<assetId>/sources/), generated name, never
 * attached to the registry. The form field is called `fichier`. */
export async function deposerSourceImport(
  assetId: number,
  formData: FormData,
): Promise<{ ok: true; fichier: string; src: string } | { ok: false; erreur: string }> {
  const v = verifier(idSchema, assetId);
  if (!v.ok) return v;
  const [asset] = await db.select({ id: assets.id }).from(assets).where(eq(assets.id, assetId));
  if (!asset) return { ok: false, erreur: "Cet asset n'existe pas." };
  const f = formData.get("fichier");
  if (!(f instanceof File) || f.size === 0) return { ok: false, erreur: "Choisis une image." };
  const ext = extname(f.name).toLowerCase();
  if (!EXTENSIONS_IMPORT.includes(ext)) return { ok: false, erreur: "Format non pris en charge (PNG, JPEG ou WebP)." };
  if (f.size > TAILLE_MAX_UPLOAD_ASSET) {
    return {
      ok: false,
      erreur: `Image trop volumineuse (${(f.size / 1024 / 1024).toFixed(1)} Mo, max ${TAILLE_MAX_UPLOAD_ASSET / 1024 / 1024} Mo).`,
    };
  }

  const fichier = `${randomUUID()}${ext}`;
  const cible = join(MEDIA_ROOT, cheminSourceImportMedia(assetId, fichier));
  await mkdir(dirname(cible), { recursive: true });
  await writeFile(cible, Buffer.from(await f.arrayBuffer()));
  const src = sourceImportMediaSrc(assetId, fichier);
  if (!src) return { ok: false, erreur: "L'image n'a pas pu être enregistrée." };
  return { ok: true, fichier, src };
}

/** Adopts a candidate: its image becomes the asset's (it replaces the
 * previous one, F01) and its prompt becomes the asset's: the sheet keeps what
 * produced the retained result. The asset goes back to « en cours »: a new
 * result has to be validated again. */
export async function adopterGeneration(generationId: number): Promise<Resultat> {
  const v = verifier(idSchema, generationId);
  if (!v.ok) return v;
  const r = await adopterCandidat(generationId, MEDIA_ROOT);
  if (r.ok) revalidatePath("/", "layout");
  return r;
}

export async function supprimerGeneration(generationId: number): Promise<Resultat> {
  const v = verifier(idSchema, generationId);
  if (!v.ok) return v;
  const [gen] = await db.select().from(assetGenerations).where(eq(assetGenerations.id, generationId));
  if (!gen) return { ok: true };
  if (gen.statut === "en_cours") return { ok: false, erreur: "Génération en cours : attends sa fin." };
  if (gen.statut === STATUT_TRADUCTION) await annulerTraductionEssai(db, gen.id);
  await supprimerGenerationEtFichiers(gen, MEDIA_ROOT);
  revalidatePath("/", "layout");
  return { ok: true };
}
