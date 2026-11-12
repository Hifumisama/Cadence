import { execFile } from "node:child_process";
import { dirname, join } from "node:path";
import { partieImageJpeg, type PartieContenu } from "../llm/types";

/** Contact sheet of a video render, for the `iteration-plan` agent
 * (agents/skills/iteration-plan/SKILL.md): the REAL duration of the file, measured
 * by `ffprobe` (never estimated — docs/FRICTIONS.md, « Direction retenue pour
 * l'agent d'itération »), and one image per second extracted by `ffmpeg`.
 *
 * No dependency on Next nor on the database: callable from the worker as well as
 * from a server action. Commands go through an injectable `Executeur`, which makes
 * the logic testable without ffmpeg installed.
 *
 * Binaries: `FFMPEG_PATH` / `FFPROBE_PATH` if they are set; otherwise
 * `ffprobe` is looked up next to `FFMPEG_PATH`, then on the PATH. */

/** Thumbnail cap: a clip's duration cap is 15 s (`duree_plafond_secondes`),
 * i.e. 15 thumbnails at one per second. Beyond that, the instants are spread over the duration. */
const MAX_VIGNETTES = 15;
const LARGEUR_VIGNETTE = 384;
/** ffmpeg JPEG quality (`-q:v`, 2 = best, 31 = worst): 5 ≈ 15–30 KB per thumbnail at 384 px. */
const QUALITE_JPEG = 5;

type Vignette = { instantSecondes: number; imageBase64: string };
export type Planche = { dureeSecondes: number; largeur: number; vignettes: Vignette[] };

/** Runs a binary and returns its standard output (binary). */
export type Executeur = (binaire: string, args: string[]) => Promise<Buffer>;

export type OptionsPlanche = {
  max?: number;
  largeur?: number;
  qualite?: number;
  env?: Record<string, string | undefined>;
  executer?: Executeur;
};

export class ErreurPlanche extends Error {
  constructor(
    readonly code: "introuvable" | "duree_illisible" | "extraction",
    message: string,
  ) {
    super(message);
    this.name = "ErreurPlanche";
  }
}

const arrondi = (n: number) => Math.round(n * 100) / 100;

/** End margin: an instant less than 0.25 s from the end is skipped (the last image of a
 * container is not always decodable right at its announced duration). */
const MARGE_FIN_SECONDES = 0.25;

/** Thumbnail instants: 0 s, 1 s, 2 s… as long as they fall WITHIN the file, outside the end margin
 * (6.0 s → 0..5; 6.4 s → 0..6; 15.04 s → 0..14). Beyond `max`, `max` instants
 * evenly spread over [0, duration[ (step = duration / max), rounded to the hundredth. */
export function instantsVignettes(dureeSecondes: number, max = MAX_VIGNETTES): number[] {
  if (!Number.isFinite(dureeSecondes) || dureeSecondes <= 0 || max < 1) return [];
  const parSeconde = Math.max(1, Math.ceil(dureeSecondes - MARGE_FIN_SECONDES));
  if (parSeconde <= max) return Array.from({ length: parSeconde }, (_, i) => i);
  const pas = dureeSecondes / max;
  return Array.from({ length: max }, (_, i) => arrondi(i * pas));
}

/** Readable label of an instant, as it is cited to the model: « 4 s », « 7,5 s ». */
function etiquetteInstant(instantSecondes: number): string {
  return `${String(arrondi(instantSecondes)).replace(".", ",")} s`;
}

export function binaires(env: Record<string, string | undefined> = process.env): { ffmpeg: string; ffprobe: string } {
  const ffmpeg = env.FFMPEG_PATH?.trim() || "ffmpeg";
  const ffprobe =
    env.FFPROBE_PATH?.trim() ||
    (env.FFMPEG_PATH?.trim() ? join(dirname(ffmpeg), process.platform === "win32" ? "ffprobe.exe" : "ffprobe") : "ffprobe");
  return { ffmpeg, ffprobe };
}

/** Real executor: `execFile` without a shell (paths are never interpreted). A missing binary
 * becomes an `ErreurPlanche('introuvable')` with an actionable message. */
