import { binaires, executerProcessus, type Executeur } from "../renders/contact-sheet";

/** ffmpeg arguments: the audio track of a video as MP3 (quality V2), on stdout. */
export function argsExtractionAudio(video: string): string[] {
  return ["-v", "error", "-i", video, "-vn", "-c:a", "libmp3lame", "-q:a", "2", "-f", "mp3", "pipe:1"];
}

/** A video's audio, as MP3 (bytes). Fallback of the voice master until the dedicated workflow (cleaned voice) is there: the voice is
 * that of the H3 video, uncleaned. Throws if ffmpeg is missing, fails, or if the video has no audio track. */
export async function extraireAudioDeVideo(video: string, executer: Executeur = executerProcessus, env: Record<string, string | undefined> = process.env): Promise<Buffer> {
  const mp3 = await executer(binaires(env).ffmpeg, argsExtractionAudio(video));
  if (mp3.length === 0) throw new Error(`ffmpeg n'a extrait aucun audio de ${video} (pas de piste audio ?).`);
  return mp3;
}
