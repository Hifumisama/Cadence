import { and, eq } from "drizzle-orm";
import { db } from "../db";
import { assets } from "../db/schema";
import { assetMediaSrc, voixMediaSrc } from "./media";

/** La voix d'un personnage (chantier voix/master) : ce qu'on a voulu (description, réplique du test) et le master retenu, avec les URL de
 * son audio et de sa vidéo de test. Côté serveur uniquement (accès disque). null si l'asset n'est pas un personnage du projet. */
export async function getVoixPersonnage(projectId: number, assetId: number) {
  const [a] = await db
    .select({
      voixDescription: assets.voixDescription,
      voixRepliqueBase: assets.voixRepliqueBase,
      voixMaster: assets.voixMaster,
      voixVideo: assets.voixVideo,
      voixMasterAt: assets.voixMasterAt,
      fichier: assets.fichier,
    })
    .from(assets)
    .where(and(eq(assets.id, assetId), eq(assets.projectId, projectId), eq(assets.type, "personnage")));
  if (!a) return null;
  const version = a.voixMasterAt ? `?v=${a.voixMasterAt.getTime()}` : "";
  const audio = voixMediaSrc(assetId, a.voixMaster);
  const video = voixMediaSrc(assetId, a.voixVideo);
  return {
    description: a.voixDescription ?? "",
    repliqueBase: a.voixRepliqueBase ?? "",
    masterNom: a.voixMaster,
    masterSrc: audio ? `${audio}${version}` : null,
    videoSrc: video ? `${video}${version}` : null,
    /** Le portrait du personnage (son image de registre) : l'affiche de l'écran de test. */
    portraitSrc: assetMediaSrc(a.fichier),
  };
}
