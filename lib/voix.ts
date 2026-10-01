/** Casting vocal — constantes métier et garde-fous, tirés du skill
 * `.claude/skills/voix-comfyui`. Quatre étapes (2026-09-30) : la voix, sa
 * référence, le test vidéo, les répliques. Pur, sans accès disque ni base :
 * importable côté client comme côté serveur. */

export const SOURCES_VOIX = ["design", "reference"] as const;
export type SourceVoix = (typeof SOURCES_VOIX)[number];

export function estSourceVoix(v: string): v is SourceVoix {
  return (SOURCES_VOIX as readonly string[]).includes(v);
}

/** Texte de référence par défaut : le même pour toutes les voix. Meilleur
 * résultat observé (2026-09-30) : Qwen3 VoiceDesign lit ce texte **anglais** avec
 * l'instruction du personnage, puis CosyVoice3 clone cette référence pour dire
 * les répliques françaises. Voir workflows/voice-clone/VOX_Voice-design.json. */
export const TEXTE_REFERENCE_DEFAUT =
  "Welcome adventurer, and be my guest, into our humble tavern. Come have a seat, and a drink, before some chit chat !";

export const ETAPES_VOIX = [
  { cle: "voix", label: "Voix", aide: "instruction ou audio · texte de référence" },
  { cle: "reference", label: "Référence", aide: "voix de référence générée" },
  { cle: "test", label: "Test vidéo", aide: "voix sur un visage" },
  { cle: "repliques", label: "Répliques", aide: "prises produites et mesurées" },
] as const;

export type EtapeVoix = (typeof ETAPES_VOIX)[number]["cle"];

export function estEtapeVoix(v: string | undefined): v is EtapeVoix {
  return ETAPES_VOIX.some((e) => e.cle === v);
}

export type EtatEtape = "vide" | "part" | "on";
export type EtatPhases = Record<EtapeVoix, EtatEtape>;

export function etatPhases(v: {
  source: SourceVoix;
  instruction: string | null;
  referenceFichier: string | null;
  refText: string;
  testVideo: string | null;
  nbRepliques: number;
  nbRepliquesMesurees: number;
}): EtatPhases {
  const instruction = v.instruction?.trim() ?? "";
  const refText = v.refText.trim();
  // « Voix » : de quoi produire la référence (design), ou la référence même
  // (audio fourni) — dans les deux cas avec son texte.
  const sourcePrete = v.source === "design" ? instruction !== "" : !!v.referenceFichier;
  return {
    voix: sourcePrete && refText ? "on" : sourcePrete || refText ? "part" : "vide",
    reference: v.referenceFichier ? "on" : "vide",
    test: v.testVideo ? "on" : "vide",
    repliques: v.nbRepliques === 0 ? "vide" : v.nbRepliquesMesurees >= v.nbRepliques ? "on" : "part",
  };
}

export type CheckVoix = { niveau: "warn" | "info"; titre: string; detail?: string };

// Mots qui décrivent un micro, pas une gorge — poussent vers du souffle
// artificiel (skill, « Pas de description de prise de son »).
const MOTS_PRISE_DE_SON = /\b(close[- ]?miked|microphone|mic|studio|reverb|reverberation|recording)\b/gi;
// Négations — « n'ont aucun effet fiable », décrire ce qu'on veut.
const NEGATIONS = /\b(not|no|never|without|non)\b/gi;
// Marqueurs régionaux déguisés en marqueurs de classe.
const MOTS_ACCENT = /\b(aristocratic|posh|southern|received pronunciation|rp)\b/gi;

function occurrences(texte: string, re: RegExp): string[] {
  return [...new Set((texte.match(re) ?? []).map((m) => m.toLowerCase()))];
}

/** Garde-fous de l'instruction VoiceDesign — on signale, on ne bloque pas.
 * Rien à signaler = liste vide. */
