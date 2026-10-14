/** Master de voix d'un personnage (chantier voix/master, 2026-10-14) : le prompt de la vidéo de test H3 dont on garde la voix. Le casting
 * vocal (assistant de voix, fiches, prises, doublage) a été retiré (docs/FRICTIONS.md, 2026-10-14). Pur, sans accès disque ni base :
 * importable côté client comme côté serveur. */

import { langueBalise } from "./repliques";

/** Texte de référence anglais de repli (rédacteur de la réplique du test, `lib/replique-ecoute.ts`) quand le modèle ne répond pas. */
export const TEXTE_REFERENCE_DEFAUT =
  "Welcome adventurer, and be my guest, into our humble tavern. Come have a seat, and a drink, before some chit chat !";

/** Durée de la vidéo de test quand rien ne la fixe : une réplique face caméra tient en huit secondes. */
export const TEST_VIDEO_DUREE_DEFAUT = 8;

/** « 00:08.000 » : une durée en secondes dans la forme des plages du prompt H3. */
export function formaterPlageH3(secondes: number): string {
  const ms = Math.round(secondes * 1000);
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(ms % 1000).padStart(3, "0")}`;
}

/** Prompt vidéo du master de voix (gabarit T1 de FICHE_DE_PLAN_UTILITAIRES.md) : plan fixe, une seule réplique face caméra, aucun geste —
 * la voix porte seule. AUCUN audio n'est fourni : le modèle invente la voix d'après le prompt (le timbre voulu, s'il y en a un, et la
 * réplique). Le texte va dans `<d>` tel quel (verbatim), le reste du corps est en anglais. Sans image de personnage (voix off), le sujet
 * est « un personnage face caméra ». La balise de langue suit celle des dialogues du projet (« French » → [Français]). */
export function promptMasterVoix(v: {
  texte: string;
  personnage: { code: string; description: string | null } | null;
  dureeSecondes?: number;
  langue?: string | null;
  /** Le timbre voulu, en texte libre : sans lui, le modèle choisit la voix. */
  voix?: string | null;
}): string {
  const plage = formaterPlageH3(v.dureeSecondes ?? TEST_VIDEO_DUREE_DEFAUT);
  const langue = langueBalise(v.langue);
  const perso = v.personnage
    ? `the character from <Picture 1>${v.personnage.description?.trim() ? `, ${v.personnage.description.trim().replace(/\.$/, "")}` : ""}`
    : "a character facing the camera";
  const texte = v.texte.trim() || "…";
  const timbre = v.voix?.trim() ? ` Its voice is ${v.voix.trim().replace(/\.$/, "")}.` : "";
  return `subject_definitions:
<Subject 1> is ${perso}.
<Subject 2> is a neutral, softly lit backdrop.

summary:
[reference generation] The target video holds a single locked medium shot of <Subject 1> in <Subject 2>, speaking one line directly to camera, with no gesture and no camera movement.

retention_analysis:
<Subject 1> (appears in [Shot 1]): fully_preserved - facial structure, eye colour, hair and costume are retained exactly as framed in the reference.
<Subject 2> (appears in [Shot 1]): fully_preserved - the setting is retained as an out-of-focus background.

detailed_description:
[Shot 1, 00:00.000–${plage}] A locked medium shot of <Subject 1>, framed from the chest up, standing still in <Subject 2>. The camera does not move at any point. <Subject 1> faces the lens directly and speaks one single line, then falls silent and holds the gaze.${timbre} There is no gesture, no step, no head tilt and no hand entering frame at any moment; the only motion in the entire video is the mouth, the eyes and the natural settle of breathing.
<d>[${langue}] ${texte}</d>

overall_soundscape:
A faint warm room tone, distant and low, with no music and no crowd.

non_diegetic_music:
N/A`;
}
