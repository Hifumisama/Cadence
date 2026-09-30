"use server";

import { db } from "@/db";
import { assets, voixFiches } from "@/db/schema";
import { and, eq, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import { dirname, extname, join } from "node:path";
import { MEDIA_ROOT, TAILLE_MAX_UPLOAD_ASSET, TAILLE_MAX_UPLOAD_VIDEO, cheminAssetMedia, cheminVoixMedia, estAudio, estVideo } from "@/lib/media";
import { construireCode } from "@/lib/assetCode";
import { getVoixAsset } from "@/lib/queries-voix";
import { estSourceVoix, type SourceVoix } from "@/lib/voix";

// Casting vocal (F06, CDC §6). Aucune action ici ne lance de génération :
// le backend ComfyUI voix n'existe pas encore (système de tâches dédié prévu,
// le worker actuel reste câblé sur la seule génération vidéo). Tout ce qui
// est écrit ici est du suivi réel — fichiers produits à la main dans
// ComfyUI puis déposés, paramètres retenus.

function nombreOuNull(v: FormDataEntryValue | string | null | undefined): number | null {
  const s = String(v ?? "").trim().replace(",", ".");
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function texte(v: FormDataEntryValue | null): string {
  return String(v ?? "").trim();
}

/** Écrit un fichier du carnet de casting sous voix/<assetId>/, nommé d'après
 * `base` — une nouvelle prise remplace l'ancienne (pas de versionnage, F01),
 * y compris quand l'extension change. */
async function enregistrerFichierVoix(
  assetId: number,
  base: string,
  fichier: File,
  ancien: string | null,
  nature: "audio" | "video",
): Promise<string> {
  const max = nature === "video" ? TAILLE_MAX_UPLOAD_VIDEO : TAILLE_MAX_UPLOAD_ASSET;
  if (fichier.size > max) {
    throw new Error(`Fichier trop volumineux (${(fichier.size / 1024 / 1024).toFixed(1)} Mo, max ${max / 1024 / 1024} Mo).`);
  }
  const ok = nature === "audio" ? estAudio(fichier.name) : estVideo(fichier.name);
  if (!ok) {
    throw new Error(nature === "audio" ? "Fichier audio attendu (FLAC ou WAV de préférence)." : "Fichier vidéo attendu (MP4, WebM, MOV).");
  }
  const nom = `${base}${extname(fichier.name).toLowerCase()}`;
  const chemin = join(MEDIA_ROOT, cheminVoixMedia(assetId, nom));
  await mkdir(dirname(chemin), { recursive: true });
  await writeFile(chemin, Buffer.from(await fichier.arrayBuffer()));
  if (ancien && ancien !== nom) {
    await unlink(join(MEDIA_ROOT, cheminVoixMedia(assetId, ancien))).catch(() => undefined);
  }
  return nom;
}

/** Un personnage a au plus une voix (index unique partiel, 2026-09-30). Message
 * lisible plutôt que l'erreur SQL — null si le personnage est libre. */
async function conflitPersonnage(personnageId: number | null, assetId: number | null): Promise<string | null> {
  if (personnageId == null) return null;
  const [perso] = await db.select().from(assets).where(and(eq(assets.id, personnageId), eq(assets.type, "personnage")));
  if (!perso) return "Ce personnage n'existe pas.";
  const autre = await db
    .select({ code: assets.code })
    .from(voixFiches)
    .innerJoin(assets, eq(assets.id, voixFiches.assetId))
    .where(and(eq(voixFiches.personnageId, personnageId), assetId != null ? ne(voixFiches.assetId, assetId) : undefined))
    .limit(1);
  return autre[0] ? `${perso.code} a déjà une voix (${autre[0].code}) — un personnage n'en a qu'une.` : null;
}

async function exigerVoix(assetId: number) {
  const asset = await getVoixAsset(assetId);
  if (!asset) throw new Error("Cette voix n'existe pas (ou n'est pas un asset de type voix).");
  return asset;
}

/** Nouvelle voix au catalogue = nouvel asset `VOICE_*` + sa fiche de casting. */
export async function creerVoix(projectId: number, formData: FormData): Promise<{ ok: true; code: string } | { ok: false; erreur: string }> {
  const code = construireCode("voix", texte(formData.get("nom")));
  if (code === "VOICE_") return { ok: false, erreur: "Nom manquant." };
  const [existant] = await db.select().from(assets).where(and(eq(assets.projectId, projectId), eq(assets.code, code)));
  if (existant) return { ok: false, erreur: `${code} existe déjà dans ce projet.` };

  const personnageId = nombreOuNull(formData.get("personnageId"));
  const conflit = await conflitPersonnage(personnageId, null);
  if (conflit) return { ok: false, erreur: conflit };
  const [cree] = await db
    .insert(assets)
    .values({
      projectId,
      code,
      type: "voix",
      critique: formData.get("critique") === "on",
      description: texte(formData.get("description")) || null,
    })
    .returning();
  await db.insert(voixFiches).values({ assetId: cree!.id, personnageId });
  revalidatePath("/", "layout");
  return { ok: true, code };
}

export type ValeursVoix = {
  description: string;
  instruction: string;
  critique: boolean;
  personnageId: number | null;
  source: SourceVoix;
  langue: string;
  refText: string;
};

/** Étape 1 : la voix. L'instruction VoiceDesign et la description canonique du
 * timbre restent sur l'asset (promptGeneration / description, déjà affichés
 * par le registre) ; le reste va dans voix_fiches. */
export async function enregistrerVoix(assetId: number, v: ValeursVoix): Promise<{ ok: true } | { ok: false; erreur: string }> {
  await exigerVoix(assetId);
  if (!estSourceVoix(v.source)) return { ok: false, erreur: "Source de voix inconnue." };
  const conflit = await conflitPersonnage(v.personnageId, assetId);
  if (conflit) return { ok: false, erreur: conflit };
  await db
    .update(assets)
    .set({ description: v.description.trim() || null, promptGeneration: v.instruction.trim() || null, critique: v.critique })
    .where(eq(assets.id, assetId));
  const valeurs = {
    personnageId: v.personnageId,
    source: v.source,
    langue: v.langue.trim() || "French",
    refText: v.refText.trim(),
  };
  await db
    .insert(voixFiches)
    .values({ assetId, ...valeurs })
    .onConflictDoUpdate({ target: voixFiches.assetId, set: valeurs });
  revalidatePath("/", "layout");
  return { ok: true };
}

// ---------------------------------------------------------------------
// Étape 2 — la référence (assets.fichier, rangée sous assets/ comme au registre)
// ---------------------------------------------------------------------

/** Dépose la voix de référence : générée à la main dans ComfyUI, ou fournie
 * puis rognée à la taille de la réplique (rognage côté navigateur, le fichier
 * arrive déjà coupé). Elle remplace la précédente (F01). */
export async function deposerReference(assetId: number, formData: FormData) {
  const asset = await exigerVoix(assetId);
  const fichier = formData.get("fichier");
  if (!(fichier instanceof File) || fichier.size === 0) return;
  if (fichier.size > TAILLE_MAX_UPLOAD_ASSET) {
    throw new Error(
      `Fichier trop volumineux (${(fichier.size / 1024 / 1024).toFixed(1)} Mo, max ${TAILLE_MAX_UPLOAD_ASSET / 1024 / 1024} Mo).`,
    );
  }
  if (!estAudio(fichier.name)) throw new Error("Fichier audio attendu (FLAC ou WAV de préférence).");
  const nom = `${asset.code}${extname(fichier.name).toLowerCase()}`;
  const chemin = join(MEDIA_ROOT, cheminAssetMedia(nom));
  await mkdir(dirname(chemin), { recursive: true });
  await writeFile(chemin, Buffer.from(await fichier.arrayBuffer()));
  if (asset.fichier && asset.fichier !== nom) {
    await unlink(join(MEDIA_ROOT, cheminAssetMedia(asset.fichier))).catch(() => undefined);
  }
  await db.update(assets).set({ fichier: nom }).where(eq(assets.id, assetId));
  revalidatePath("/", "layout");
}

// ---------------------------------------------------------------------
// Étape 3 — test vidéo : un décor (optionnel), un personnage (optionnel), le
// texte à tester ; l'audio prêt, s'il y en a un, se dépose en glisser-déposer.
// ---------------------------------------------------------------------

export async function enregistrerTest(
  assetId: number,
  v: { decorId: number | null; personnageId: number | null; texte: string },
): Promise<{ ok: true } | { ok: false; erreur: string }> {
  const asset = await exigerVoix(assetId);
  for (const [id, type] of [[v.decorId, "decor"], [v.personnageId, "personnage"]] as const) {
    if (id == null) continue;
    const [a] = await db
      .select({ id: assets.id })
      .from(assets)
      .where(and(eq(assets.id, id), eq(assets.projectId, asset.projectId), eq(assets.type, type)));
    if (!a) return { ok: false, erreur: type === "decor" ? "Ce décor n'existe pas dans le projet." : "Ce personnage n'existe pas dans le projet." };
  }
  const valeurs = { testDecorId: v.decorId, testPersonnageId: v.personnageId, testTexte: v.texte.trim() };
  await db
    .insert(voixFiches)
    .values({ assetId, ...valeurs })
    .onConflictDoUpdate({ target: voixFiches.assetId, set: valeurs });
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function deposerAudioTest(assetId: number, formData: FormData) {
  await exigerVoix(assetId);
  const fichier = formData.get("fichier");
  if (!(fichier instanceof File) || fichier.size === 0) return;
  const [fiche] = await db.select().from(voixFiches).where(eq(voixFiches.assetId, assetId));
  const nom = await enregistrerFichierVoix(assetId, "test_audio", fichier, fiche?.testAudio ?? null, "audio");
  await db
    .insert(voixFiches)
    .values({ assetId, testAudio: nom })
    .onConflictDoUpdate({ target: voixFiches.assetId, set: { testAudio: nom } });
  revalidatePath("/", "layout");
}

export async function retirerAudioTest(assetId: number) {
  await exigerVoix(assetId);
  const [fiche] = await db.select().from(voixFiches).where(eq(voixFiches.assetId, assetId));
  if (!fiche?.testAudio) return;
  await unlink(join(MEDIA_ROOT, cheminVoixMedia(assetId, fiche.testAudio))).catch(() => undefined);
  await db.update(voixFiches).set({ testAudio: null }).where(eq(voixFiches.assetId, assetId));
  revalidatePath("/", "layout");
}

/** Rendu du test vidéo, déposé à la main tant que la génération H3 des
 * utilitaires n'est pas branchée. */
export async function deposerVideoTest(assetId: number, formData: FormData) {
  await exigerVoix(assetId);
  const fichier = formData.get("fichier");
  if (!(fichier instanceof File) || fichier.size === 0) return;
  const [fiche] = await db.select().from(voixFiches).where(eq(voixFiches.assetId, assetId));
  const nom = await enregistrerFichierVoix(assetId, "test_video", fichier, fiche?.testVideo ?? null, "video");
  await db
    .insert(voixFiches)
    .values({ assetId, testVideo: nom })
    .onConflictDoUpdate({ target: voixFiches.assetId, set: { testVideo: nom } });
  revalidatePath("/", "layout");
}

// ---------------------------------------------------------------------
// Étape 4 — répliques : elles vivent dans app/repliques/actions.ts (entités
// autonomes, F02 révision 2026-09-30). La voix d'une réplique se déduit de son
// personnage — plus de « caster/délier » ici.
// ---------------------------------------------------------------------

/** Rattache la voix à un personnage (ou la détache avec `null`) : c'est le seul
 * endroit où le lien voix <-> personnage s'écrit (voix_fiches.personnageId), que
 * ce soit depuis le casting ou depuis « Assigner une voix » du registre. */
export async function assignerVoixAuPersonnage(
  personnageId: number,
  voixAssetId: number | null,
): Promise<{ ok: true } | { ok: false; erreur: string }> {
  const [perso] = await db.select().from(assets).where(and(eq(assets.id, personnageId), eq(assets.type, "personnage")));
  if (!perso) return { ok: false, erreur: "Ce personnage n'existe pas." };
  // Une seule voix par personnage : on détache l'éventuelle voix actuelle.
  await db.update(voixFiches).set({ personnageId: null }).where(eq(voixFiches.personnageId, personnageId));
  if (voixAssetId != null) {
    await exigerVoix(voixAssetId);
    await db
      .insert(voixFiches)
      .values({ assetId: voixAssetId, personnageId })
      .onConflictDoUpdate({ target: voixFiches.assetId, set: { personnageId } });
  }
  revalidatePath("/", "layout");
  return { ok: true };
}
