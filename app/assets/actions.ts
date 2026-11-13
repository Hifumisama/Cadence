"use server";

import { db } from "@/db";
import { assets, planRefs } from "@/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { MEDIA_ROOT, TAILLE_MAX_UPLOAD_ASSET, cheminAssetMedia } from "@/lib/media";
import { PREFIXE_PAR_TYPE, TYPES_ASSET, construireCode, estMethodeAsset, nomFichierAsset, type TypeAsset } from "@/lib/assets/assetCode";

async function enregistrerFichierAsset(projectId: number, code: string, fichier: File): Promise<string> {
  if (fichier.size > TAILLE_MAX_UPLOAD_ASSET) {
    throw new Error(
      `Fichier trop volumineux (${(fichier.size / 1024 / 1024).toFixed(1)} Mo, max ${TAILLE_MAX_UPLOAD_ASSET / 1024 / 1024} Mo).`,
    );
  }
  const nomFichier = nomFichierAsset(projectId, code, fichier.name);
  const cheminComplet = join(MEDIA_ROOT, cheminAssetMedia(nomFichier));
  await mkdir(dirname(cheminComplet), { recursive: true });
  const octets = Buffer.from(await fichier.arrayBuffer());
  await writeFile(cheminComplet, octets);
  return nomFichier;
}

/** « Nouveau sujet »: a type and a name, nothing else — the rest is done on the sheet. The name entered becomes the `label`; the `code`
 * (type prefix + name without accents or spaces) is the identifier and will never change, even if the label does. */
export async function creerAssetRapide(
  projectId: number,
  type: string,
  nom: string,
): Promise<{ ok: true; code: string } | { ok: false; erreur: string }> {
  if (!(TYPES_ASSET as readonly string[]).includes(type)) return { ok: false, erreur: "Type d'asset inconnu." };
  const label = nom.trim().slice(0, 120);
  const code = construireCode(type, label);
  if (!label || code === (PREFIXE_PAR_TYPE[type as TypeAsset] ?? "")) return { ok: false, erreur: "Donne un nom à l'asset." };
  const [existant] = await db.select({ id: assets.id }).from(assets).where(and(eq(assets.projectId, projectId), eq(assets.code, code)));
  if (existant) return { ok: false, erreur: `Un asset ${code} existe déjà dans ce projet.` };
  await db.insert(assets).values({ projectId, code, type, label, methodeGeneration: "generation" });
  revalidatePath("/", "layout");
  return { ok: true, code };
}

/** Changes an asset's displayed name. The code (the identifier) does not move: it names the file and is cited as-is by clips
 * and agents. An empty name reverts the asset to its readable code. */
export async function renommerAsset(assetId: number, label: string): Promise<{ ok: true } | { ok: false; erreur: string }> {
  const propre = label.trim().slice(0, 120);
  const [asset] = await db.select({ id: assets.id }).from(assets).where(eq(assets.id, assetId));
  if (!asset) return { ok: false, erreur: "Cet asset n'existe pas." };
  await db.update(assets).set({ label: propre || null }).where(eq(assets.id, assetId));
  revalidatePath("/", "layout");
  return { ok: true };
}

/** Validates (or un-validates) an asset: the only status decision that is entered (the rest is computed, lib/assets/asset-state.ts). Without a file,
 * there is nothing to validate. */
export async function definirValidation(assetId: number, valide: boolean): Promise<{ ok: true } | { ok: false; erreur: string }> {
  const [asset] = await db.select({ fichier: assets.fichier }).from(assets).where(eq(assets.id, assetId));
  if (!asset) return { ok: false, erreur: "Cet asset n'existe pas." };
  if (valide && !asset.fichier) return { ok: false, erreur: "Rien à valider : cet asset n'a pas encore de fichier." };
  await db.update(assets).set({ valide }).where(eq(assets.id, assetId));
  revalidatePath("/", "layout");
  return { ok: true };
}

/** Validates several assets at once (registry selection): those without a file are counted separately. */
export async function validerAssets(ids: number[]): Promise<{ valides: number; sansFichier: number }> {
  const lignes = await db.select({ id: assets.id, fichier: assets.fichier }).from(assets).where(inArray(assets.id, [...new Set(ids)]));
  const avecFichier = lignes.filter((l) => l.fichier).map((l) => l.id);
  if (avecFichier.length) await db.update(assets).set({ valide: true }).where(inArray(assets.id, avecFichier));
  revalidatePath("/", "layout");
  return { valides: avecFichier.length, sansFichier: lignes.length - avecFichier.length };
}

