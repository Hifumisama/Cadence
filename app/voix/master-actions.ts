"use server";

import { db } from "@/db";
import { assetGenerations, assets } from "@/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { unlink } from "node:fs/promises";
import { DUREE_TEST_VIDEO_SECONDES, METHODE_MASTER_VOIX, nouvelleSeed } from "@/lib/asset-generation";
import { langueDesDialogues } from "@/lib/langue-dialogues";
import { MEDIA_ROOT, cheminAssetMedia, cheminVoixMedia, estImage, fichierMediaExiste } from "@/lib/media";
import { nbImagesEnAttente, rangDansLaFile } from "@/lib/queries-taches";
import { PLAFOND_FILE_IMAGES } from "@/lib/taches";
import { promptMasterVoix } from "@/lib/voix";
import { ecrireRepliqueEcoute } from "@/lib/replique-ecoute";
import { modeleParDefautEffectif } from "@/lib/llm/modele-choisi";

// Master de voix d'un PERSONNAGE (chantier voix/master, 2026-10-14). La voix est un champ du personnage : une description libre (le
// timbre voulu, ou rien : le modèle choisit), la réplique du test, puis le master — l'audio nettoyé issu d'une vidéo de test H3
// (workflow dédié, worker/comfyui/masterMapping.ts). Le résultat est un candidat, adopté par `adopterGeneration`
// (app/assets/generation-actions.ts) ; jamais bloquant pour la suite : un personnage sans master a la voix que le modèle vidéo invente.

type Resultat<T = object> = ({ ok: true } & T) | { ok: false; erreur: string };

const FILE_PLEINE = "La file des tâches est pleine : attends qu'une tâche se termine.";

async function exigerPersonnage(id: number) {
  const [a] = await db.select().from(assets).where(and(eq(assets.id, id), eq(assets.type, "personnage")));
  if (!a) throw new Error("Ce personnage n'existe pas.");
  return a;
}

/** Retient la voix voulue et la réplique du test sur le personnage (sans rien lancer) : elles restent là pour la prochaine fois. */
export async function enregistrerVoixPersonnage(personnageId: number, v: { description: string; repliqueBase: string }): Promise<Resultat> {
  await exigerPersonnage(personnageId);
  await db
    .update(assets)
    .set({ voixDescription: v.description.trim() || null, voixRepliqueBase: v.repliqueBase.trim() || null })
    .where(eq(assets.id, personnageId));
  revalidatePath("/", "layout");
  return { ok: true };
}

/** Lance la vidéo de test qui produira le master. Sans image de personnage (voix off), le modèle invente un visage d'après la voix : sans
 * importance pour la voix finale. La demande est un candidat de `asset_generations` (méthode « master_voix », assetId = le personnage). */
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

/** Retire le master du personnage (il redevient sans voix fixée : le modèle vidéo invente). Les fichiers partent avec. */
export async function supprimerMasterVoix(personnageId: number): Promise<Resultat> {
  const perso = await exigerPersonnage(personnageId);
  for (const f of [perso.voixMaster, perso.voixVideo]) {
    if (f) await unlink(`${MEDIA_ROOT}/${cheminVoixMedia(personnageId, f)}`).catch(() => undefined);
  }
  await db.update(assets).set({ voixMaster: null, voixVideo: null, voixMasterAt: null }).where(eq(assets.id, personnageId));
  revalidatePath("/", "layout");
  return { ok: true };
}

/** Propose la réplique du test (deux ou trois phrases dans la langue du projet, au caractère du personnage, avec la voix voulue en
 * contexte). N'écrit rien en base : le texte se relit et se corrige avant de partir. Même rédacteur que la réplique d'écoute. */
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
