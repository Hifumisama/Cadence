import { binaires, executerProcessus, mesurerDuree, type OptionsPlanche } from "../renders/contact-sheet";
import type { PromptSection } from "./clip-checks";

/** Continuity image (2026-10-14): when a clip is in « suite » link (lib/clips/clip-link.ts), the LAST image of the previous clip's render is attached
 * to the generation as `<Picture N>` = first frame of the first shot (H3 format, `keyframe completion`). It is EPHEMERAL: extracted at each
 * generation (never in the asset registry, where it would be stale as soon as a clip changes), and the sheet's prompt is not modified: the code
 * adds the lines that declare it to the SUBMITTED prompt only (`jobs.prompt_utilise` keeps that of the sheet; `jobs.raccord_job_id` keeps
 * the attempt the image comes from). Pure except `extraireDerniereImage`. */

export const MAX_REFS_VISUELLES = 6;

/** The clip cannot receive its continuity for lack of room: its visual refs (images + videos) are already at the ceiling. */
export const raccordSansPlace = (nbRefsVisuelles: number): boolean => nbRefsVisuelles >= MAX_REFS_VISUELLES;

/** The smallest free `<Picture N>` slot (1 to 6), or null if the visual refs (images + videos) are already at the ceiling. */
export function emplacementLibre(slotsImage: number[], nbVideos: number): number | null {
  if (slotsImage.length + nbVideos >= MAX_REFS_VISUELLES) return null;
  for (let n = 1; n <= MAX_REFS_VISUELLES; n++) if (!slotsImage.includes(n)) return n;
  return null;
}

const LIGNE_DEFINITION = (n: number) =>
  `<Picture ${n}> is the first frame of [Shot 1]: the last image of the previous plan, which this plan continues (same place, same positions, same light).`;
const LIGNE_RETENTION = (n: number) =>
  `<Picture ${n}> ([Shot 1] first frame): fully_preserved - The composition, the positions and poses of the characters, their facial expression (eyes open or closed, gaze) and the light of this image are retained at the start of [Shot 1]; the action then goes on from there.`;

const ajouterLigne = (contenu: string, ligne: string) => (contenu.trim() ? `${contenu.trimEnd()}\n${ligne}` : ligne);

/** `[reference generation]` → `[reference generation + keyframe completion]` (types combined with « + », without repetition). */
function ajouterTypeKeyframe(summary: string): string {
  const m = /^\s*\[([^\]]*)\]/.exec(summary);
  if (!m) return `[keyframe completion] ${summary.trim()}`.trim();
  if (/keyframe completion/i.test(m[1]!)) return summary;
  return summary.replace(m[0], `[${m[1]!.trim()} + keyframe completion]`);
}

/** The sections of the SUBMITTED prompt: those of the sheet, plus the declaration of the continuity image (definition, retention, task type). Without effect if
 * the sheet already declares a first frame for shot 1. */
export function sectionsAvecRaccord(sections: PromptSection[], slot: number): PromptSection[] {
  const tout = sections.map((s) => s.contenu).join("\n");
  if (/is the first frame of \[Shot 1\]/i.test(tout)) return sections;
  const noms = new Set(sections.map((s) => s.section));
  const avec = sections.map((s) => {
    if (s.section === "subject_definitions") return { ...s, contenu: ajouterLigne(s.contenu, LIGNE_DEFINITION(slot)) };
    if (s.section === "retention_analysis") return { ...s, contenu: ajouterLigne(s.contenu, LIGNE_RETENTION(slot)) };
    if (s.section === "summary") return { ...s, contenu: ajouterTypeKeyframe(s.contenu) };
    return s;
  });
  // A sheet without one of these sections: it is added, the image must always be declared.
  const manquantes: PromptSection[] = [];
  if (!noms.has("subject_definitions")) manquantes.push({ section: "subject_definitions", contenu: LIGNE_DEFINITION(slot) });
  if (!noms.has("retention_analysis")) manquantes.push({ section: "retention_analysis", contenu: LIGNE_RETENTION(slot) });
  return [...avec, ...manquantes];
}

/** Margin before the end of the file where the image is taken: the very last instant may be empty depending on the container. */
const MARGE_FIN_SECONDES = 0.1;

/** ffmpeg arguments: the file's last image, as PNG on stdout. */
export function argsDerniereImage(chemin: string, dureeSecondes: number): string[] {
  const instant = Math.max(0, dureeSecondes - MARGE_FIN_SECONDES);
  return ["-v", "error", "-ss", String(instant), "-i", chemin, "-frames:v", "1", "-f", "image2pipe", "-vcodec", "png", "pipe:1"];
}

/** A video's last image, as PNG (bytes). Throws `ErreurPlanche` if ffmpeg/ffprobe are missing or fail. */
export async function extraireDerniereImage(chemin: string, options: OptionsPlanche = {}): Promise<Buffer> {
  const executer = options.executer ?? executerProcessus;
  const dureeSecondes = await mesurerDuree(chemin, options);
  const { ffmpeg } = binaires(options.env);
  const png = await executer(ffmpeg, argsDerniereImage(chemin, dureeSecondes));
  if (png.length === 0) throw new Error(`ffmpeg n'a produit aucune image à la fin de ${chemin}.`);
  return png;
}

/** What an attempt's page says about its continuity (null = nothing to say). `utilise`: the attempt of the previous clip whose image this attempt took (`jobs.raccord_job_id`);
 * `actuel`: the attempt whose image would be taken now (`raccordActuel`, lib/clips/queries-continuity.ts). `perime`: the previous clip has changed since. */
export function etatRaccord(args: {
  liaison: string;
  utilise: number | null;
  actuel: { id: number; numeroRendu: number } | null;
  precedentTitre: string | null;
  /** Visual refs (images + videos) that the clip now declares: at the ceiling, the continuity has no slot. */
  refsVisuelles?: number;
}): { texte: string; perime: boolean } | null {
  const { liaison, utilise, actuel, precedentTitre, refsVisuelles } = args;
  const plan = precedentTitre ? `« ${precedentTitre} »` : "le plan précédent";
  if (utilise != null) {
    if (actuel && actuel.id === utilise) return { texte: `Raccord : cet essai part de la dernière image de l'essai n°${actuel.numeroRendu} de ${plan}.`, perime: false };
    return {
      texte: `Raccord périmé : cet essai part de la dernière image d'un ancien rendu de ${plan}${actuel ? ` (son rendu à prendre est maintenant l'essai n°${actuel.numeroRendu})` : ""}. Relance ce plan pour reprendre la dernière image actuelle.`,
      perime: true,
    };
  }
  if (liaison === "suite" && actuel && refsVisuelles != null && raccordSansPlace(refsVisuelles)) {
    return {
      texte: `Pas d'image de raccord : le plan enchaîne sur ${plan}, mais ses ${refsVisuelles} références occupent tous les emplacements. Retire une référence puis relance : la dernière image du précédent sera alors reprise.`,
      perime: true,
    };
  }
  if (liaison === "suite" && actuel) {
    return { texte: `Cet essai n'a pas d'image de raccord alors que le plan enchaîne sur ${plan} : une nouvelle génération prendra la dernière image de son essai n°${actuel.numeroRendu}.`, perime: false };
  }
  return null;
}
