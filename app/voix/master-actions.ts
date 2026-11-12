"use server";

import { db } from "@/db";
import { assetGenerations, assets } from "@/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { unlink } from "node:fs/promises";
import { DUREE_TEST_VIDEO_SECONDES, METHODE_MASTER_VOIX, nouvelleSeed } from "@/lib/assets/asset-generation";
import { langueDesDialogues } from "@/lib/voice/language-dialogues";
import { MEDIA_ROOT, cheminAssetMedia, cheminVoixMedia, estImage, fichierMediaExiste } from "@/lib/media";
import { nbImagesEnAttente, rangDansLaFile } from "@/lib/tasks/queries-tasks";
import { PLAFOND_FILE_IMAGES } from "@/lib/tasks/tasks";
import { promptMasterVoix } from "@/lib/voice/voice";
import { ecrireRepliqueEcoute } from "@/lib/voice/listening-line";
import { modeleParDefautEffectif } from "@/lib/llm/model-chosen";

// Voice master of a CHARACTER (voice/master workstream, 2026-10-14). The voice is a field of the character: a free description (the
// wanted timbre, or nothing: the model chooses), the test line, then the master — the cleaned audio taken from an H3 test
// video (dedicated workflow, worker/comfyui/masterMapping.ts). The result is a candidate, adopted by `adopterGeneration`
// (app/assets/generation-actions.ts); never blocking for what follows: a character without a master has the voice the video model invents.

type Resultat<T = object> = ({ ok: true } & T) | { ok: false; erreur: string };

const FILE_PLEINE = "La file des tâches est pleine : attends qu'une tâche se termine.";

async function exigerPersonnage(id: number) {
  const [a] = await db.select().from(assets).where(and(eq(assets.id, id), eq(assets.type, "personnage")));
  if (!a) throw new Error("Ce personnage n'existe pas.");
  return a;
}

/** Stores the wanted voice and the test line on the character (without launching anything): they stay there for next time. */
export async function enregistrerVoixPersonnage(personnageId: number, v: { description: string; repliqueBase: string }): Promise<Resultat> {
  await exigerPersonnage(personnageId);
  await db
    .update(assets)
    .set({ voixDescription: v.description.trim() || null, voixRepliqueBase: v.repliqueBase.trim() || null })
    .where(eq(assets.id, personnageId));
  revalidatePath("/", "layout");
  return { ok: true };
}

/** Launches the test video that will produce the master. Without a character image (voice-over), the model invents a face from the voice: of no
 * importance for the final voice. The request is a candidate of `asset_generations` (method « master_voix », assetId = the character). */
export async function lancerMasterVoix(
  personnageId: number,
  v: { description: string; repliqueBase: string },
): Promise<Resultat<{ position: number }>> {
  const perso = await exigerPersonnage(personnageId);
  const repliqueBase = v.repliqueBase.trim();
  if (!repliqueBase) return { ok: false, erreur: "Écris la réplique que dira la voix pour le test." };
  const description = v.description.trim();

  const image = perso.fichier && estImage(perso.fichier) && fichierMediaExiste(perso.fichier) ? cheminAssetMedia(perso.fichier) : null;

  const [enFile] = await db
    .select({ id: assetGenerations.id })
    .from(assetGenerations)
    .where(and(eq(assetGenerations.assetId, personnageId), eq(assetGenerations.methode, METHODE_MASTER_VOIX), inArray(assetGenerations.statut, ["en_attente", "en_cours"])))
    .limit(1);
  if (enFile) return { ok: false, erreur: "Un master est déjà en file pour ce personnage." };
  if ((await nbImagesEnAttente()) >= PLAFOND_FILE_IMAGES) return { ok: false, erreur: FILE_PLEINE };

  await db.update(assets).set({ voixDescription: description || null, voixRepliqueBase: repliqueBase }).where(eq(assets.id, personnageId));

  const prompt = promptMasterVoix({
    texte: repliqueBase,
    personnage: image ? { code: perso.code, description: perso.description } : null,
    dureeSecondes: DUREE_TEST_VIDEO_SECONDES,
    langue: await langueDesDialogues(perso.projectId),
    voix: description || null,
  });
  const [gen] = await db
    .insert(assetGenerations)
    .values({
      assetId: personnageId,
      methode: METHODE_MASTER_VOIX,
      prompt,
      texteReference: repliqueBase,
      dureeSecondes: DUREE_TEST_VIDEO_SECONDES,
      seed: nouvelleSeed(),
      parametres: { personnage: image },
    })
    .returning({ id: assetGenerations.id });
  revalidatePath("/", "layout");
  return { ok: true, position: await rangDansLaFile(gen!.id) };
}

/** Removes the character's master (it goes back to having no fixed voice: the video model invents). The files go with it. */
export async function supprimerMasterVoix(personnageId: number): Promise<Resultat> {
  const perso = await exigerPersonnage(personnageId);
  for (const f of [perso.voixMaster, perso.voixVideo]) {
    if (f) await unlink(`${MEDIA_ROOT}/${cheminVoixMedia(personnageId, f)}`).catch(() => undefined);
  }
  await db.update(assets).set({ voixMaster: null, voixVideo: null, voixMasterAt: null }).where(eq(assets.id, personnageId));
  revalidatePath("/", "layout");
  return { ok: true };
}

/** Proposes the test line (two or three sentences in the project's language, in the character's personality, with the wanted voice as
 * context). Writes nothing to the database: the text is reread and corrected before it is sent. Same writer as the listening line. */
export async function proposerRepliqueBase(
  personnageId: number,
  description: string,
): Promise<Resultat<{ texte: string; source: "modele" | "repli" }>> {
  const perso = await exigerPersonnage(personnageId);
  try {
    const r = await ecrireRepliqueEcoute(
      {
        langue: await langueDesDialogues(perso.projectId),
        caractere: perso.description?.trim() ? `${perso.code} : ${perso.description.trim()}` : null,
        instruction: description.trim() || null,
        role: perso.description?.trim() ? null : perso.code,
      },
      { modele: await modeleParDefautEffectif() },
    );
    return { ok: true, texte: r.texte, source: r.source };
  } catch (e) {
    return { ok: false, erreur: (e as Error).message };
  }
}
