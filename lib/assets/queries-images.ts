import { and, eq } from "drizzle-orm";
import { db } from "../../db";
import { assets } from "../../db/schema";
import { horsAffiches } from "./assets-visible";
import { etatImages, type EtatImages } from "./project-images";
import { PLAFOND_LOT_IMAGES, type AssetPourLot } from "./generation-batch";
import { assetsEnFile, nbImagesEnAttente } from "../tasks/queries-tasks";

/** L'état des images de référence d'un projet, lu en base (règles dans lib/assets/project-images.ts). Sert la page de l'installateur, le
 * bandeau « Prochaine étape », le registre d'assets et le sondage de /api/images/<projectId>. */
export async function lireEtatImages(projectId: number): Promise<EtatImages> {
  const [lignes, enFile, nbEnAttente] = await Promise.all([
    db
      .select({
        id: assets.id,
        code: assets.code,
        type: assets.type,
        promptGeneration: assets.promptGeneration,
        methodeGeneration: assets.methodeGeneration,
        fichier: assets.fichier,
        deriveDeId: assets.deriveDeId,
      })
      .from(assets)
      .where(and(eq(assets.projectId, projectId), horsAffiches)),
    assetsEnFile(projectId),
    nbImagesEnAttente(),
  ]);
  return etatImages(lignes as AssetPourLot[], enFile, Math.max(0, PLAFOND_LOT_IMAGES - nbEnAttente));
}
