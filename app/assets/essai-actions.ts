"use server";

import { db } from "@/db";
import { assetGenerationSources, assetGenerations, assets, projects } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { randomUUID } from "node:crypto";
import { copyFile, mkdir, unlink } from "node:fs/promises";
import { dirname, extname, join } from "node:path";
import { creerRun } from "@/lib/agents/runs";
import { BUT_ESSAI, entreeEssaiAsset } from "@/lib/agents/asset-attempt";
import { libelleAsset } from "@/lib/assets/assetCode";
import {
  STATUT_TRADUCTION,
  formatParDefaut,
  maxImagesJointes,
  methodeDEssai,
  nouvelleSeed,
  raisonConsigneInvalide,
} from "@/lib/assets/asset-generation";
import { TYPE_AFFICHE } from "@/lib/posters/posters";
import { styleDesEditions, styleDesImages } from "@/lib/projects/design";
import { MEDIA_ROOT, cheminAssetMedia, cheminGenerationMedia, cheminSourceImportMedia, estImage, estNomSourceImport } from "@/lib/media";
import { nbImagesEnAttente } from "@/lib/tasks/queries-tasks";
import { cheminCanevasAffiche } from "@/worker/canvas-poster";
import { PLAFOND_FILE_IMAGES } from "@/lib/tasks/tasks";

// An asset's sheet works « like the clip sheet »: a directive is written in French, an agent translates it into a prompt (Krea 2 without a
// base image, Qwen Image Edit with one), the attempt goes into the image queue, and the attempt log keeps each one's directive, base and prompt.

type Resultat = { ok: true } | { ok: false; erreur: string };

/** Where an attempt starts from: the asset's current image, a previous attempt (by its uuid), or nothing (Krea 2 creates the image). */
export type BaseEssai = "actuelle" | { essai: string } | null;

/** An image attached to the attempt: that of another asset in the registry, or a dropped image (see `deposerSourceImport`). */
export type ImageJointe = { origine: "asset"; assetId: number } | { origine: "import"; fichier: string };

/** Launches an attempt: records the attempt (status « traduction ») and the task that translates the directive. The result is an attempt in the log, never the asset's
 * image directly: it is adopted when it fits. */
