import { existsSync } from "node:fs";
import { mkdir, rename, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { eq, sql } from "drizzle-orm";
import { db } from "../db";
import { montageExports } from "../db/schema";
import { argsExport, dureeSegment, formatSortie, type SegmentExport, type SondeVideo } from "../lib/montage/montage";
import { binaires, executerProcessus } from "../lib/planche-vignettes";

/** Export d'un épisode (bouton « Exporter l'épisode », app/montage/actions.ts) : le worker met bout à bout, avec ffmpeg, les segments que
 * l'interface a figés au clic (rendus retenus des entrées du montage, rognage appliqué). Aucun GPU : une boucle à part dans
 * worker/index.ts, qui ne retarde ni ComfyUI ni le LLM. Le fichier est UNIQUE par épisode (`montage/<episodeId>/episode.mp4`), remplacé
 * à chaque export ; il est écrit sous un nom provisoire puis renommé, pour qu'un export en cours ne casse jamais le précédent. */

/** Ce que ffprobe dit d'un fichier : dimensions, cadence, durée, présence d'une piste son. */
async function sonder(chemin: string): Promise<SondeVideo> {
  const { ffprobe } = binaires();
  const brut = await executerProcessus(ffprobe, ["-v", "error", "-show_entries", "stream=codec_type,width,height,r_frame_rate:format=duration", "-of", "json", chemin]);
  const json = JSON.parse(brut.toString("utf8")) as { streams?: { codec_type?: string; width?: number; height?: number; r_frame_rate?: string }[]; format?: { duration?: string } };
  const video = json.streams?.find((s) => s.codec_type === "video");
  const [n, d] = (video?.r_frame_rate ?? "24/1").split("/").map(Number);
  return {
    largeur: video?.width ?? 0,
    hauteur: video?.height ?? 0,
    fps: n && d ? n / d : 24,
    duree: Number(json.format?.duration ?? 0),
    audio: !!json.streams?.some((s) => s.codec_type === "audio"),
  };
}

/** Un export laissé « en cours » par un worker arrêté repart en file (appelé au démarrage). */
export async function reprendreExports(): Promise<number> {
  const r = await db.update(montageExports).set({ statut: "en_attente", startedAt: null }).where(eq(montageExports.statut, "en_cours")).returning({ id: montageExports.id });
  return r.length;
}

/** Prend le plus ancien export en attente et l'encode. `true` s'il y en avait un. */
export async function traiterProchainExport(mediaRoot: string): Promise<boolean> {
  const pris = await db.execute<{ id: number }>(sql`
    update montage_exports set statut = 'en_cours', started_at = now()
    where id = (select id from montage_exports where statut = 'en_attente' order by id limit 1 for update skip locked)
    returning id`);
  const id = (pris as unknown as { id: number }[])[0]?.id;
  if (id == null) return false;
  const [exp] = await db.select().from(montageExports).where(eq(montageExports.id, id));
  if (!exp) return false;

  const relatif = `montage/${exp.episodeId}/episode.mp4`;
  const sortie = join(mediaRoot, relatif);
  const provisoire = join(mediaRoot, `montage/${exp.episodeId}/episode.${exp.id}.encodage.mp4`);
  try {
    const segments = (exp.segments ?? []) as SegmentExport[];
    const lisibles: { chemin: string; debut: number; duree: number; audio: boolean; sonde: SondeVideo }[] = [];
    let manquants = 0;
    for (const s of segments) {
      const chemin = join(mediaRoot, s.chemin);
      if (!existsSync(chemin)) {
        manquants++;
        continue;
      }
      const sonde = await sonder(chemin);
      const duree = dureeSegment(s, sonde.duree);
      if (duree <= 0) {
        manquants++;
        continue;
      }
      lisibles.push({ chemin, debut: s.debut, duree, audio: sonde.audio, sonde });
    }
    if (lisibles.length === 0) throw new Error("Aucun des fichiers à exporter n'est lisible sur le disque.");
    await mkdir(dirname(sortie), { recursive: true });
    const { ffmpeg } = binaires();
    await executerProcessus(ffmpeg, argsExport(lisibles, formatSortie(lisibles.map((l) => l.sonde)), provisoire));
    await rename(provisoire, sortie);
    await db
      .update(montageExports)
      .set({
        statut: "termine",
        fichier: relatif,
        dureeSecondes: lisibles.reduce((t, l) => t + l.duree, 0),
        nbIgnores: exp.nbIgnores + manquants,
        finishedAt: new Date(),
        erreur: null,
      })
      .where(eq(montageExports.id, exp.id));
    console.log(`[worker] Export de l'épisode ${exp.episodeId} : ${lisibles.length} segment(s) → ${relatif}`);
  } catch (err) {
    await rm(provisoire, { force: true }).catch(() => undefined);
    const message = err instanceof Error ? err.message : String(err);
    await db.update(montageExports).set({ statut: "echoue", erreur: message.slice(0, 2000), finishedAt: new Date() }).where(eq(montageExports.id, exp.id));
    console.error(`[worker] Export de l'épisode ${exp.episodeId} impossible :`, message);
  }
  return true;
}
