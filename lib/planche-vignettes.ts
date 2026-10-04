import { execFile } from "node:child_process";
import { dirname, join } from "node:path";
import { partieImageJpeg, type PartieContenu } from "./llm/types";

/** Planche de vignettes d'un rendu vidéo, pour l'agent `iteration-plan`
 * (agents/skills/iteration-plan/regles.md) : la durée RÉELLE du fichier, mesurée
 * par `ffprobe` (jamais estimée — docs/FRICTIONS.md, « Direction retenue pour
 * l'agent d'itération »), et une image par seconde extraite par `ffmpeg`.
 *
 * Aucune dépendance à Next ni à la base : appelable depuis le worker comme depuis
 * une action serveur. Les commandes passent par un `Executeur` injectable, ce qui
 * rend la logique testable sans ffmpeg installé.
 *
 * Binaires : `FFMPEG_PATH` / `FFPROBE_PATH` s'ils sont renseignés ; sinon
 * `ffprobe` est cherché à côté de `FFMPEG_PATH`, puis dans le PATH. */

/** Plafond de vignettes : le plafond de durée d'un plan est 15 s (`duree_plafond_secondes`),
 * soit 15 vignettes à une par seconde. Au-delà, les instants sont répartis sur la durée. */
export const MAX_VIGNETTES = 15;
export const LARGEUR_VIGNETTE = 384;
/** Qualité JPEG ffmpeg (`-q:v`, 2 = meilleure, 31 = pire) : 5 ≈ 15–30 Ko par vignette en 384 px. */
export const QUALITE_JPEG = 5;

export type Vignette = { instantSecondes: number; imageBase64: string };
export type Planche = { dureeSecondes: number; largeur: number; vignettes: Vignette[] };

/** Lance un binaire et renvoie sa sortie standard (binaire). */
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

/** Marge de fin : un instant à moins de 0,25 s de la fin est sauté (la dernière image d'un
 * conteneur n'est pas toujours décodable pile à sa durée annoncée). */
const MARGE_FIN_SECONDES = 0.25;

/** Instants des vignettes : 0 s, 1 s, 2 s… tant qu'ils tombent DANS le fichier, hors marge
 * de fin (6,0 s → 0..5 ; 6,4 s → 0..6 ; 15,04 s → 0..14). Au-delà de `max`, `max` instants
 * régulièrement répartis sur [0, durée[ (pas = durée / max), arrondis au centième. */
export function instantsVignettes(dureeSecondes: number, max = MAX_VIGNETTES): number[] {
  if (!Number.isFinite(dureeSecondes) || dureeSecondes <= 0 || max < 1) return [];
  const parSeconde = Math.max(1, Math.ceil(dureeSecondes - MARGE_FIN_SECONDES));
  if (parSeconde <= max) return Array.from({ length: parSeconde }, (_, i) => i);
  const pas = dureeSecondes / max;
  return Array.from({ length: max }, (_, i) => arrondi(i * pas));
}

/** Étiquette lisible d'un instant, telle qu'on la cite au modèle : « 4 s », « 7,5 s ». */
export function etiquetteInstant(instantSecondes: number): string {
  return `${String(arrondi(instantSecondes)).replace(".", ",")} s`;
}

/** Nom de fichier d'une vignette, si on choisit de l'écrire sur disque (tri lexical = ordre). */
export function nomVignette(index: number, instantSecondes: number): string {
  return `vignette_${String(index).padStart(2, "0")}_${arrondi(instantSecondes).toFixed(2).replace(".", "-")}s.jpg`;
}

export function binaires(env: Record<string, string | undefined> = process.env): { ffmpeg: string; ffprobe: string } {
  const ffmpeg = env.FFMPEG_PATH?.trim() || "ffmpeg";
  const ffprobe =
    env.FFPROBE_PATH?.trim() ||
    (env.FFMPEG_PATH?.trim() ? join(dirname(ffmpeg), process.platform === "win32" ? "ffprobe.exe" : "ffprobe") : "ffprobe");
  return { ffmpeg, ffprobe };
}

/** Exécuteur réel : `execFile` sans shell (les chemins ne sont jamais interprétés). Un binaire
 * absent devient une `ErreurPlanche('introuvable')` au message actionnable. */
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

/** Durée réelle du fichier, en secondes (conteneur, `format=duration`). */
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

/** Arguments ffmpeg d'UNE vignette : `-ss` avant `-i` (recherche rapide, image exacte en
 * décodage), mise à l'échelle en largeur (hauteur paire, proportions gardées), JPEG sur stdout. */
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

/** Planche complète d'un rendu : durée mesurée, puis une vignette par instant (une commande
 * ffmpeg par vignette, en séquence : pas de rafale de processus sur la machine). */
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

/** Contenu mixte prêt pour un `MessageLlm` : un intitulé, puis chaque vignette précédée de
 * son instant (« Vignette à 4 s : »), pour que le modèle cite les instants. */
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
