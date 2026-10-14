import { copyFile, mkdir, unlink } from "node:fs/promises";
import { dirname, extname, join } from "node:path";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { assetGenerations, assets } from "../db/schema";
import { appliquerAffiche } from "./affiche-application";
import { TYPE_AFFICHE, titreDansPrompt } from "./affiches";
import { METHODE_AUDIO, METHODE_MASTER_VOIX, videoDeMaster } from "./asset-generation";
import { cheminAssetMedia, cheminGenerationMedia, cheminVoixMedia } from "./media";

/** Adopter un candidat : son fichier devient l'image (ou le son) de l'asset, et son prompt celui de l'asset. Partagé par
 * l'action « Adopter » de l'interface (app/assets/generation-actions.ts) et par le worker, qui adopte tout seul les générations d'un
 * LOT (`asset_generations.adoption_auto` : générer par lot, c'est vouloir utiliser le résultat). Aucune dépendance à Next. */
export async function adopterCandidat(generationId: number, mediaRoot: string): Promise<{ ok: true } | { ok: false; erreur: string }> {
  const [gen] = await db.select().from(assetGenerations).where(eq(assetGenerations.id, generationId));
  if (!gen || gen.statut !== "termine" || !gen.fichier) return { ok: false, erreur: "Ce candidat n'est pas disponible." };
  const [asset] = await db.select().from(assets).where(eq(assets.id, gen.assetId));
  if (!asset) return { ok: false, erreur: "Cet asset n'existe pas." };

  // Le master de voix d'un personnage : l'audio nettoyé (et sa vidéo) deviennent SA voix, l'image du personnage n'est pas touchée.
  if (gen.methode === METHODE_MASTER_VOIX) return adopterMasterVoix(gen, asset, mediaRoot);

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
  await db
    .update(assets)
    .set({
      fichier: nom,
      fichierAt: new Date(),
      statut: "en_cours",
      promptGeneration: gen.prompt,
      ...(gen.methode === METHODE_AUDIO && gen.dureeSecondes != null ? { dureeSecondes: gen.dureeSecondes } : {}),
    })
    .where(eq(assets.id, asset.id));
  // Une affiche de présentation : l'image adoptée devient celle du projet ou de l'épisode (lib/affiches.ts).
  if (asset.type === TYPE_AFFICHE) {
    const appliquee = await appliquerAffiche(asset.code, nom, mediaRoot, titreDansPrompt(gen.prompt));
    if (!appliquee.ok) return appliquee;
  }
  // Adopter, c'est avoir vu le résultat : l'indicateur du header ne le signale plus.
  if (!gen.vuAt) await db.update(assetGenerations).set({ vuAt: new Date() }).where(eq(assetGenerations.id, gen.id));
  return { ok: true };
}

/** Adopte un master de voix : l'audio nettoyé devient `voix_master` du personnage (et la vidéo de test, si elle est là, `voix_video`),
 * rangés sous voix/<personnageId>/. Un nouveau master REMPLACE l'ancien (F01 : pas de versions). */
async function adopterMasterVoix(
  gen: typeof assetGenerations.$inferSelect,
  asset: typeof assets.$inferSelect,
  mediaRoot: string,
): Promise<{ ok: true } | { ok: false; erreur: string }> {
  const ext = extname(gen.fichier!).toLowerCase() || ".mp3";
  const nomAudio = `master${ext}`;
  const nomVideo = videoDeMaster(nomAudio).replace(/^master/, "master_video");
  try {
    await mkdir(join(mediaRoot, cheminVoixMedia(asset.id, "")), { recursive: true });
    await copyFile(join(mediaRoot, cheminGenerationMedia(asset.id, gen.fichier!)), join(mediaRoot, cheminVoixMedia(asset.id, nomAudio)));
  } catch {
    return { ok: false, erreur: "Le fichier du candidat est introuvable sur le stockage." };
  }
  const video = await copyFile(join(mediaRoot, cheminGenerationMedia(asset.id, videoDeMaster(gen.fichier!))), join(mediaRoot, cheminVoixMedia(asset.id, nomVideo))).then(
    () => true,
    () => false,
  );
  // Un ancien master d'une autre extension, ou une ancienne vidéo que le nouveau n'a pas : retirés (le nouveau remplace tout).
  if (asset.voixMaster && asset.voixMaster !== nomAudio) await unlink(join(mediaRoot, cheminVoixMedia(asset.id, asset.voixMaster))).catch(() => undefined);
  if (asset.voixVideo && (!video || asset.voixVideo !== nomVideo)) await unlink(join(mediaRoot, cheminVoixMedia(asset.id, asset.voixVideo))).catch(() => undefined);
  await db
    .update(assets)
    .set({ voixMaster: nomAudio, voixVideo: video ? nomVideo : null, voixMasterAt: new Date() })
    .where(eq(assets.id, asset.id));
  if (!gen.vuAt) await db.update(assetGenerations).set({ vuAt: new Date() }).where(eq(assetGenerations.id, gen.id));
  return { ok: true };
}
