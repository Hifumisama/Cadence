"use server";

import { db } from "@/db";
import { assets } from "@/db/schema";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

/** Suivi de statut seulement (retour utilisateur 2026-09-27) : pas d'aide à
 * la génération de prompt d'image dans l'app pour l'instant — juste la
 * création d'une ligne, l'édition de son statut/critique/description. */
export async function creerAsset(valeurs: {
  code: string;
  type: string;
  description: string;
  critique: boolean;
  deriveDeId: number | null;
}) {
  await db.insert(assets).values({
    code: valeurs.code,
    type: valeurs.type,
    description: valeurs.description || null,
    critique: valeurs.critique,
    deriveDeId: valeurs.deriveDeId,
  });
  revalidatePath("/assets");
  if (valeurs.deriveDeId) revalidatePath("/assets/[code]", "page");
}

export async function updateAssetStatut(
  assetId: number,
  statut: "a_produire" | "en_cours" | "valide",
) {
  await db.update(assets).set({ statut }).where(eq(assets.id, assetId));
  revalidatePath("/assets");
  revalidatePath("/assets/[code]", "page");
}

export async function updateAsset(
  assetId: number,
  valeurs: { description: string; critique: boolean; fichier: string },
) {
  await db
    .update(assets)
    .set({
      description: valeurs.description || null,
      critique: valeurs.critique,
      fichier: valeurs.fichier || null,
    })
    .where(eq(assets.id, assetId));
  revalidatePath("/assets");
  revalidatePath("/assets/[code]", "page");
}
