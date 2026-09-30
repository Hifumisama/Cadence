"use server";

import { db } from "@/db";
import { assets, planRefs, repliques } from "@/db/schema";
import { eq, or } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, extname, join } from "node:path";
import { MEDIA_ROOT, TAILLE_MAX_UPLOAD_ASSET, cheminAssetMedia } from "@/lib/media";
import { estMethodeAsset, methodeApplicable } from "@/lib/assetCode";

async function enregistrerFichierAsset(code: string, fichier: File): Promise<string> {
  if (fichier.size > TAILLE_MAX_UPLOAD_ASSET) {
    throw new Error(
      `Fichier trop volumineux (${(fichier.size / 1024 / 1024).toFixed(1)} Mo, max ${TAILLE_MAX_UPLOAD_ASSET / 1024 / 1024} Mo).`,
    );
  }
  const ext = extname(fichier.name) || "";
  const nomFichier = `${code}${ext}`;
  const cheminComplet = join(MEDIA_ROOT, cheminAssetMedia(nomFichier));
  await mkdir(dirname(cheminComplet), { recursive: true });
  const octets = Buffer.from(await fichier.arrayBuffer());
  await writeFile(cheminComplet, octets);
  return nomFichier;
}

/** Création d'un sujet (master) ou d'un dérivé, fichier média optionnel dès
 * la création (retour utilisateur 2026-09-28 : "évidemment on peut fournir
 * un fichier, c'est logique"). */
export async function creerAsset(projectId: number, formData: FormData) {
  const code = String(formData.get("code") ?? "").trim();
  if (!code) return;
  const type = String(formData.get("type") ?? "oth");
  const methodeBrute = String(formData.get("methodeGeneration") ?? "");
  const methodeGeneration = methodeBrute && estMethodeAsset(methodeBrute) && methodeApplicable(type) ? methodeBrute : null;
  if (type === "voix") throw new Error("Une voix se crée depuis le casting vocal.");
  const description = String(formData.get("description") ?? "");
  const critique = formData.get("critique") === "on";
  const deriveDeIdBrut = formData.get("deriveDeId");
  const deriveDeId = deriveDeIdBrut ? Number(deriveDeIdBrut) : null;
  const fichier = formData.get("fichier");

  const [cree] = await db
    .insert(assets)
    .values({
      projectId,
      code,
      type,
      description: description || null,
      critique,
      deriveDeId,
      // Une édition sans parent n'a pas de source : ignorée à la création.
      methodeGeneration: methodeGeneration === "edition" && deriveDeId == null ? null : methodeGeneration,
    })
    .returning();

  if (cree && fichier instanceof File && fichier.size > 0) {
    const nomFichier = await enregistrerFichierAsset(code, fichier);
    await db.update(assets).set({ fichier: nomFichier }).where(eq(assets.id, cree.id));
  }

  revalidatePath("/", "layout");
}

export async function updateAssetStatut(
  assetId: number,
  statut: "a_produire" | "en_cours" | "valide",
) {
  await db.update(assets).set({ statut }).where(eq(assets.id, assetId));
  revalidatePath("/", "layout");
  
}

export async function updateAsset(
  assetId: number,
  valeurs: {
    description: string;
    promptGeneration: string;
    methodeGeneration: string | null;
    critique: boolean;
  },
): Promise<{ ok: true } | { ok: false; erreur: string }> {
  const [asset] = await db.select().from(assets).where(eq(assets.id, assetId));
  if (!asset) return { ok: false, erreur: "Cet asset n'existe pas." };
  const methode = valeurs.methodeGeneration || null;
  if (methode != null) {
    if (!estMethodeAsset(methode)) return { ok: false, erreur: "Méthode inconnue." };
    if (!methodeApplicable(asset.type)) return { ok: false, erreur: "Une voix se fabrique au casting vocal, pas par image." };
    if (methode === "edition" && asset.deriveDeId == null) {
      return { ok: false, erreur: "Une édition part de l'image du parent : cet asset n'en a pas." };
    }
  }
  await db
    .update(assets)
    .set({
      description: valeurs.description || null,
      promptGeneration: valeurs.promptGeneration || null,
      methodeGeneration: methode,
      critique: valeurs.critique,
    })
    .where(eq(assets.id, assetId));
  revalidatePath("/", "layout");
  return { ok: true };
}

/** Upload direct du fichier média (image/audio/vidéo) d'un asset déjà créé.
 * Le fichier est nommé d'après le code de l'asset (convention symétrique à
 * plans/<id>/... pour les vidéos de plan, voir lib/media.ts) : une
 * nouvelle version écrase simplement l'ancienne, cohérent avec "pas de
 * versionnage d'assets" (F01). */
export async function uploaderFichierAsset(
  assetId: number,
  code: string,
  formData: FormData,
) {
  const fichier = formData.get("fichier");
  if (!(fichier instanceof File) || fichier.size === 0) return;

  const nomFichier = await enregistrerFichierAsset(code, fichier);

  await db.update(assets).set({ fichier: nomFichier }).where(eq(assets.id, assetId));
  revalidatePath("/", "layout");
  
}

/** Suppression protégée (retour utilisateur 2026-09-28) : un asset relié à
 * quelque chose — des dérivés, une citation dans une fiche de plan (ref), un
 * rôle de locuteur ou de voix directe dans des répliques — ne se supprime pas
 * tant que ces liens n'ont pas été explicitement défaits. Contrairement aux scènes (qui se détachent
 * silencieusement), ici le lien est trop significatif pour être cassé sans
 * geste explicite. */
export async function supprimerAsset(
  assetId: number,
): Promise<{ ok: true } | { ok: false; erreur: string }> {
  const [enfant] = await db.select().from(assets).where(eq(assets.deriveDeId, assetId)).limit(1);
  if (enfant) {
    return { ok: false, erreur: `A encore des dérivés (dont ${enfant.code}) — supprime-les d'abord.` };
  }
  const [ref] = await db.select().from(planRefs).where(eq(planRefs.assetId, assetId)).limit(1);
  if (ref) {
    return { ok: false, erreur: "Encore cité comme référence dans une fiche de plan — délie-le d'abord." };
  }
  // Une voix rattachée à un personnage ne bloque pas : supprimée, ses répliques
  // repassent « sans voix » (voix_fiches disparaît en cascade).
  const [replique] = await db
    .select({ id: repliques.id })
    .from(repliques)
    .where(or(eq(repliques.locuteurId, assetId), eq(repliques.voixId, assetId)))
    .limit(1);
  if (replique) {
    return { ok: false, erreur: "Encore locuteur ou voix de répliques — change leur locuteur ou supprime-les d'abord." };
  }

  await db.delete(assets).where(eq(assets.id, assetId));
  revalidatePath("/", "layout");
  return { ok: true };
}

/** Délie une référence (image/audio/vidéo) précise sans toucher au reste du
 * plan — débloque la suppression de l'asset si c'était sa dernière citation. */
export async function delierRef(refId: number) {
  await db.delete(planRefs).where(eq(planRefs.id, refId));
  revalidatePath("/", "layout");
  
}
