"use server";

import { db } from "@/db";
import { assetGenerationSources, assetGenerations, assets, projects } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { randomUUID } from "node:crypto";
import { copyFile, mkdir, unlink } from "node:fs/promises";
import { dirname, extname, join } from "node:path";
import { creerRun } from "@/lib/agents/runs";
import { BUT_ESSAI, entreeEssaiAsset } from "@/lib/agents/essai-asset";
import { libelleAsset } from "@/lib/assetCode";
import {
  STATUT_TRADUCTION,
  formatParDefaut,
  loraParDefaut,
  maxImagesJointes,
  methodeDEssai,
  nouvelleSeed,
  raisonConsigneInvalide,
  raisonNonGenerable,
} from "@/lib/asset-generation";
import { styleDesImages } from "@/lib/conception";
import { MEDIA_ROOT, cheminAssetMedia, cheminGenerationMedia, cheminSourceImportMedia, estImage, estNomSourceImport } from "@/lib/media";
import { nbImagesEnAttente } from "@/lib/queries-taches";
import { PLAFOND_FILE_IMAGES } from "@/lib/taches";

// La fiche d'un asset « comme la fiche de plan » : on écrit une consigne en français, un agent la traduit en prompt (Krea 2 sans image de
// base, Qwen Image Edit avec), l'essai part dans la file d'images, et le journal des essais garde consigne, base et prompt de chacun.

type Resultat = { ok: true } | { ok: false; erreur: string };

/** D'où repart un essai : l'image actuelle de l'asset, un essai précédent (par son uuid), ou de rien (Krea 2 crée l'image). */
export type BaseEssai = "actuelle" | { essai: string } | null;

/** Une image jointe à l'essai : celle d'un autre asset du registre, ou une image déposée (voir `deposerSourceImport`). */
export type ImageJointe = { origine: "asset"; assetId: number } | { origine: "import"; fichier: string };

/** Lance un essai : pose l'essai (statut « traduction ») et la tâche qui traduit la consigne. Le résultat est un essai du journal, jamais l'image
 * de l'asset directement : on l'adopte quand il convient. */
export async function lancerEssai(
  assetId: number,
  p: { consigne: string; base: BaseEssai; jointes?: ImageJointe[] },
): Promise<Resultat & { uuid?: string }> {
  const [asset] = await db.select().from(assets).where(eq(assets.id, assetId));
  if (!asset) return { ok: false, erreur: "Cet asset n'existe pas." };
  const raisonAsset = raisonNonGenerable(asset);
  if (raisonAsset) return { ok: false, erreur: raisonAsset };

  // L'image de base, et le prompt qui l'a produite.
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
  const aUneBase = baseFichierRelatif != null;
  const jointes = p.jointes ?? [];
  if (jointes.length > maxImagesJointes(aUneBase)) {
    return { ok: false, erreur: aUneBase ? "Pour retoucher, une seule image peut s'ajouter à l'image de base." : "Trois images au plus." };
  }
  // Les images jointes sont résolues AVANT toute écriture : un fichier manquant ne laisse rien derrière lui.
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
  const raison = raisonConsigneInvalide(consigne, aDesImages, asset.description);
  if (raison) return { ok: false, erreur: raison };
  if ((await nbImagesEnAttente()) >= PLAFOND_FILE_IMAGES) {
    return { ok: false, erreur: `La file est pleine (${PLAFOND_FILE_IMAGES} images en attente) : laisse le worker en vider quelques-unes.` };
  }

  // La base est PHOTOGRAPHIÉE : l'essai garde l'image dont il est parti, même si l'asset change ensuite (comme les sources importées).
  let nomBase: string | null = null;
  if (baseFichierRelatif) {
    nomBase = `${randomUUID()}${extname(baseFichierRelatif).toLowerCase() || ".png"}`;
    const cible = join(MEDIA_ROOT, cheminSourceImportMedia(assetId, nomBase));
    try {
      await mkdir(dirname(cible), { recursive: true });
      await copyFile(join(MEDIA_ROOT, baseFichierRelatif), cible);
    } catch {
      return { ok: false, erreur: "L'image de base est introuvable sur le stockage." };
    }
  }

  const images = [
    ...(aUneBase ? [{ rang: 1, role: "base" as const, libelle: `l'image actuelle de « ${libelleAsset(asset)} »` }] : []),
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
        clauseStyle: texte ? styleDesImages(projet) : "",
        ...(texte ? { aspect: format.aspect, megapixels: format.megapixels } : {}),
        loraPersonnage: texte && loraParDefaut(asset.type),
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

/** Retire l'image d'un asset : il redevient « sans image » (« à produire »), et le prochain essai repart de zéro avec Krea 2. Les essais restent. */
export async function retirerImageAsset(assetId: number): Promise<Resultat> {
  const [asset] = await db.select().from(assets).where(eq(assets.id, assetId));
  if (!asset) return { ok: false, erreur: "Cet asset n'existe pas." };
  if (!asset.fichier) return { ok: true };
  await db.update(assets).set({ fichier: null, fichierAt: new Date(), valide: false }).where(eq(assets.id, assetId));
  await unlink(join(MEDIA_ROOT, cheminAssetMedia(asset.fichier))).catch(() => undefined);
  revalidatePath("/", "layout");
  return { ok: true };
}

/** Duplique un asset : même type, même description, même prompt et une copie de l'image, sous un nouveau code. Pour une variante (une autre tenue,
 * un autre éclairage) on duplique puis on retouche la copie, sans toucher à l'original. Aucun lien n'est gardé entre les deux. */
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
    dureeSecondes: asset.dureeSecondes,
    fichier,
    fichierAt: fichier ? new Date() : null,
  });
  revalidatePath("/", "layout");
  return { ok: true, code };
}
