"use server";

import { db } from "@/db";
import { assetGenerationSources, assetGenerations, assets, projects } from "@/db/schema";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { randomUUID } from "node:crypto";
import { access, copyFile, mkdir, unlink, writeFile } from "node:fs/promises";
import { dirname, extname, join } from "node:path";
import {
  METHODE_AUDIO,
  nouvelleSeed,
  raisonAudioNonGenerable,
  raisonDemandeAudioInvalide,
  raisonDemandeInvalide,
  raisonNonGenerable,
  type DemandeAudio,
  type DemandeGeneration,
} from "@/lib/asset-generation";
import { supprimerGenerationEtFichiers } from "@/lib/generation-sources";
import { nbImagesEnAttente, rangDansLaFile } from "@/lib/queries-taches";
import { PLAFOND_FILE_IMAGES } from "@/lib/taches";
import {
  MEDIA_ROOT,
  TAILLE_MAX_UPLOAD_ASSET,
  cheminAssetMedia,
  cheminGenerationMedia,
  cheminSourceImportMedia,
  estImage,
  estNomSourceImport,
  sourceImportMediaSrc,
} from "@/lib/media";

// Génération d'images d'un asset (tâche ComfyUI dédiée). Ces actions ne
// parlent jamais à ComfyUI : elles posent une demande en base, le worker la
// prend (worker/images.ts). Le résultat est un candidat que l'utilisateur adopte.
// Deux modes (voir DemandeGeneration) : « texte » (Krea 2 Turbo) et « images »
// (Qwen Image Edit 2511, 1 à 3 sources, la première est la cible).

type Resultat = { ok: true } | { ok: false; erreur: string };

/** `position` : 1 = la génération part tout de suite ; n = n-1 tâches passent devant. */
type ResultatLancement = { ok: true; position: number } | { ok: false; erreur: string };

const EXTENSIONS_IMPORT = [".png", ".jpg", ".jpeg", ".webp"];

async function existe(chemin: string): Promise<boolean> {
  try {
    await access(chemin);
    return true;
  } catch {
    return false;
  }
}

/** Source résolue au lancement : le nom de fichier est un instantané (voir
 * assetGenerationSources). */
type SourceResolue = { origine: "asset" | "import"; assetId: number | null; fichier: string };

/** Pose une demande dans la file : plusieurs générations peuvent attendre (même
 * pour un seul asset), jusqu'à PLAFOND_FILE_IMAGES en attente au total. */
export async function lancerGeneration(assetId: number, demande: DemandeGeneration): Promise<ResultatLancement> {
  const [asset] = await db.select().from(assets).where(eq(assets.id, assetId));
  if (!asset) return { ok: false, erreur: "Cet asset n'existe pas." };
  const raisonAsset = raisonNonGenerable(asset);
  if (raisonAsset) return { ok: false, erreur: raisonAsset };
  const raison = raisonDemandeInvalide(demande);
  if (raison) return { ok: false, erreur: raison };
  if ((await nbImagesEnAttente()) >= PLAFOND_FILE_IMAGES) {
    return { ok: false, erreur: `La file est pleine (${PLAFOND_FILE_IMAGES} images en attente) : laisse le worker en vider quelques-unes.` };
  }

  const prompt = demande.prompt.trim();
  const sources: SourceResolue[] = [];

  if (demande.mode === "images") {
    for (const [i, src] of demande.sources.entries()) {
      if (src.origine === "asset") {
        const [source] = await db.select().from(assets).where(eq(assets.id, src.assetId));
        if (!source || source.projectId !== asset.projectId) {
          return { ok: false, erreur: `Image ${i + 1} : cet asset n'existe pas dans le projet.` };
        }
        if (!source.fichier) return { ok: false, erreur: `Image ${i + 1} : « ${source.code} » n'a pas encore d'image.` };
        if (!estImage(source.fichier)) return { ok: false, erreur: `Image ${i + 1} : « ${source.code} » n'est pas une image.` };
        if (!(await existe(join(MEDIA_ROOT, cheminAssetMedia(source.fichier))))) {
          return { ok: false, erreur: `Image ${i + 1} : le fichier de « ${source.code} » est introuvable sur le stockage.` };
        }
        sources.push({ origine: "asset", assetId: source.id, fichier: source.fichier });
      } else {
        if (!estNomSourceImport(src.fichier)) return { ok: false, erreur: `Image ${i + 1} : nom de fichier invalide.` };
        if (!(await existe(join(MEDIA_ROOT, cheminSourceImportMedia(assetId, src.fichier))))) {
          return { ok: false, erreur: `Image ${i + 1} : l'image importée n'est plus disponible, dépose-la à nouveau.` };
        }
        sources.push({ origine: "import", assetId: null, fichier: src.fichier });
      }
    }
  }

  const [projet] = await db.select({ clauseStyle: projects.clauseStyle }).from(projects).where(eq(projects.id, asset.projectId));
  const texte = demande.mode === "texte";

  const genId = await db.transaction(async (tx) => {
    const [gen] = await tx
      .insert(assetGenerations)
      .values({
        assetId,
        methode: texte ? "generation" : "edition",
        prompt,
        // Instantané de ce qui est soumis : la clause de style et le format ne
        // concernent que le mode texte (l'édition suit l'image 1, sans style).
        clauseStyle: texte ? (projet?.clauseStyle ?? "") : "",
        ...(texte ? { aspect: demande.aspect, megapixels: demande.megapixels } : {}),
        loraPersonnage: texte ? demande.loraPersonnage : false,
        lightning: texte ? null : true,
        seed: nouvelleSeed(),
      })
      .returning({ id: assetGenerations.id });
    if (sources.length > 0) {
      await tx.insert(assetGenerationSources).values(
        sources.map((s, i) => ({ generationId: gen!.id, position: i + 1, origine: s.origine, assetId: s.assetId, fichier: s.fichier })),
      );
    }
    return gen!.id;
  });
  revalidatePath("/", "layout");
  return { ok: true, position: await rangDansLaFile(genId) };
}

