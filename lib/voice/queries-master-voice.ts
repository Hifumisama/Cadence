import { and, eq } from "drizzle-orm";
import { db } from "../../db";
import { assets } from "../../db/schema";
import { assetMediaSrc, voixMediaSrc } from "../media";

/** The voice of a character (voice/master workstream): what was wanted (description, test line) and the selected master, with the URLs of
 * its audio and of its test video. Server side only (disk access). null if the asset is not a character of the project. */
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
    /** The character's portrait (its registry image): the poster of the test screen. */
    portraitSrc: assetMediaSrc(a.fichier),
  };
}
