"use server";

import { db } from "@/db";
import { assets, planRefs, repliques } from "@/db/schema";
import { eq, or } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, extname, join } from "node:path";
import { MEDIA_ROOT, TAILLE_MAX_UPLOAD_ASSET, cheminAssetMedia } from "@/lib/media";
import { estMethodeAsset, methodeApplicable } from "@/lib/assetCode";
import { DUREE_AUDIO_MAX, DUREE_AUDIO_MIN, dureeAudioValide } from "@/lib/asset-generation";

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

/** Création d'un asset, fichier média optionnel dès la création (retour utilisateur 2026-09-28 : "évidemment on peut
 * fournir un fichier, c'est logique"). `deriveDeId` n'est plus un rang dans une arborescence : c'est l'IMAGE DE DÉPART
 * proposée d'office à la génération (« nouvel asset à partir de celui-ci ») ; la fenêtre de génération accepte jusqu'à 3
 * images sources, c'est donc là qu'un composite se compose. */
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
      methodeGeneration,
    })
    .returning();

  if (cree && fichier instanceof File && fichier.size > 0) {
    const nomFichier = await enregistrerFichierAsset(code, fichier);
    await db.update(assets).set({ fichier: nomFichier, fichierAt: new Date() }).where(eq(assets.id, cree.id));
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
    /** Durée du son en secondes (type sfx seulement ; null = non renseignée). */
    dureeSecondes?: number | null;
  },
): Promise<{ ok: true } | { ok: false; erreur: string }> {
  const [asset] = await db.select().from(assets).where(eq(assets.id, assetId));
  if (!asset) return { ok: false, erreur: "Cet asset n'existe pas." };
  const methode = valeurs.methodeGeneration || null;
  if (methode != null) {
    if (!estMethodeAsset(methode)) return { ok: false, erreur: "Méthode inconnue." };
    if (!methodeApplicable(asset.type)) {
      return {
        ok: false,
        erreur: asset.type === "sfx" ? "Un son se génère par la génération audio : pas de méthode d'image." : "Une voix se fabrique au casting vocal, pas par image.",
      };
    }
  }
  // La durée n'existe que pour un son ; vide = non renseignée.
  const duree = valeurs.dureeSecondes ?? null;
  if (asset.type === "sfx" && duree != null && !dureeAudioValide(duree)) {
    return { ok: false, erreur: `Durée hors limites (${DUREE_AUDIO_MIN} à ${DUREE_AUDIO_MAX} secondes).` };
  }
  await db
    .update(assets)
    .set({
      description: valeurs.description || null,
      promptGeneration: valeurs.promptGeneration || null,
      methodeGeneration: methode,
      critique: valeurs.critique,
      ...(asset.type === "sfx" ? { dureeSecondes: duree } : {}),
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

  await db.update(assets).set({ fichier: nomFichier, fichierAt: new Date() }).where(eq(assets.id, assetId));
  revalidatePath("/", "layout");
  
}

/** Pourquoi un asset ne peut pas être supprimé maintenant, ou null. Un asset cité dans une fiche de plan, ou locuteur ou
 * voix de répliques, est trop lié pour disparaître sans geste explicite. Avoir servi d'image de départ à d'autres assets
 * ne bloque PAS : leur image existe déjà, elle ne dépend pas de la source (le lien est simplement détaché). */
async function raisonDeBlocage(assetId: number): Promise<string | null> {
  const [ref] = await db.select().from(planRefs).where(eq(planRefs.assetId, assetId)).limit(1);
  if (ref) return "Encore cité comme référence dans une fiche de plan — délie-le d'abord.";
  // Une voix rattachée à un personnage ne bloque pas : supprimée, ses répliques
  // repassent « sans voix » (voix_fiches disparaît en cascade).
  const [replique] = await db
    .select({ id: repliques.id })
    .from(repliques)
    .where(or(eq(repliques.locuteurId, assetId), eq(repliques.voixId, assetId)))
    .limit(1);
  if (replique) return "Encore locuteur ou voix de répliques — change leur locuteur ou supprime-les d'abord.";
  return null;
}

async function supprimerSansRevalider(assetId: number): Promise<{ ok: true } | { ok: false; erreur: string }> {
  const erreur = await raisonDeBlocage(assetId);
  if (erreur) return { ok: false, erreur };
  // Les assets qui partaient de celui-ci gardent leur image : on détache simplement le lien.
  await db.update(assets).set({ deriveDeId: null }).where(eq(assets.deriveDeId, assetId));
  await db.delete(assets).where(eq(assets.id, assetId));
  return { ok: true };
}

/** Suppression protégée (retour utilisateur 2026-09-28) : voir `raisonDeBlocage`. */
export async function supprimerAsset(
  assetId: number,
): Promise<{ ok: true } | { ok: false; erreur: string }> {
  const r = await supprimerSansRevalider(assetId);
  if (r.ok) revalidatePath("/", "layout");
  return r;
}

/** Suppression de plusieurs assets (sélection du registre) : chacun suit les mêmes règles ; ceux qui sont bloqués sont
 * rendus avec leur raison, les autres partent. */
export async function supprimerAssets(
  ids: number[],
): Promise<{ supprimes: number; bloques: { code: string; erreur: string }[] }> {
  let supprimes = 0;
  const bloques: { code: string; erreur: string }[] = [];
  for (const id of [...new Set(ids)]) {
    const [asset] = await db.select({ code: assets.code }).from(assets).where(eq(assets.id, id));
    if (!asset) continue;
    const r = await supprimerSansRevalider(id);
    if (r.ok) supprimes += 1;
    else bloques.push({ code: asset.code, erreur: r.erreur });
  }
  if (supprimes > 0) revalidatePath("/", "layout");
  return { supprimes, bloques };
}

/** Modifie UN champ (ou quelques-uns) de la fiche : les blocs de la fiche s'enregistrent chacun à leur tour. Les valeurs
 * absentes restent ce qu'elles sont ; les règles sont celles de `updateAsset`. */
export async function modifierChampAsset(
  assetId: number,
  champs: {
    description?: string;
    promptGeneration?: string;
    methodeGeneration?: string | null;
    critique?: boolean;
    dureeSecondes?: number | null;
  },
): Promise<{ ok: true } | { ok: false; erreur: string }> {
  const [asset] = await db.select().from(assets).where(eq(assets.id, assetId));
  if (!asset) return { ok: false, erreur: "Cet asset n'existe pas." };
  return updateAsset(assetId, {
    description: champs.description ?? asset.description ?? "",
    promptGeneration: champs.promptGeneration ?? asset.promptGeneration ?? "",
    methodeGeneration: champs.methodeGeneration !== undefined ? champs.methodeGeneration : asset.methodeGeneration,
    critique: champs.critique ?? asset.critique,
    dureeSecondes: champs.dureeSecondes !== undefined ? champs.dureeSecondes : asset.dureeSecondes,
  });
}

/** Délie une référence (image/audio/vidéo) précise sans toucher au reste du
 * plan — débloque la suppression de l'asset si c'était sa dernière citation. */
export async function delierRef(refId: number) {
  await db.delete(planRefs).where(eq(planRefs.id, refId));
  revalidatePath("/", "layout");
  
}
