/** Voice master of a character (voice/master workstream, 2026-10-14): the prompt of the H3 test video whose voice we keep. The voice casting
 * (voice assistant, sheets, takes, dubbing) was removed (docs/FRICTIONS.md, 2026-10-14). Pure, with no disk or database access:
 * importable client-side as well as server-side. */

const LANGUES_BALISE: Record<string, string> = {
  french: "Français",
  english: "English",
  spanish: "Español",
  german: "Deutsch",
  italian: "Italiano",
  portuguese: "Português",
};

/** Voice sheet language (« French ») -> label of the tag (`[Français]`,). An unknown language is kept as it is. */
export function langueBalise(langue: string | null | undefined): string {
  const l = (langue ?? "").trim();
  return LANGUES_BALISE[l.toLowerCase()] ?? (l || "Français");
}

/** English fallback reference text (writer of the test line, `lib/voice/listening-line.ts`) when the model does not respond. */
export const TEXTE_REFERENCE_DEFAUT =
  "Welcome adventurer, and be my guest, into our humble tavern. Come have a seat, and a drink, before some chit chat !";

/** Duration of the test video when nothing sets it: a line facing the camera lasts eight seconds. */
const TEST_VIDEO_DUREE_DEFAUT = 8;

/** « 00:08.000 »: a duration in seconds in the form of the H3 prompt's ranges. */
export function formaterPlageH3(secondes: number): string {
  const ms = Math.round(secondes * 1000);
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(ms % 1000).padStart(3, "0")}`;
}

/** Video prompt of the voice master (T1 template of FICHE_DE_PLAN_UTILITAIRES.md): fixed shot, a single line facing the camera, no gesture —
 * the voice carries alone. NO audio is provided: the model invents the voice from the prompt (the wanted timbre, if there is one, and the
 * line). The text goes into `<d>` as it is (verbatim), the rest of the body is in English. Without a character image (voice-over), the subject
 * is « un personnage face caméra ». The language tag follows that of the project's dialogues (« French » → [Français]). */
export function promptMasterVoix(v: {
  texte: string;
  personnage: { code: string; description: string | null } | null;
  dureeSecondes?: number;
  langue?: string | null;
  /** The wanted timbre, as free text: without it, the model chooses the voice. */
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