export async function lancerEssai(
  assetId: number,
  p: { consigne: string; base: BaseEssai; jointes?: ImageJointe[] },
): Promise<Resultat & { uuid?: string }> {
  const [asset] = await db.select().from(assets).where(eq(assets.id, assetId));
  if (!asset) return { ok: false, erreur: "Cet asset n'existe pas." };

  // The base image, and the prompt that produced it.
  let baseFichierRelatif: string | null = null;
  let promptBase = asset.promptGeneration ?? "";
  if (p.base === "actuelle") {
    if (!asset.fichier || !estImage(asset.fichier)) return { ok: false, erreur: "Cet asset n'a pas d'image à retoucher." };
    baseFichierRelatif = cheminAssetMedia(asset.fichier);
  } else if (p.base) {
    const [essai] = await db
      .select()
      .from(assetGenerations)
      .where(and(eq(assetGenerations.uuid, p.base.essai), eq(assetGenerations.assetId, assetId)));
    if (!essai || essai.statut !== "termine" || !essai.fichier) return { ok: false, erreur: "Cet essai n'a pas d'image à retoucher." };
    baseFichierRelatif = cheminGenerationMedia(assetId, essai.fichier);
    promptBase = essai.prompt;
  }
  const jointes = p.jointes ?? [];
  // A poster created from images (the main character, for example) starts from an empty 2:3 canvas as image 1: Qwen's output follows the
  // format of image 1, and without it a 16:9 character sheet would give a 16:9 poster. The canvas counts as the base image.
  const canevas = asset.type === TYPE_AFFICHE && baseFichierRelatif == null && jointes.length > 0;
  const aUneBase = baseFichierRelatif != null || canevas;
  if (jointes.length > maxImagesJointes(aUneBase)) {
    return { ok: false, erreur: aUneBase ? "Pour retoucher, une seule image peut s'ajouter à l'image de base." : "Trois images au plus." };
  }
  // Attached images are resolved BEFORE any write: a missing file leaves nothing behind.
  const sourcesJointes: { origine: "asset" | "import"; assetId: number | null; fichier: string; libelle: string }[] = [];
  for (const [i, j] of jointes.entries()) {
    if (j.origine === "asset") {
      const [source] = await db.select().from(assets).where(eq(assets.id, j.assetId));
      if (!source || source.projectId !== asset.projectId) return { ok: false, erreur: `Image jointe ${i + 1} : cet asset n'existe pas dans le projet.` };
      if (!source.fichier || !estImage(source.fichier)) return { ok: false, erreur: `Image jointe ${i + 1} : « ${libelleAsset(source)} » n'a pas d'image.` };
      sourcesJointes.push({ origine: "asset", assetId: source.id, fichier: source.fichier, libelle: libelleAsset(source) });
    } else {
      if (!estNomSourceImport(j.fichier)) return { ok: false, erreur: `Image jointe ${i + 1} : nom de fichier invalide.` };
      sourcesJointes.push({ origine: "import", assetId: null, fichier: j.fichier, libelle: "une image déposée" });
    }
  }
  const aDesImages = aUneBase || sourcesJointes.length > 0;
  const consigne = p.consigne.trim();
  // A poster is drawn from the project's title and summary: its directive may stay empty, even with images (the canvas counts as base).
  const raison = raisonConsigneInvalide(consigne, aDesImages && !canevas, asset.description);
  if (raison) return { ok: false, erreur: raison };
  if ((await nbImagesEnAttente()) >= PLAFOND_FILE_IMAGES) {
    return { ok: false, erreur: `La file est pleine (${PLAFOND_FILE_IMAGES} images en attente) : laisse le worker en vider quelques-unes.` };
  }

  // The base is SNAPSHOTTED: the attempt keeps the image it started from, even if the asset changes afterwards (like imported sources).
  let nomBase: string | null = null;
  if (baseFichierRelatif || canevas) {
    const origine = baseFichierRelatif ? join(MEDIA_ROOT, baseFichierRelatif) : await cheminCanevasAffiche(join(MEDIA_ROOT, "_canevas"));
    nomBase = `${randomUUID()}${extname(origine).toLowerCase() || ".png"}`;
    const cible = join(MEDIA_ROOT, cheminSourceImportMedia(assetId, nomBase));
    try {
      await mkdir(dirname(cible), { recursive: true });
      await copyFile(origine, cible);
    } catch {
      return { ok: false, erreur: "L'image de base est introuvable sur le stockage." };
    }
  }

  const images = [
    ...(canevas ? [{ rang: 1, role: "base" as const, libelle: "an empty vertical 2:3 canvas (the poster to paint)" }] : []),
    ...(baseFichierRelatif ? [{ rang: 1, role: "base" as const, libelle: `l'image actuelle de « ${libelleAsset(asset)} »` }] : []),
    ...sourcesJointes.map((s, i) => ({ rang: (aUneBase ? 2 : 1) + i, role: "jointe" as const, libelle: s.libelle })),
  ];
  const entree = await entreeEssaiAsset(db, asset.projectId, assetId, { consigne, aUneBase, promptBase, images });
  if (!entree) return { ok: false, erreur: "Cet asset n'existe pas dans ce projet." };
  const [projet] = await db
    .select({ clauseStyle: projects.clauseStyle, stylePromptImage: projects.stylePromptImage })
    .from(projects)
    .where(eq(projects.id, asset.projectId));
  const methode = methodeDEssai(aDesImages);
  const texte = methode === "generation";
  const format = formatParDefaut(asset.type);

  const uuid = await db.transaction(async (tx) => {
    const [gen] = await tx
      .insert(assetGenerations)
      .values({
        assetId,
        methode,
        statut: STATUT_TRADUCTION,
        prompt: "",
        consigne: consigne || null,
        // Editing: the short clause, recalled by the worker as the last line of the instructions (see lib/assets/generation-launch.ts).
        clauseStyle: texte ? styleDesImages(projet) : styleDesEditions(projet),
        ...(texte ? { aspect: format.aspect, megapixels: format.megapixels } : {}),
        lightning: texte ? null : true,
        seed: nouvelleSeed(),
      })
      .returning({ id: assetGenerations.id, uuid: assetGenerations.uuid });
    const lignes = [
      ...(nomBase ? [{ origine: "import" as const, assetId: null, fichier: nomBase }] : []),
      ...sourcesJointes.map((s) => ({ origine: s.origine, assetId: s.assetId, fichier: s.fichier })),
    ];
    if (lignes.length > 0) {
      await tx.insert(assetGenerationSources).values(lignes.map((l, i) => ({ generationId: gen!.id, position: i + 1, ...l })));
    }
    await creerRun(tx, {
      skill: entree.skill,
      entree: entree.entree,
      but: BUT_ESSAI,
      projectId: asset.projectId,
      conversationId: null,
      options: { generationId: gen!.id, variante: entree.variante },
    });
    return gen!.uuid;
  });
  revalidatePath("/", "layout");
  return { ok: true, uuid };
}