/** Pose une demande de génération AUDIO (SFX, Stable Audio 3) dans la même file que
 * les images (table `asset_generations`, méthode « audio »). Réservée aux assets
 * de type `sfx` ; la durée est un paramètre séparé du prompt ; la seed est tirée
 * côté serveur. */
export async function lancerGenerationAudio(assetId: number, demande: DemandeAudio): Promise<ResultatLancement> {
  const [asset] = await db.select().from(assets).where(eq(assets.id, assetId));
  if (!asset) return { ok: false, erreur: "Cet asset n'existe pas." };
  const raisonAsset = raisonAudioNonGenerable(asset.type);
  if (raisonAsset) return { ok: false, erreur: raisonAsset };
  const raison = raisonDemandeAudioInvalide(demande);
  if (raison) return { ok: false, erreur: raison };
  if ((await nbImagesEnAttente()) >= PLAFOND_FILE_IMAGES) {
    return { ok: false, erreur: `La file est pleine (${PLAFOND_FILE_IMAGES} générations en attente) : laisse le worker en vider quelques-unes.` };
  }

  const [gen] = await db
    .insert(assetGenerations)
    .values({
      assetId,
      methode: METHODE_AUDIO,
      prompt: demande.prompt.trim(),
      dureeSecondes: demande.dureeSecondes,
      seed: nouvelleSeed(),
    })
    .returning({ id: assetGenerations.id });
  revalidatePath("/", "layout");
  return { ok: true, position: await rangDansLaFile(gen!.id) };
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

/** Adopte un candidat : son image (ou son son) devient celle de l'asset (elle
 * remplace la précédente, F01) et son prompt devient celui de l'asset : la fiche
 * garde ce qui a produit le résultat retenu. Pour un son, la durée demandée
 * devient aussi celle de l'asset. L'asset repasse « en cours » : un résultat
 * nouveau est à revalider. */
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
  await db
    .update(assets)
    .set({
      fichier: nom,
      statut: "en_cours",
      promptGeneration: gen.prompt,
      ...(gen.methode === METHODE_AUDIO && gen.dureeSecondes != null ? { dureeSecondes: gen.dureeSecondes } : {}),
    })
    .where(eq(assets.id, asset.id));
  // Adopter, c'est avoir vu le résultat : l'indicateur du header ne le signale plus.
  if (!gen.vuAt) await db.update(assetGenerations).set({ vuAt: new Date() }).where(eq(assetGenerations.id, gen.id));
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function supprimerGeneration(generationId: number): Promise<Resultat> {
  const [gen] = await db.select().from(assetGenerations).where(eq(assetGenerations.id, generationId));
  if (!gen) return { ok: true };
  if (gen.statut === "en_cours") return { ok: false, erreur: "Génération en cours : attends sa fin." };
  await supprimerGenerationEtFichiers(gen, MEDIA_ROOT);
  revalidatePath("/", "layout");
  return { ok: true };
}
