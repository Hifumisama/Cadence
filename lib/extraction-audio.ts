import { binaires, executerProcessus, type Executeur } from "./planche-vignettes";

/** Arguments ffmpeg : la piste audio d'une vidéo en MP3 (qualité V2), sur stdout. */
export function argsExtractionAudio(video: string): string[] {
  return ["-v", "error", "-i", video, "-vn", "-c:a", "libmp3lame", "-q:a", "2", "-f", "mp3", "pipe:1"];
}

/** L'audio d'une vidéo, en MP3 (octets). Repli du master de voix tant que le workflow dédié (voix nettoyée) n'est pas là : la voix est
 * celle de la vidéo H3, non nettoyée. Lève si ffmpeg manque, échoue ou si la vidéo n'a pas de piste audio. */
export async function extraireAudioDeVideo(video: string, executer: Executeur = executerProcessus, env: Record<string, string | undefined> = process.env): Promise<Buffer> {
  const mp3 = await executer(binaires(env).ffmpeg, argsExtractionAudio(video));
  if (mp3.length === 0) throw new Error(`ffmpeg n'a extrait aucun audio de ${video} (pas de piste audio ?).`);
  return mp3;
}
