"use server";

import { db } from "@/db";
import { assets, repliques, voixFiches } from "@/db/schema";
import { and, eq, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import { dirname, extname, join } from "node:path";
import {
  DUREE_TEST_VIDEO_SECONDES,
  METHODE_TEST_AUDIO,
  METHODE_TEST_VIDEO,
  langueDuTexteDeReference,
  nouvelleSeed,
  raisonTestAudioInvalide,
  raisonTestVideoInvalide,
} from "@/lib/asset-generation";
import { assetGenerations } from "@/db/schema";
import {
  MEDIA_ROOT,
  TAILLE_MAX_UPLOAD_ASSET,
  TAILLE_MAX_UPLOAD_VIDEO,
  cheminAssetMedia,
  cheminVoixMedia,
  estAudio,
  estImage,
  estVideo,
  fichierMediaExiste,
} from "@/lib/media";
import { nbImagesEnAttente, rangDansLaFile } from "@/lib/queries-taches";
import { PLAFOND_FILE_IMAGES } from "@/lib/taches";
import { construireCode } from "@/lib/assetCode";
import { getVoixAsset } from "@/lib/queries-voix";
import { TEXTE_REFERENCE_DEFAUT, estSourceVoix, promptTestVoix, type SourceVoix } from "@/lib/voix";
import { existsSync } from "node:fs";

// Casting vocal (F06, CDC §6). Le suivi réel (fichiers déposés, paramètres retenus) vit ici ; les générations de la voix de
// référence passent par app/assets/generation-actions.ts, celles du test (audio, vidéo) par lancerTestAudio / lancerTestVideo plus bas.
// Les prises de RÉPLIQUES passent par app/repliques/generation-actions.ts (genererPriseReplique).

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
// Étape 3, génération — l'audio de test (la voix de référence clonée dit le texte) puis la vidéo de test (la voix sur un visage,
// prévisualisation puis rendu final). Même file et mêmes candidats que les images : ces actions posent une demande en base, le
// worker la prend (worker/images.ts), « Utiliser » (adopterGeneration) en fait l'audio ou la vidéo de test de la fiche.
// ---------------------------------------------------------------------

type ResultatLancement = { ok: true; position: number } | { ok: false; erreur: string };

const FILE_PLEINE = `La file est pleine (${PLAFOND_FILE_IMAGES} générations en attente) : laisse le worker en vider quelques-unes.`;

/** Texte, personnage et décor du test : la même écriture que « Enregistrer », pour que ce qu'on lance soit ce qu'on a sous les yeux. */
async function memoriserTest(assetId: number, v: { decorId: number | null; personnageId: number | null; texte: string }) {
  const r = await enregistrerTest(assetId, v);
  if (!r.ok) return r;
  return null;
}

/** « Générer l'audio de test » : la voix de référence (clonée) dit le texte du test, avec VOX_Generate_Replique_Simplified. La voix
 * de référence est figée dans la demande : la remplacer pendant l'attente ne change pas ce test. */
export async function lancerTestAudio(
  assetId: number,
  v: { decorId: number | null; personnageId: number | null; texte: string },
): Promise<ResultatLancement> {
  const asset = await exigerVoix(assetId);
  const raison = raisonTestAudioInvalide({ texte: v.texte, referenceFichier: asset.fichier && fichierMediaExiste(asset.fichier) ? asset.fichier : null });
  if (raison) return { ok: false, erreur: raison };
  if ((await nbImagesEnAttente()) >= PLAFOND_FILE_IMAGES) return { ok: false, erreur: FILE_PLEINE };
  const refus = await memoriserTest(assetId, v);
  if (refus) return refus;
  const [fiche] = await db.select({ langue: voixFiches.langue }).from(voixFiches).where(eq(voixFiches.assetId, assetId));

  const [gen] = await db
    .insert(assetGenerations)
    .values({
      assetId,
      methode: METHODE_TEST_AUDIO,
      prompt: v.texte.trim(),
      langueReference: langueDuTexteDeReference(v.texte, TEXTE_REFERENCE_DEFAUT, fiche?.langue ?? "French"),
      seed: nouvelleSeed(),
      parametres: { reference: cheminAssetMedia(asset.fichier!) },
    })
    .returning({ id: assetGenerations.id });
  revalidatePath("/", "layout");
  return { ok: true, position: await rangDansLaFile(gen!.id) };
}

/** « Prévisualiser » (`upscale` faux : sortie basse résolution, rapide) ou « Rendu final » (`upscale` vrai) : la vidéo de test, avec
 * le graphe des plans (VID_REF2VA). Le prompt est composé ici (lib/voix.ts:promptTestVoix) et les références sont figées dans la
 * demande : personnage et décor (leur image), l'audio de test, à défaut la voix de référence. */
export async function lancerTestVideo(
  assetId: number,
  v: { decorId: number | null; personnageId: number | null; texte: string; upscale: boolean },
): Promise<ResultatLancement> {
  const asset = await exigerVoix(assetId);
  const [fiche] = await db.select().from(voixFiches).where(eq(voixFiches.assetId, assetId));
  const audio = fiche?.testAudio && existsSync(join(MEDIA_ROOT, cheminVoixMedia(assetId, fiche.testAudio)))
    ? cheminVoixMedia(assetId, fiche.testAudio)
    : asset.fichier && fichierMediaExiste(asset.fichier)
      ? cheminAssetMedia(asset.fichier)
      : null;
  const raison = raisonTestVideoInvalide({ texte: v.texte, audio });
  if (raison) return { ok: false, erreur: raison };

  // Une image de personnage ou de décor sélectionnée DOIT exister : sans elle, le prompt parlerait d'une <Picture> absente.
  const lire = async (id: number | null, nature: "personnage" | "décor") => {
    if (id == null) return { ok: true as const, ligne: null };
    const [a] = await db.select().from(assets).where(and(eq(assets.id, id), eq(assets.projectId, asset.projectId)));
    if (!a) return { ok: false as const, erreur: nature === "décor" ? "Ce décor n'existe pas dans le projet." : "Ce personnage n'existe pas dans le projet." };
    if (!a.fichier || !estImage(a.fichier) || !fichierMediaExiste(a.fichier)) {
      return { ok: false as const, erreur: `${a.code} n'a pas encore d'image : génère-la au registre, ou choisis ${nature === "décor" ? "un fond neutre" : "un personnage générique"}.` };
    }
    return { ok: true as const, ligne: a };
  };
  const perso = await lire(v.personnageId, "personnage");
  if (!perso.ok) return perso;
  const decor = await lire(v.decorId, "décor");
  if (!decor.ok) return decor;

  if ((await nbImagesEnAttente()) >= PLAFOND_FILE_IMAGES) return { ok: false, erreur: FILE_PLEINE };
  const refus = await memoriserTest(assetId, v);
  if (refus) return refus;

  const prompt = promptTestVoix({
    texte: v.texte,
    personnage: perso.ligne ? { code: perso.ligne.code, description: perso.ligne.description } : null,
    decor: decor.ligne ? { code: decor.ligne.code, description: decor.ligne.description } : null,
    avecAudio: true,
  });
  const [gen] = await db
    .insert(assetGenerations)
    .values({
      assetId,
      methode: METHODE_TEST_VIDEO,
      prompt,
      dureeSecondes: DUREE_TEST_VIDEO_SECONDES,
      seed: nouvelleSeed(),
      parametres: {
        upscale: v.upscale,
        personnage: perso.ligne ? cheminAssetMedia(perso.ligne.fichier!) : null,
        decor: decor.ligne ? cheminAssetMedia(decor.ligne.fichier!) : null,
        audio,
      },
    })
    .returning({ id: assetGenerations.id });
  revalidatePath("/", "layout");
  return { ok: true, position: await rangDansLaFile(gen!.id) };
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
