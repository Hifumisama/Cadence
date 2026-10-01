import { unlink } from "node:fs/promises";
import { join } from "node:path";
import { and, eq } from "drizzle-orm";
import { db } from "../db";
import { assetGenerations, jobs } from "../db/schema";
import { cheminGenerationMedia } from "../lib/media";

// Reprise au démarrage du worker : ce qui était « en cours » appartenait à un
// worker mort (arrêt, plantage, ou simple redémarrage de `tsx watch`, qui relance
// le worker à chaque sauvegarde d'un fichier importé). Sans cette reprise, ces
// lignes restent « en cours » pour toujours et l'écran tourne indéfiniment.
//
// - Image `en_cours` → `echoue` (« Interrompue (worker redémarré) »). Pas de rejeu
//   automatique : même règle que pour tout échec d'image, l'utilisateur relance.
// - Vidéo `en_cours` → `en_attente`, sans consommer de tentative (F04 : une
//   interruption n'est pas un échec de rendu). Le statut du plan n'est pas touché :
//   le job le repasse « en cours » en repartant, comme après une indisponibilité.
//
// L'opération est idempotente (ne touche que ce qui est « en cours ») et rapide :
// deux UPDATE et quelques suppressions de fichiers d'aperçu.
//
// PIÈGE : on suppose UN SEUL worker sur la base. Si un second worker tourne
// (ex. un conteneur oublié), ses tâches en cours seraient reprises à tort.
// DOUBLON POSSIBLE : si ComfyUI exécute encore le prompt de la tâche reprise, une
// vidéo remise en file sera soumise une seconde fois (GPU occupé pour rien).
// V2 (non codée) : retrouver la tâche par `comfyui_prompt_id` — /history s'il est
// fini (on récupère le résultat), /queue s'il tourne encore (on se rattache au
// suivi) — avant de décider.

export const ERREUR_INTERROMPUE = "Interrompue (worker redémarré)";

/** Chemins (relatifs à MEDIA_ROOT) des fichiers d'aperçu laissés par une
 * génération interrompue : le fichier en cours d'écriture n'est jamais le résultat
 * (`fichier` n'est renseigné qu'à la fin), seul l'aperçu traîne. */
export function fichiersOrphelins(g: { assetId: number; apercuFichier: string | null }): string[] {
  return g.apercuFichier ? [cheminGenerationMedia(g.assetId, g.apercuFichier)] : [];
}

export async function reprendreOrphelines(mediaRoot: string): Promise<{ images: number; videos: number }> {
  const images = await db.select().from(assetGenerations).where(eq(assetGenerations.statut, "en_cours"));
  for (const g of images) {
    await db
      .update(assetGenerations)
      .set({
        statut: "echoue",
        erreur: ERREUR_INTERROMPUE,
        finishedAt: new Date(),
        progressionValeur: null,
        progressionMax: null,
        etapeLibelle: null,
        apercuFichier: null,
        apercuAt: null,
      })
      // Garde : si elle a été terminée entre-temps, on n'y touche pas.
      .where(and(eq(assetGenerations.id, g.id), eq(assetGenerations.statut, "en_cours")));
    for (const relatif of fichiersOrphelins(g)) {
      await unlink(join(mediaRoot, relatif)).catch(() => undefined);
    }
  }

  const videos = await db
    .update(jobs)
    .set({ statut: "en_attente", startedAt: null })
    .where(eq(jobs.statut, "en_cours"))
    .returning({ id: jobs.id });

  return { images: images.length, videos: videos.length };
}