export function checksInstruction(instruction: string): CheckVoix[] {
  const checks: CheckVoix[] = [];
  if (!instruction.trim()) return checks;
  if (!/\bnative\b|-speaking\b|\bspeaker\b/i.test(instruction)) {
    checks.push({
      niveau: "warn",
      titre: "Langue native non nommée",
      detail: "Sans elle, le modèle interpole entre la langue de l'instruction et celle du texte — prosodie déformée.",
    });
  }
  const neg = occurrences(instruction, NEGATIONS);
  if (neg.length > 0) {
    checks.push({
      niveau: "info",
      titre: "Négations",
      detail: `Sans effet fiable sur Qwen3-TTS : ${neg.join(", ")}. Décrire ce qu'on veut plutôt que ce qu'on refuse.`,
    });
  }
  const micro = occurrences(instruction, MOTS_PRISE_DE_SON);
  if (micro.length > 0) {
    checks.push({ niveau: "warn", titre: "Description de prise de son", detail: `${micro.join(", ")} — décrit un micro, pas une gorge.` });
  }
  const accent = occurrences(instruction, MOTS_ACCENT);
  if (accent.length > 0) {
    checks.push({
      niveau: "warn",
      titre: "Mot qui traîne un accent",
      detail: `${accent.join(", ")} — décrire la fonction (dirigeante, commandant) plutôt que la naissance.`,
    });
  }
  return checks;
}

/** Garde-fous de la référence audio. */
export function checksReference(v: { fichier: string | null; refText: string }): CheckVoix[] {
  const checks: CheckVoix[] = [];
  if (!v.fichier) return checks;
  if (/\.mp3$/i.test(v.fichier)) {
    checks.push({ niveau: "warn", titre: "Référence en MP3", detail: "Le clonage recopierait les artefacts de compression — FLAC ou WAV." });
  }
  if (!v.refText.trim()) {
    checks.push({
      niveau: "warn",
      titre: "Texte de référence manquant",
      detail: "Le texte lu dans la référence est une entrée du clonage — au mot près, sans lui la référence est diminuée.",
    });
  }
  return checks;
}

/** Prompt vidéo dédié au test de voix (gabarit T1 de FICHE_DE_PLAN_UTILITAIRES.md) :
 * plan fixe, une seule réplique face caméra, aucun geste — la voix porte seule.
 * Le texte va dans `<d>` tel quel (verbatim), le reste du corps est en anglais. */
export function promptTestVoix(v: {
  texte: string;
  personnage: { code: string; description: string | null } | null;
  decor: { code: string; description: string | null } | null;
  avecAudio: boolean;
}): string {
  const perso = v.personnage
    ? `the character from <Picture 1>${v.personnage.description?.trim() ? `, ${v.personnage.description.trim().replace(/\.$/, "")}` : ""}`
    : "a character facing the camera";
  const numDecor = v.personnage ? 2 : 1;
  const decor = v.decor
    ? `the setting from <Picture ${numDecor}>${v.decor.description?.trim() ? `, ${v.decor.description.trim().replace(/\.$/, "")}` : ""}, kept out of focus behind`
    : "a neutral, softly lit backdrop";
  const audio = v.avecAudio ? "\n<Audio 1> is the voice-timbre reference for <Subject 1> (S1)." : "";
  const texte = v.texte.trim() || "…";
  return `subject_definitions:
<Subject 1> is ${perso}.
<Subject 2> is ${decor}.${audio}

summary:
[reference generation] The target video holds a single locked medium shot of <Subject 1> in <Subject 2>, speaking one line directly to camera, with no gesture and no camera movement.

retention_analysis:
<Subject 1> (appears in [Shot 1]): fully_preserved - facial structure, eye colour, hair and costume are retained exactly as framed in the reference.
<Subject 2> (appears in [Shot 1]): fully_preserved - the setting is retained as an out-of-focus background.

detailed_description:
[Shot 1, 00:00.000–00:08.000] A locked medium shot of <Subject 1>, framed from the chest up, standing still in <Subject 2>. The camera does not move at any point. <Subject 1> faces the lens directly and speaks one single line, then falls silent and holds the gaze. There is no gesture, no step, no head tilt and no hand entering frame at any moment; the only motion in the entire video is the mouth, the eyes and the natural settle of breathing.
<d>[Français] ${texte}</d>

overall_soundscape:
A faint warm room tone, distant and low, with no music and no crowd.

non_diegetic_music:
N/A`;
}
