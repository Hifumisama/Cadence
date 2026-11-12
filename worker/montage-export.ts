import { existsSync } from "node:fs";
import { mkdir, rename, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { eq, sql } from "drizzle-orm";
import { db } from "../db";
import { montageExports } from "../db/schema";
import { argsExport, dureeSegment, formatSortie, type SegmentExport, type SondeVideo } from "../lib/montage/montage";
import { binaires, executerProcessus } from "../lib/renders/contact-sheet";

/** Export of an episode (button « Exporter l'épisode », app/montage/actions.ts): the worker joins end to end, with ffmpeg, the segments that
 * the interface froze on click (selected renders of the montage entries, trim applied). No GPU: a separate loop in
 * worker/index.ts, which delays neither ComfyUI nor the LLM. The file is UNIQUE per episode (`montage/<episodeId>/episode.mp4`), replaced
 * at each export; it is written under a provisional name then renamed, so that an export in progress never breaks the previous one. */

/** What ffprobe reports about a file: dimensions, frame rate, duration, presence of an audio track. */
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

/** An export left « en cours » by a stopped worker goes back into the queue (called at startup). */
export async function reprendreExports(): Promise<number> {
  const r = await db.update(montageExports).set({ statut: "en_attente", startedAt: null }).where(eq(montageExports.statut, "en_cours")).returning({ id: montageExports.id });
  return r.length;
}

/** Takes the oldest pending export and encodes it. `true` if there was one. */
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
