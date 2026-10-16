"use server";

import { db } from "@/db";
import { assets, planRefs } from "@/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, extname, join } from "node:path";
import { MEDIA_ROOT, TAILLE_MAX_UPLOAD_ASSET, cheminAssetMedia } from "@/lib/media";
import { PREFIXE_PAR_TYPE, TYPES_ASSET, construireCode, estMethodeAsset, methodeApplicable, type TypeAsset } from "@/lib/assetCode";
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

/** « Nouveau sujet » : un type et un nom, rien d'autre — le reste se fait sur la fiche. Le nom saisi devient le `label` ; le `code`
 * (préfixe du type + nom sans accents ni espaces) est l'identifiant et ne changera plus, même si le label change. */
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
  await db.insert(assets).values({ projectId, code, type, label, methodeGeneration: methodeApplicable(type) ? "generation" : null });
  revalidatePath("/", "layout");
  return { ok: true, code };
}

/** Change le nom affiché d'un asset. Le code (l'identifiant) ne bouge pas : il nomme le fichier et reste cité tel quel par les plans
 * et les agents. Un nom vide rend l'asset à son code lisible. */
export async function renommerAsset(assetId: number, label: string): Promise<{ ok: true } | { ok: false; erreur: string }> {
  const propre = label.trim().slice(0, 120);
  const [asset] = await db.select({ id: assets.id }).from(assets).where(eq(assets.id, assetId));
  if (!asset) return { ok: false, erreur: "Cet asset n'existe pas." };
  await db.update(assets).set({ label: propre || null }).where(eq(assets.id, assetId));
  revalidatePath("/", "layout");
  return { ok: true };
}

/** Valide (ou dévalide) un asset : la seule décision de statut qui se saisit (le reste se calcule, lib/asset-etat.ts). Sans fichier,
 * il n'y a rien à valider. */
export async function definirValidation(assetId: number, valide: boolean): Promise<{ ok: true } | { ok: false; erreur: string }> {
  const [asset] = await db.select({ fichier: assets.fichier }).from(assets).where(eq(assets.id, assetId));
  if (!asset) return { ok: false, erreur: "Cet asset n'existe pas." };
  if (valide && !asset.fichier) return { ok: false, erreur: "Rien à valider : cet asset n'a pas encore de fichier." };
  await db.update(assets).set({ valide }).where(eq(assets.id, assetId));
  revalidatePath("/", "layout");
  return { ok: true };
}

/** Valide plusieurs assets d'un coup (sélection du registre) : ceux qui n'ont pas de fichier sont comptés à part. */
export async function validerAssets(ids: number[]): Promise<{ valides: number; sansFichier: number }> {
  const lignes = await db.select({ id: assets.id, fichier: assets.fichier }).from(assets).where(inArray(assets.id, [...new Set(ids)]));
  const avecFichier = lignes.filter((l) => l.fichier).map((l) => l.id);
  if (avecFichier.length) await db.update(assets).set({ valide: true }).where(inArray(assets.id, avecFichier));
  revalidatePath("/", "layout");
  return { valides: avecFichier.length, sansFichier: lignes.length - avecFichier.length };
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

  // Un fichier importé est un travail déjà fait ailleurs : validé d'office (seule une génération adoptée repasse « en cours »).
  await db.update(assets).set({ fichier: nomFichier, fichierAt: new Date(), valide: true }).where(eq(assets.id, assetId));
  revalidatePath("/", "layout");
}

/** Pourquoi un asset ne peut pas être supprimé maintenant, ou null. Un asset cité dans une fiche de plan est trop lié pour disparaître sans geste explicite. Avoir servi d'image de départ à d'autres assets
 * ne bloque PAS : leur image existe déjà, elle ne dépend pas de la source (le lien est simplement détaché). */
async function raisonDeBlocage(assetId: number): Promise<string | null> {
  const [ref] = await db.select().from(planRefs).where(eq(planRefs.assetId, assetId)).limit(1);
  if (ref) return "Encore cité comme référence dans une fiche de plan — délie-le d'abord.";
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

/** Modifie UN champ (ou quelques-uns) de la fiche : les blocs de la fiche s'enregistrent chacun à leur tour. Les valeurs absentes
 * restent ce qu'elles sont. */
export async function modifierChampAsset(
  assetId: number,
  champs: {
    description?: string;
    promptGeneration?: string;
    methodeGeneration?: string | null;
    /** Durée du son en secondes (type sfx seulement ; null = non renseignée). */
    dureeSecondes?: number | null;
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
      if (!methodeApplicable(asset.type)) return { ok: false, erreur: "Un son se génère par la génération audio : pas de méthode d'image." };
    }
    valeurs.methodeGeneration = methode;
  }
  // La durée n'existe que pour un son ; vide = non renseignée.
  if (asset.type === "sfx" && champs.dureeSecondes !== undefined) {
    const duree = champs.dureeSecondes ?? null;
    if (duree != null && !dureeAudioValide(duree)) return { ok: false, erreur: `Durée hors limites (${DUREE_AUDIO_MIN} à ${DUREE_AUDIO_MAX} secondes).` };
    valeurs.dureeSecondes = duree;
  }
  if (Object.keys(valeurs).length) await db.update(assets).set(valeurs).where(eq(assets.id, assetId));
  revalidatePath("/", "layout");
  return { ok: true };
}

/** Délie une référence (image/audio/vidéo) précise sans toucher au reste du
 * plan — débloque la suppression de l'asset si c'était sa dernière citation. */
export async function delierRef(refId: number) {
  await db.delete(planRefs).where(eq(planRefs.id, refId));
  revalidatePath("/", "layout");
  
}
