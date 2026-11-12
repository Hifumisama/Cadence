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
} from "@/lib/asset-generation";
import { annulerTraductionEssai } from "@/lib/agents/essai-asset";
import { horsAffiches } from "@/lib/assets-visibles";
import { adopterCandidat } from "@/lib/generation-adoption";
import { poserGenerationsLot } from "@/lib/generation-lancement";
import { idsSansImage } from "@/lib/images-projet";
import { type EcarteLot } from "@/lib/generation-lot";
import { supprimerGenerationEtFichiers } from "@/lib/generation-sources";

import {
  MEDIA_ROOT,
  TAILLE_MAX_UPLOAD_ASSET,
  cheminSourceImportMedia,
  sourceImportMediaSrc,
} from "@/lib/media";

// Génération d'images d'un asset (tâche ComfyUI dédiée). Ces actions ne
// parlent jamais à ComfyUI : elles posent une demande en base, le worker la
// prend (worker/images.ts). Le résultat est un candidat que l'utilisateur adopte.
// Deux modes (voir DemandeGeneration) : « texte » (Krea 2 Turbo) et « images »
// (Qwen Image Edit 2511, 1 à 3 sources, la première est la cible).

type Resultat = { ok: true } | { ok: false; erreur: string };

/** `position` : 1 = la génération part tout de suite ; n = n-1 tâches passent devant. */


const EXTENSIONS_IMPORT = [".png", ".jpg", ".jpeg", ".webp"];

/** Génération EN LOT (registre d'assets) : voir poserGenerationsLot. */
export async function lancerGenerationsLot(
  projectId: number,
  assetIds: number[],
): Promise<{ ok: true; lancees: number; ecartes: EcarteLot[] } | { ok: false; erreur: string }> {
  const r = await poserGenerationsLot(projectId, assetIds);
  revalidatePath("/", "layout");
  return r;
}

/** « Générer toutes les images de référence » (clap de la préparation, bandeau « Prochaine étape », registre) : le lot ci-dessus
 * appliqué à tous les assets à illustrer qui n'ont pas d'image (définition dans lib/images-projet.ts). Mêmes règles que le lot : prompt
 * et format par défaut de chaque type, adoption automatique, assets déjà en file sautés. Un dérivé en édition dont le master n'a pas
 * encore d'image est écarté (avec sa raison) : il part au clic suivant, une fois le master adopté. */
export async function genererImagesManquantes(
  projectId: number,
): Promise<{ ok: true; lancees: number; ecartes: EcarteLot[] } | { ok: false; erreur: string }> {
  const lignes = await db.select({ id: assets.id, type: assets.type, fichier: assets.fichier }).from(assets).where(and(eq(assets.projectId, projectId), horsAffiches));
  const ids = idsSansImage(lignes);
  if (ids.length === 0) return { ok: false, erreur: "Toutes les images de référence sont déjà là." };
  return lancerGenerationsLot(projectId, ids);
}

/** Dépose une image source jetable pour le mode « images » : rangée sous le
 * dossier de l'asset (generations/<assetId>/sources/), nom généré, jamais
 * rattachée au registre. Le champ du formulaire s'appelle `fichier`. */
export async function deposerSourceImport(
  assetId: number,
  formData: FormData,
): Promise<{ ok: true; fichier: string; src: string } | { ok: false; erreur: string }> {
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

/** Adopte un candidat : son image devient celle de l'asset (elle remplace la
 * précédente, F01) et son prompt devient celui de l'asset : la fiche garde ce
 * qui a produit le résultat retenu. L'asset repasse « en cours » : un résultat
 * nouveau est à revalider. */
export async function adopterGeneration(generationId: number): Promise<Resultat> {
  const r = await adopterCandidat(generationId, MEDIA_ROOT);
  if (r.ok) revalidatePath("/", "layout");
  return r;
}

export async function supprimerGeneration(generationId: number): Promise<Resultat> {
  const [gen] = await db.select().from(assetGenerations).where(eq(assetGenerations.id, generationId));
  if (!gen) return { ok: true };
  if (gen.statut === "en_cours") return { ok: false, erreur: "Génération en cours : attends sa fin." };
  if (gen.statut === STATUT_TRADUCTION) await annulerTraductionEssai(db, gen.id);
  await supprimerGenerationEtFichiers(gen, MEDIA_ROOT);
  revalidatePath("/", "layout");
  return { ok: true };
}
