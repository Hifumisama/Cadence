import { binaires, executerProcessus, mesurerDuree, type OptionsPlanche } from "./planche-vignettes";
import type { PromptSection } from "./plan-checks";

/** Image de raccord (2026-10-14) : quand un plan est en liaison « suite » (lib/plan-liaison.ts), la DERNIÈRE image du rendu du plan précédent est jointe
 * à la génération comme `<Picture N>` = première image du premier shot (format H3, `keyframe completion`). Elle est ÉPHÉMÈRE : extraite à chaque
 * génération (jamais au registre d'assets, où elle serait périmée dès qu'un plan change), et le prompt de la fiche n'est pas modifié : le code
 * ajoute les lignes qui la déclarent au prompt SOUMIS seulement (`jobs.prompt_utilise` garde celui de la fiche ; `jobs.raccord_job_id` garde
 * l'essai d'où l'image vient). Pur sauf `extraireDerniereImage`. */

export const MAX_REFS_VISUELLES = 6;
/** Références visuelles qu'un plan « suite » peut déclarer : un emplacement reste pour l'image de raccord (plan-h3 le réserve, 2026-10-19). */
export const MAX_REFS_AVEC_RACCORD = MAX_REFS_VISUELLES - 1;

/** Le plan ne peut pas recevoir son raccord faute de place : ses références visuelles (images + vidéos) sont déjà au plafond. */
export const raccordSansPlace = (nbRefsVisuelles: number): boolean => nbRefsVisuelles >= MAX_REFS_VISUELLES;

/** Le plus petit emplacement `<Picture N>` libre (1 à 6), ou null si les références visuelles (images + vidéos) sont déjà au plafond. */
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

/** `[reference generation + audio reference]` → `[reference generation + audio reference + keyframe completion]` (types combinés par « + », sans répétition). */
function ajouterTypeKeyframe(summary: string): string {
  const m = /^\s*\[([^\]]*)\]/.exec(summary);
  if (!m) return `[keyframe completion] ${summary.trim()}`.trim();
  if (/keyframe completion/i.test(m[1]!)) return summary;
  return summary.replace(m[0], `[${m[1]!.trim()} + keyframe completion]`);
}

/** Les sections du prompt SOUMIS : celles de la fiche, plus la déclaration de l'image de raccord (définition, rétention, type de tâche). Sans effet si
 * la fiche déclare déjà une première image pour le shot 1. */
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
  // Une fiche sans l'une de ces sections : elle est ajoutée, l'image doit toujours être déclarée.
  const manquantes: PromptSection[] = [];
  if (!noms.has("subject_definitions")) manquantes.push({ section: "subject_definitions", contenu: LIGNE_DEFINITION(slot) });
  if (!noms.has("retention_analysis")) manquantes.push({ section: "retention_analysis", contenu: LIGNE_RETENTION(slot) });
  return [...avec, ...manquantes];
}

/** Marge avant la fin du fichier où l'on prend l'image : le tout dernier instant peut être vide selon le conteneur. */
const MARGE_FIN_SECONDES = 0.1;

/** Arguments ffmpeg : la dernière image du fichier, en PNG sur stdout. */
export function argsDerniereImage(chemin: string, dureeSecondes: number): string[] {
  const instant = Math.max(0, dureeSecondes - MARGE_FIN_SECONDES);
  return ["-v", "error", "-ss", String(instant), "-i", chemin, "-frames:v", "1", "-f", "image2pipe", "-vcodec", "png", "pipe:1"];
}

/** La dernière image d'une vidéo, en PNG (octets). Lève `ErreurPlanche` si ffmpeg/ffprobe manquent ou échouent. */
export async function extraireDerniereImage(chemin: string, options: OptionsPlanche = {}): Promise<Buffer> {
  const executer = options.executer ?? executerProcessus;
  const dureeSecondes = await mesurerDuree(chemin, options);
  const { ffmpeg } = binaires(options.env);
  const png = await executer(ffmpeg, argsDerniereImage(chemin, dureeSecondes));
  if (png.length === 0) throw new Error(`ffmpeg n'a produit aucune image à la fin de ${chemin}.`);
  return png;
}

/** Ce que la page d'un essai dit de son raccord (null = rien à dire). `utilise` : l'essai du plan précédent dont cet essai a pris l'image (`jobs.raccord_job_id`) ;
 * `actuel` : l'essai dont l'image serait prise maintenant (`raccordActuel`, lib/queries-raccord.ts). `perime` : le plan précédent a changé depuis. */
export function etatRaccord(args: {
  liaison: string;
  utilise: number | null;
  actuel: { id: number; numeroRendu: number } | null;
  precedentTitre: string | null;
  /** Références visuelles (images + vidéos) que le plan déclare maintenant : au plafond, le raccord n'a pas d'emplacement. */
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
