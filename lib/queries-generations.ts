import { db } from "../db";
import { assetGenerations } from "../db/schema";
import { desc, eq } from "drizzle-orm";
import { generationMediaSrc } from "./media";

/** Candidats d'image d'un asset, du plus récent au plus ancien, avec l'URL de
 * leur aperçu quand le fichier est sur le stockage. Côté serveur uniquement
 * (accès disque). */
export async function getGenerationsAsset(assetId: number) {
  const lignes = await db
    .select()
    .from(assetGenerations)
    .where(eq(assetGenerations.assetId, assetId))
    .orderBy(desc(assetGenerations.createdAt), desc(assetGenerations.id));
  return lignes.map((g) => ({
    id: g.id,
    statut: g.statut,
    aspect: g.aspect,
    megapixels: g.megapixels,
    loraPersonnage: g.loraPersonnage,
    erreur: g.erreur,
    src: g.statut === "termine" ? generationMediaSrc(assetId, g.fichier) : null,
    createdAt: g.createdAt.toISOString(),
  }));
}

export type GenerationVue = Awaited<ReturnType<typeof getGenerationsAsset>>[number];