/** Direct upload of the media file (image/audio/video) of an already created asset.
 * The file is named after the asset's code (symmetric convention to
 * clips/<id>/... for clip videos, see lib/media.ts): a new version
 * simply overwrites the old one, consistent with "no asset versioning" (F01).
 * The code comes from the database (by asset id), never from the client. */
export async function uploaderFichierAsset(
  assetId: number,
  formData: FormData,
) {
  const fichier = formData.get("fichier");
  if (!(fichier instanceof File) || fichier.size === 0) return;

  const [asset] = await db.select({ code: assets.code, projectId: assets.projectId }).from(assets).where(eq(assets.id, assetId));
  if (!asset) throw new Error("Asset introuvable.");
  const nomFichier = await enregistrerFichierAsset(asset.projectId, asset.code, fichier);

  // An imported file is work already done elsewhere: validated by default (only an adopted generation goes back to « en cours »).
  await db.update(assets).set({ fichier: nomFichier, fichierAt: new Date(), valide: true }).where(eq(assets.id, assetId));
  revalidatePath("/", "layout");
}

/** Why an asset cannot be deleted right now, or null. An asset cited in a clip sheet is too tightly bound to disappear without an explicit action. Having served as a starting image for other assets
 * does NOT block: their image already exists and does not depend on the source (the link is simply detached). */
async function raisonDeBlocage(assetId: number): Promise<string | null> {
  const [ref] = await db.select().from(planRefs).where(eq(planRefs.assetId, assetId)).limit(1);
  if (ref) return "Encore cité comme référence dans une fiche de plan — délie-le d'abord.";
  return null;
}

async function supprimerSansRevalider(assetId: number): Promise<{ ok: true } | { ok: false; erreur: string }> {
  const erreur = await raisonDeBlocage(assetId);
  if (erreur) return { ok: false, erreur };
  // Assets that started from this one keep their image: we simply detach the link.
  await db.update(assets).set({ deriveDeId: null }).where(eq(assets.deriveDeId, assetId));
  await db.delete(assets).where(eq(assets.id, assetId));
  return { ok: true };
}

/** Protected deletion (user feedback 2026-09-28): see `raisonDeBlocage`. */
export async function supprimerAsset(
  assetId: number,
): Promise<{ ok: true } | { ok: false; erreur: string }> {
  const r = await supprimerSansRevalider(assetId);
  if (r.ok) revalidatePath("/", "layout");
  return r;
}

/** Deletes several assets (registry selection): each follows the same rules; those that are blocked are
 * returned with their reason, the others go. */
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

/** Changes ONE field (or a few) of the sheet: the sheet's blocks are saved one after the other. Missing values
 * stay as they are. */
export async function modifierChampAsset(
  assetId: number,
  champs: {
    description?: string;
    promptGeneration?: string;
    methodeGeneration?: string | null;
  },
): Promise<{ ok: true } | { ok: false; erreur: string }> {
  const [asset] = await db.select().from(assets).where(eq(assets.id, assetId));
  if (!asset) return { ok: false, erreur: "Cet asset n'existe pas." };
  const valeurs: Partial<typeof assets.$inferInsert> = {};
  if (champs.description !== undefined) valeurs.description = champs.description || null;
  if (champs.promptGeneration !== undefined) valeurs.promptGeneration = champs.promptGeneration || null;
  if (champs.methodeGeneration !== undefined) {
    const methode = champs.methodeGeneration || null;
    if (methode != null) {
      if (!estMethodeAsset(methode)) return { ok: false, erreur: "Méthode inconnue." };
    }
    valeurs.methodeGeneration = methode;
  }
  if (Object.keys(valeurs).length) await db.update(assets).set(valeurs).where(eq(assets.id, assetId));
  revalidatePath("/", "layout");
  return { ok: true };
}

/** Unlinks one specific reference (image/audio/video) without touching the rest of the
 * clip — unblocks the asset's deletion if that was its last citation. */
export async function delierRef(refId: number) {
  await db.delete(planRefs).where(eq(planRefs.id, refId));
  revalidatePath("/", "layout");
  
}