/** Removes an asset's image: it becomes « sans image » (« à produire ») again, and the next attempt starts from scratch with Krea 2. The attempts remain. */
export async function retirerImageAsset(assetId: number): Promise<Resultat> {
  const [asset] = await db.select().from(assets).where(eq(assets.id, assetId));
  if (!asset) return { ok: false, erreur: "Cet asset n'existe pas." };
  if (!asset.fichier) return { ok: true };
  await db.update(assets).set({ fichier: null, fichierAt: new Date(), valide: false }).where(eq(assets.id, assetId));
  await unlink(join(MEDIA_ROOT, cheminAssetMedia(asset.fichier))).catch(() => undefined);
  revalidatePath("/", "layout");
  return { ok: true };
}

/** Duplicates an asset: same type, same description, same prompt and a copy of the image, under a new code. For a variant (another outfit,
 * another lighting) you duplicate then retouch the copy, without touching the original. No link is kept between the two. */
export async function dupliquerAsset(assetId: number): Promise<{ ok: true; code: string } | { ok: false; erreur: string }> {
  const [asset] = await db.select().from(assets).where(eq(assets.id, assetId));
  if (!asset) return { ok: false, erreur: "Cet asset n'existe pas." };
  const existants = new Set((await db.select({ code: assets.code }).from(assets).where(eq(assets.projectId, asset.projectId))).map((a) => a.code));
  let code = `${asset.code}_copie`;
  for (let n = 2; existants.has(code); n++) code = `${asset.code}_copie_${n}`;

  let fichier: string | null = null;
  if (asset.fichier) {
    fichier = `${code}${extname(asset.fichier)}`;
    const cible = join(MEDIA_ROOT, cheminAssetMedia(fichier));
    try {
      await mkdir(dirname(cible), { recursive: true });
      await copyFile(join(MEDIA_ROOT, cheminAssetMedia(asset.fichier)), cible);
    } catch {
      fichier = null;
    }
  }
  await db.insert(assets).values({
    projectId: asset.projectId,
    code,
    label: `${libelleAsset(asset)} (copie)`.slice(0, 120),
    type: asset.type,
    description: asset.description,
    promptGeneration: asset.promptGeneration,
    methodeGeneration: asset.methodeGeneration,
    fichier,
    fichierAt: fichier ? new Date() : null,
  });
  revalidatePath("/", "layout");
  return { ok: true, code };
}
