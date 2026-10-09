"use server";

import { db } from "@/db";
import { assetGenerations, assets, briefs, planDialogues, plans, repliques, voixFiches } from "@/db/schema";
import { and, eq, inArray, isNotNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { mkdir, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { dirname, extname, join } from "node:path";
import { METHODE_DOUBLAGE, METHODE_REPLIQUE, TEMPERATURE_VOIX_DEFAUT, TEMPERATURE_VOIX_MAX, TEMPERATURE_VOIX_MIN, nouvelleSeedTts, temperatureVoixValide } from "@/lib/asset-generation";
import { langueMoteurVoix } from "@/lib/langues-tts";
import { MEDIA_ROOT, TAILLE_MAX_UPLOAD_ASSET, cheminRepliqueMedia, estAudio, fichierMediaExiste } from "@/lib/media";
import { nbImagesEnAttente } from "@/lib/queries-taches";
import { PLAFOND_FILE_IMAGES } from "@/lib/taches";
import { priseObsolete } from "@/lib/repliques";

// Génération des PRISES de répliques depuis l'application (Qwen3-TTS Base, clonage de la voix de référence du casting :
// workflows/audio/VOX_Generate_Replique_Simplified.json). La demande vit dans `asset_generations` (méthode « replique », assetId =
// la voix, repliqueId = la réplique) : même file, même panneau des tâches, mêmes annulations que les images. À la fin, le worker
// pose la prise sur la réplique comme une prise déposée à la main (lib/replique-prise.ts) : elle REMPLACE la précédente (F01).

type Resultat<T = object> = ({ ok: true } & T) | { ok: false; erreur: string };
type Replique = typeof repliques.$inferSelect;

/** La voix d'une réplique : celle du locuteur (voix seule) ou celle de son personnage (casting). */
async function voixDeReplique(r: Replique): Promise<{ id: number; code: string; fichier: string | null } | null> {
  let voixAssetId = r.voixId;
  if (voixAssetId == null && r.locuteurId != null) {
    const [f] = await db.select({ assetId: voixFiches.assetId }).from(voixFiches).where(eq(voixFiches.personnageId, r.locuteurId)).limit(1);
    voixAssetId = f?.assetId ?? null;
  }
  if (voixAssetId == null) return null;
  const [a] = await db
    .select({ id: assets.id, code: assets.code, fichier: assets.fichier })
    .from(assets)
    .where(and(eq(assets.id, voixAssetId), eq(assets.type, "voix")));
  return a ?? null;
}

/** Langue des répliques du projet, au sens du moteur : celle des dialogues du brief (« Auto » à défaut). */
async function langueDesRepliques(projectId: number): Promise<string> {
  const [b] = await db.select({ contenu: briefs.contenu }).from(briefs).where(eq(briefs.projectId, projectId));
  return langueMoteurVoix((b?.contenu as { langueDialogues?: string } | undefined)?.langueDialogues);
}

/** Pourquoi une réplique ne peut pas être générée (null = possible), avec la voix à cloner. Pur côté règles, lit la base. */
async function verifier(r: Replique): Promise<{ erreur: string } | { voix: { id: number; code: string; fichier: string } }> {
  if (!r.texte.trim()) return { erreur: "La réplique n'a pas de texte." };
  const voix = await voixDeReplique(r);
  if (!voix) return { erreur: "Cette réplique n'a pas de voix : choisis un locuteur qui a une voix au casting." };
  if (!voix.fichier) return { erreur: "Cette voix n'a pas de voix de référence à cloner : crée-la d'abord (scène « Référence »)." };
  if (!fichierMediaExiste(voix.fichier)) return { erreur: `La voix de référence est introuvable sur le stockage (${voix.fichier}).` };
  const [enFile] = await db
    .select({ id: assetGenerations.id })
    .from(assetGenerations)
    .where(and(eq(assetGenerations.repliqueId, r.id), inArray(assetGenerations.statut, ["en_attente", "en_cours"])))
    .limit(1);
  if (enFile) return { erreur: "Une prise est déjà en file pour cette réplique." };
  return { voix: { id: voix.id, code: voix.code, fichier: voix.fichier } };
}

async function lancer(r: Replique, voixId: number, temperature: number, langue: string): Promise<string> {
  const [cree] = await db
    .insert(assetGenerations)
    .values({
      assetId: voixId,
      repliqueId: r.id,
      methode: METHODE_REPLIQUE,
      prompt: r.texte,
      texteReference: r.texte,
      langueReference: langue,
      temperature,
      seed: nouvelleSeedTts(),
    })
    .returning({ uuid: assetGenerations.uuid });
  return cree!.uuid;
}

function temperatureDemandee(t: number | undefined): Resultat<{ temperature: number }> {
  const v = t ?? TEMPERATURE_VOIX_DEFAUT;
  return temperatureVoixValide(v) ? { ok: true, temperature: v } : { ok: false, erreur: `Créativité hors limites (${TEMPERATURE_VOIX_MIN} à ${TEMPERATURE_VOIX_MAX}).` };
}

/** Génère la prise d'UNE réplique. Une nouvelle seed à chaque demande : régénérer donne une autre interprétation. */
export async function genererPriseReplique(repliqueId: number, options: { temperature?: number } = {}): Promise<Resultat<{ generationUuid: string }>> {
  const temp = temperatureDemandee(options.temperature);
  if (!temp.ok) return temp;
  const [r] = await db.select().from(repliques).where(eq(repliques.id, repliqueId));
  if (!r) return { ok: false, erreur: "Cette réplique n'existe pas." };
  const v = await verifier(r);
  if ("erreur" in v) return { ok: false, erreur: v.erreur };
  const generationUuid = await lancer(r, v.voix.id, temp.temperature, await langueDesRepliques(r.projectId));
  revalidatePath("/", "layout");
  return { ok: true, generationUuid };
}

/** DOUBLE une réplique : l'utilisateur l'a jouée (`prise`, un audio, enregistré dans la cabine ou déposé), la voix de référence la
 * redit avec son intonation et son rythme (CosyVoice3, workflows/audio/VOX_Doublage_voix_API_Mode.json). Même file, même panneau des
 * tâches que les autres prises ; le résultat est posé sur la réplique et REMPLACE la prise précédente (une réplique n'a qu'une prise,
 * F01). La prise jouée est rangée sous repliques/<id>/ le temps du doublage, puis supprimée par le worker. */
export async function doublerReplique(repliqueId: number, formData: FormData): Promise<Resultat<{ generationUuid: string }>> {
  const [r] = await db.select().from(repliques).where(eq(repliques.id, repliqueId));
  if (!r) return { ok: false, erreur: "Cette réplique n'existe pas." };
  const v = await verifier(r);
  if ("erreur" in v) return { ok: false, erreur: v.erreur };

  const prise = formData.get("prise");
  if (!(prise instanceof File) || prise.size === 0) return { ok: false, erreur: "Aucune prise reçue : enregistre ou dépose ta réplique." };
  if (prise.size > TAILLE_MAX_UPLOAD_ASSET) {
    return { ok: false, erreur: `Prise trop volumineuse (${(prise.size / 1024 / 1024).toFixed(1)} Mo, max ${TAILLE_MAX_UPLOAD_ASSET / 1024 / 1024} Mo).` };
  }
  if (!estAudio(prise.name)) return { ok: false, erreur: "Fichier audio attendu (WAV ou FLAC de préférence)." };
  if ((await nbImagesEnAttente()) >= PLAFOND_FILE_IMAGES) {
    return { ok: false, erreur: `La file est pleine (${PLAFOND_FILE_IMAGES} générations en attente) : laisse le worker en vider quelques-unes.` };
  }

  const nom = `doublage_${randomUUID()}${extname(prise.name).toLowerCase()}`;
  const relatif = cheminRepliqueMedia(r.id, nom);
  await mkdir(dirname(join(MEDIA_ROOT, relatif)), { recursive: true });
  await writeFile(join(MEDIA_ROOT, relatif), Buffer.from(await prise.arrayBuffer()));

  const [cree] = await db
    .insert(assetGenerations)
    .values({
      assetId: v.voix.id,
      repliqueId: r.id,
      methode: METHODE_DOUBLAGE,
      prompt: r.texte,
      texteReference: r.texte,
      langueReference: await langueDesRepliques(r.projectId),
      seed: nouvelleSeedTts(),
      parametres: { prise: relatif },
    })
    .returning({ uuid: assetGenerations.uuid });
  revalidatePath("/", "layout");
  return { ok: true, generationUuid: cree!.uuid };
}

export type BilanPrises = { lancees: number; ignorees: { raison: string; nb: number }[] };

/** Génère les prises d'un plan : celles qui manquent, et celles devenues obsolètes (le texte a changé depuis la prise). Ne touche
 * pas aux prises à jour. Les répliques qui ne peuvent pas partir (pas de voix, voix sans référence…) sont comptées avec leur raison. */
export async function genererPrisesDuPlan(planId: number, options: { temperature?: number } = {}): Promise<Resultat<BilanPrises>> {
  const temp = temperatureDemandee(options.temperature);
  if (!temp.ok) return temp;
  const [plan] = await db.select({ projectId: plans.projectId }).from(plans).where(eq(plans.id, planId));
  if (!plan) return { ok: false, erreur: "Plan introuvable." };
  const liees = await db
    .select({ r: repliques })
    .from(planDialogues)
    .innerJoin(repliques, eq(planDialogues.repliqueId, repliques.id))
    .where(eq(planDialogues.planId, planId))
    .orderBy(planDialogues.slot);

  const langue = await langueDesRepliques(plan.projectId);
  const ignorees = new Map<string, number>();
  let lancees = 0;
  for (const { r } of liees) {
    if (r.fichier != null && !priseObsolete(r)) continue; // déjà à jour
    const v = await verifier(r);
    if ("erreur" in v) {
      ignorees.set(v.erreur, (ignorees.get(v.erreur) ?? 0) + 1);
      continue;
    }
    await lancer(r, v.voix.id, temp.temperature, langue);
    lancees += 1;
  }
  revalidatePath("/", "layout");
  return { ok: true, lancees, ignorees: [...ignorees].map(([raison, nb]) => ({ raison, nb })) };
}

/** Regénère la prise de TOUTES les répliques d'une voix qui en ont déjà une (voix de référence changée) : une génération par réplique,
 * nouvelle seed, la prise actuelle reste en place jusqu'à ce que la nouvelle arrive. Les répliques sans prise ne sont pas touchées. */
export async function genererPrisesDeLaVoix(voixId: number, options: { temperature?: number } = {}): Promise<Resultat<BilanPrises>> {
  const temp = temperatureDemandee(options.temperature);
  if (!temp.ok) return temp;
  const [voix] = await db.select({ projectId: assets.projectId }).from(assets).where(and(eq(assets.id, voixId), eq(assets.type, "voix")));
  if (!voix) return { ok: false, erreur: "Cette voix n'existe pas." };
  const avecPrise = await db.select().from(repliques).where(and(eq(repliques.projectId, voix.projectId), isNotNull(repliques.fichier)));

  const langue = await langueDesRepliques(voix.projectId);
  const ignorees = new Map<string, number>();
  let lancees = 0;
  for (const r of avecPrise) {
    if ((await voixDeReplique(r))?.id !== voixId) continue;
    const v = await verifier(r);
    if ("erreur" in v) {
      ignorees.set(v.erreur, (ignorees.get(v.erreur) ?? 0) + 1);
      continue;
    }
    await lancer(r, v.voix.id, temp.temperature, langue);
    lancees += 1;
  }
  revalidatePath("/", "layout");
  return { ok: true, lancees, ignorees: [...ignorees].map(([raison, nb]) => ({ raison, nb })) };
}
