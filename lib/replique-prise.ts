import { readFile, unlink } from "node:fs/promises";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { repliques } from "../db/schema";
import { cheminRepliqueMedia } from "./media";
import { mesurerDureeAudio } from "./repliques";

/** Pose une prise GÉNÉRÉE sur sa réplique. Le fichier est déjà dans `repliques/<id>/<nom>` (le worker l'y a récupéré de ComfyUI) ;
 * ici on met la réplique à jour comme pour une prise déposée à la main (`uploaderPriseReplique`) : le fichier, le texte dit (pour
 * repérer une prise devenue obsolète si le texte change ensuite), la durée MESURÉE (jamais estimée : un format non mesurable, MP3, la
 * laisse vide), le statut « prise posée ». Une nouvelle prise remplace l'ancienne (pas de versionnage, F01) ; une prise validée
 * redevient « posée » : la nouvelle n'a pas été écoutée. Si la réplique a été supprimée entre-temps, le fichier est retiré. */
export async function poserPriseGeneree(
  repliqueId: number,
  nom: string,
  texteDit: string,
  mediaRoot: string,
): Promise<{ ok: true; dureeSecondes: number | null } | { ok: false; erreur: string }> {
  const chemin = join(mediaRoot, cheminRepliqueMedia(repliqueId, nom));
  const [r] = await db.select().from(repliques).where(eq(repliques.id, repliqueId));
  if (!r) {
    await unlink(chemin).catch(() => undefined);
    return { ok: false, erreur: "La réplique a été supprimée pendant la génération." };
  }
  const octets = new Uint8Array(await readFile(chemin));
  const dureeSecondes = mesurerDureeAudio(octets, nom);
  await db
    .update(repliques)
    .set({ fichier: nom, fichierTexte: texteDit, dureeSecondes, statut: "prise_posee", updatedAt: new Date() })
    .where(eq(repliques.id, repliqueId));
  if (r.fichier && r.fichier !== nom) await unlink(join(mediaRoot, cheminRepliqueMedia(repliqueId, r.fichier))).catch(() => undefined);
  return { ok: true, dureeSecondes };
}