export const executerProcessus: Executeur = (binaire, args) =>
  new Promise((ok, ko) => {
    execFile(binaire, args, { encoding: "buffer", maxBuffer: 64 * 1024 * 1024, windowsHide: true }, (err, stdout, stderr) => {
      if (!err) return ok(stdout);
      const outil = /ffprobe/i.test(binaire) ? "ffprobe" : "ffmpeg";
      const variable = outil === "ffprobe" ? "FFPROBE_PATH (ou FFMPEG_PATH)" : "FFMPEG_PATH";
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        return ko(new ErreurPlanche("introuvable", `${outil} introuvable (« ${binaire} ») : installe-le ou renseigne ${variable}.`));
      }
      const detail = Buffer.isBuffer(stderr) ? stderr.toString("utf8").trim().split(/\r?\n/).slice(-3).join(" | ") : "";
      ko(new ErreurPlanche("extraction", `${outil} a échoué : ${detail || err.message}`));
    });
  });

/** The file's real duration, in seconds (container, `format=duration`). */
export async function mesurerDuree(chemin: string, options: OptionsPlanche = {}): Promise<number> {
  const executer = options.executer ?? executerProcessus;
  const { ffprobe } = binaires(options.env);
  const sortie = await executer(ffprobe, ["-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", chemin]);
  const duree = Number(sortie.toString("utf8").trim());
  if (!Number.isFinite(duree) || duree <= 0) {
    throw new ErreurPlanche("duree_illisible", `Durée illisible pour ${chemin} (ffprobe a répondu « ${sortie.toString("utf8").trim().slice(0, 80)} »).`);
  }
  return duree;
}

/** ffmpeg arguments for ONE thumbnail: `-ss` before `-i` (fast seek, exact image on
 * decoding), scaling to the width (even height, proportions kept), JPEG on stdout. */
export function argsVignette(chemin: string, instantSecondes: number, largeur = LARGEUR_VIGNETTE, qualite = QUALITE_JPEG): string[] {
  return [
    "-v", "error",
    "-ss", String(instantSecondes),
    "-i", chemin,
    "-frames:v", "1",
    "-vf", `scale=${largeur}:-2`,
    "-q:v", String(qualite),
    "-f", "image2pipe",
    "-vcodec", "mjpeg",
    "pipe:1",
  ];
}

/** Complete contact sheet of a render: measured duration, then one thumbnail per instant (one
 * ffmpeg command per thumbnail, in sequence: no burst of processes on the machine). */
export async function extrairePlanche(chemin: string, options: OptionsPlanche = {}): Promise<Planche> {
  const executer = options.executer ?? executerProcessus;
  const largeur = options.largeur ?? LARGEUR_VIGNETTE;
  const { ffmpeg } = binaires(options.env);
  const dureeSecondes = await mesurerDuree(chemin, options);
  const vignettes: Vignette[] = [];
  for (const instantSecondes of instantsVignettes(dureeSecondes, options.max ?? MAX_VIGNETTES)) {
    const jpeg = await executer(ffmpeg, argsVignette(chemin, instantSecondes, largeur, options.qualite ?? QUALITE_JPEG));
    if (jpeg.length === 0) throw new ErreurPlanche("extraction", `ffmpeg n'a produit aucune image à ${etiquetteInstant(instantSecondes)} (${chemin}).`);
    vignettes.push({ instantSecondes, imageBase64: jpeg.toString("base64") });
  }
  return { dureeSecondes, largeur, vignettes };
}

/** Mixed content ready for a `MessageLlm`: a caption, then each thumbnail preceded by
 * its instant (« Vignette à 4 s : »), so that the model cites the instants. */
export function contenuPlanche(planche: Planche, intitule?: string): PartieContenu[] {
  const entete =
    intitule ??
    `Planche de vignettes du rendu (durée réelle du fichier : ${etiquetteInstant(arrondi(planche.dureeSecondes))}, ${planche.vignettes.length} vignettes) :`;
  return [
    { type: "text", text: entete },
    ...planche.vignettes.flatMap((v): PartieContenu[] => [
      { type: "text", text: `Vignette à ${etiquetteInstant(v.instantSecondes)} :` },
      partieImageJpeg(v.imageBase64),
    ]),
  ];
}
