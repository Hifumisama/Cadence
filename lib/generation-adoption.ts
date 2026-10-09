import { copyFile, mkdir, unlink } from "node:fs/promises";
import { dirname, extname, join } from "node:path";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { assetGenerations, assets, voixFiches } from "../db/schema";
import { appliquerAffiche } from "./affiche-application";
import { TYPE_AFFICHE, titreDansPrompt } from "./affiches";
import { METHODE_AUDIO, METHODE_TEST_AUDIO, METHODE_VOIX, METHODE_VOIX_SOURCE, estMethodeTestVoix } from "./asset-generation";
import { cheminAssetMedia, cheminGenerationMedia, cheminVoixMedia } from "./media";
import { supprimerEssaisTest } from "./essais-test";
import { texteDuPromptTest } from "./voix";

/** Adopter un candidat : son fichier devient l'image (ou le son, ou la voix) de l'asset, et son prompt celui de l'asset. Partagé par
 * l'action « Adopter » de l'interface (app/assets/generation-actions.ts) et par le worker, qui adopte tout seul les générations d'un
 * LOT (`asset_generations.adoption_auto` : générer par lot, c'est vouloir utiliser le résultat). Aucune dépendance à Next. */
export async function adopterCandidat(generationId: number, mediaRoot: string): Promise<{ ok: true } | { ok: false; erreur: string }> {
  const [gen] = await db.select().from(assetGenerations).where(eq(assetGenerations.id, generationId));
  if (!gen || gen.statut !== "termine" || !gen.fichier) return { ok: false, erreur: "Ce candidat n'est pas disponible." };
  const [asset] = await db.select().from(assets).where(eq(assets.id, gen.assetId));
  if (!asset) return { ok: false, erreur: "Cet asset n'existe pas." };

  // Le test d'une voix (audio, vidéo) ne remplace jamais la voix de référence : il va sur la fiche de casting.
  if (estMethodeTestVoix(gen.methode)) return adopterTestVoix(gen, mediaRoot);

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
      // La voix isolée d'une source fournie n'a pas d'instruction : celle de la voix (si elle en avait une) reste en place.
      ...(gen.methode === METHODE_VOIX_SOURCE ? {} : { promptGeneration: gen.prompt }),
      ...(gen.methode === METHODE_AUDIO && gen.dureeSecondes != null ? { dureeSecondes: gen.dureeSecondes } : {}),
    })
    .where(eq(assets.id, asset.id));
  // Une voix de référence adoptée fixe aussi le texte qu'elle lit (au mot près) sur la fiche de casting. Une voix FOURNIE fixe sa
  // transcription (celle de l'extraction, corrigée à la main avant l'adoption) et passe la fiche en mode « fournie ».
  if (gen.methode === METHODE_VOIX && gen.texteReference) {
    await db.update(voixFiches).set({ refText: gen.texteReference }).where(eq(voixFiches.assetId, asset.id));
  }
  if (gen.methode === METHODE_VOIX_SOURCE) {
    const valeurs = { source: "reference", refText: (gen.texteReference ?? "").trim() };
    await db.insert(voixFiches).values({ assetId: asset.id, ...valeurs }).onConflictDoUpdate({ target: voixFiches.assetId, set: valeurs });
  }
  // Une affiche de présentation : l'image adoptée devient celle du projet ou de l'épisode (lib/affiches.ts).
  if (asset.type === TYPE_AFFICHE) {
    const appliquee = await appliquerAffiche(asset.code, nom, mediaRoot, titreDansPrompt(gen.prompt));
    if (!appliquee.ok) return appliquee;
  }
  // Adopter, c'est avoir vu le résultat : l'indicateur du header ne le signale plus.
  if (!gen.vuAt) await db.update(assetGenerations).set({ vuAt: new Date() }).where(eq(assetGenerations.id, gen.id));
  // Une NOUVELLE voix de référence : les tentatives du ressenti jugeaient l'ancienne, elles partent (la référence ressenti, elle, est
  // refaite par la resynchronisation).
  if (gen.methode === METHODE_VOIX || gen.methode === METHODE_VOIX_SOURCE) await supprimerEssaisTest(asset.id, mediaRoot);
  return { ok: true };
}

/** Adopte un candidat de TEST de voix : l'audio ou la vidéo de test de la fiche, rangé sous voix/<assetId>/ (le même rangement que
 * les dépôts à la main, une nouvelle prise remplace l'ancienne). Adopter l'audio fixe aussi le texte du test : la vidéo doit dire
 * la même chose, au mot près. La voix (statut, référence, instruction) n'est pas touchée. */
async function adopterTestVoix(gen: typeof assetGenerations.$inferSelect, mediaRoot: string): Promise<{ ok: true } | { ok: false; erreur: string }> {
  const audio = gen.methode === METHODE_TEST_AUDIO;
  const nom = `${audio ? "test_audio" : "test_video"}${extname(gen.fichier!).toLowerCase() || (audio ? ".mp3" : ".mp4")}`;
  const cible = join(mediaRoot, cheminVoixMedia(gen.assetId, nom));
  try {
    await mkdir(dirname(cible), { recursive: true });
    await copyFile(join(mediaRoot, cheminGenerationMedia(gen.assetId, gen.fichier!)), cible);
  } catch {
    return { ok: false, erreur: "Le fichier du candidat est introuvable sur le stockage." };
  }
  const [fiche] = await db.select().from(voixFiches).where(eq(voixFiches.assetId, gen.assetId));
  const ancien = audio ? fiche?.testAudio : fiche?.testVideo;
  if (ancien && ancien !== nom) await unlink(join(mediaRoot, cheminVoixMedia(gen.assetId, ancien))).catch(() => undefined);
  // La vidéo gardée devient la « référence ressenti » : on retient aussi le texte qu'elle dit, pour la nommer dans la liste.
  const valeurs = audio ? { testAudio: nom, testTexte: gen.prompt } : { testVideo: nom, testTexte: gen.texteReference?.trim() || texteDuPromptTest(gen.prompt) };
  await db
    .insert(voixFiches)
    .values({ assetId: gen.assetId, ...valeurs })
    .onConflictDoUpdate({ target: voixFiches.assetId, set: valeurs });
  if (!gen.vuAt) await db.update(assetGenerations).set({ vuAt: new Date() }).where(eq(assetGenerations.id, gen.id));
  return { ok: true };
}
