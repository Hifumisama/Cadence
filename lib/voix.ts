/** Casting vocal — constantes métier et garde-fous, tirés du skill
 * `.claude/skills/voix-comfyui`. Quatre étapes (refonte 2026-10-09) : fiche,
 * voix de référence, validation, répliques. Pur, sans accès disque ni base :
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

/** Les quatre étapes de la fiche vocale (refonte UX 2026-10-09) : la fiche (identité, réplique d'écoute), la voix de référence
 * (décrire ou cloner, générer, garder une candidate), la validation (test vidéo, geste « Valider ») et les répliques. */
export const ETAPES_VOIX = [
  { cle: "fiche", label: "Fiche", aide: "identité · réplique d'écoute" },
  { cle: "reference", label: "Voix de référence", aide: "décrire ou cloner, générer" },
  { cle: "validation", label: "Validation", aide: "test vidéo · valider" },
  { cle: "repliques", label: "Répliques", aide: "prises de la voix" },
] as const;

export type EtapeVoix = (typeof ETAPES_VOIX)[number]["cle"];

export function estEtapeVoix(v: string | undefined): v is EtapeVoix {
  return ETAPES_VOIX.some((e) => e.cle === v);
}

/** Étape demandée par `?etape=` : les anciennes valeurs (« voix », « test ») mènent à leur équivalent ; sans paramètre (ou valeur
 * inconnue), la fiche s'ouvre toujours sur l'étape 1. */
export function etapeDepuisParametre(v: string | undefined): EtapeVoix {
  if (estEtapeVoix(v)) return v;
  if (v === "test") return "validation";
  return "fiche";
}

export type EtatEtape = "vide" | "part" | "on";
export type EtatPhases = Record<EtapeVoix, EtatEtape>;

export const LIBELLE_ETAT_ETAPE: Record<EtatEtape, string> = { vide: "À faire", part: "En cours", on: "Fait" };

/** Nombre de phrases d'un texte : des segments contenant au moins une lettre, séparés par . ! ? ou … (une dernière phrase sans
 * ponctuation compte). */
export function compterPhrases(texte: string): number {
  return texte.split(/[.!?…]+/).filter((s) => /\p{L}/u.test(s)).length;
}

/** La réplique d'écoute doit montrer le caractère de la voix : deux phrases au moins. */
export const PHRASES_MIN_ECOUTE = 2;

export function etatPhases(v: {
  source: SourceVoix;
  instruction: string | null;
  referenceFichier: string | null;
  refText: string;
  statut: string;
  testVideo: string | null;
  nbRepliques: number;
  nbRepliquesMesurees: number;
}): EtatPhases {
  const instruction = v.instruction?.trim() ?? "";
  const refText = v.refText.trim();
  // « Fiche » : de quoi produire la référence (une instruction, ou l'audio fourni) et la réplique d'écoute (2 phrases).
  const sourcePrete = v.source === "design" ? instruction !== "" : !!v.referenceFichier;
  const ecouteOk = compterPhrases(refText) >= PHRASES_MIN_ECOUTE;
  return {
    fiche: sourcePrete && ecouteOk ? "on" : sourcePrete || refText ? "part" : "vide",
    reference: v.referenceFichier ? "on" : "vide",
    // « Validation » : fait quand la voix est validée ; entamée dès qu'un test vidéo existe.
    validation: v.referenceFichier && v.statut === "valide" ? "on" : v.testVideo ? "part" : "vide",
    repliques: v.nbRepliques === 0 ? "vide" : v.nbRepliquesMesurees >= v.nbRepliques ? "on" : "part",
  };
}

/** L'état d'une fiche vocale, tel qu'on l'affiche (pastille avec libellé texte) : « voix à créer » = pas de référence ;
 * « à valider » = une référence, statut pas encore « valide » ; « validée » = statut « valide ». */
export type EtatFiche = "a_creer" | "a_valider" | "validee";

export const LIBELLE_ETAT_FICHE: Record<EtatFiche, string> = { a_creer: "Voix à créer", a_valider: "À valider", validee: "Validée" };

export function etatFiche(v: { fichier: string | null; statut: string }): EtatFiche {
  if (!v.fichier) return "a_creer";
  return v.statut === "valide" ? "validee" : "a_valider";
}

/** Le nom lisible d'une voix, partout dans le casting (le code VOICE_* n'y apparaît plus). Il n'y a pas de colonne « nom » : on le
 * dérive du personnage assigné (CHAR_conspirateur_nerveux → « Conspirateur nerveux »), à défaut du code de la voix sans son préfixe. */
export function nomVoix(v: { code: string; personnageCode?: string | null }): string {
  const brut = (v.personnageCode?.trim() || v.code).replace(/^(CHAR|VOICE)_/i, "").replace(/_+/g, " ").trim();
  return brut ? brut.charAt(0).toUpperCase() + brut.slice(1) : v.code;
}

/** Pourquoi la voix de référence ne peut pas être générée (null = possible). Même règle côté écran et côté serveur. */
export function raisonGenerationReference(v: { source: SourceVoix; instruction: string; refText: string }): string | null {
  if (v.source !== "design") return "Mode Cloner : la référence est l'audio rogné ci-dessus, il n'y a rien à générer.";
  if (!v.instruction.trim()) return "Écris la description du mode Décrire (l'instruction de la voix, en anglais).";
  if (compterPhrases(v.refText) < PHRASES_MIN_ECOUTE) return `La réplique d'écoute doit compter au moins ${PHRASES_MIN_ECOUTE} phrases (étape 1).`;
  return null;
}

/** Ce que coûte un changement de voix de référence : les répliques de la voix qui ont déjà une prise, et le test vidéo, sont
 * regénérés ; la fiche repasse « à valider ». Rien de tout cela (ou première référence) : le changement est direct. */
export type ImpactReference = { nbPrises: number; testVideo: boolean };

export function changementDemandeConfirmation(aDejaUneReference: boolean, impact: ImpactReference): boolean {
  return aDejaUneReference && (impact.nbPrises > 0 || impact.testVideo);
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
      titre: "Réplique d'écoute manquante",
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

/** Ce qui est relié à une voix, et ce que cela change pour sa suppression. Même règle que `supprimerAsset`
 * (app/assets/actions.ts), côté serveur : une voix citée comme référence dans une fiche de plan, ou
 * locuteur direct de répliques, ne se supprime pas. Les répliques de son PERSONNAGE ne bloquent pas : elles
 * repassent « sans voix » (l'étape « casting des voix » peut alors la recréer), mais on le dit avant. */
export type LiensVoix = { citations: number; repliquesDirectes: number; repliquesDuPersonnage: number };

export function verdictSuppressionVoix(liens: LiensVoix, personnageCode: string | null): { bloque: boolean; raison: string | null; avertissement: string | null } {
  const pluriel = (n: number, mot: string) => `${n} ${mot}${n > 1 ? "s" : ""}`;
  if (liens.citations > 0) {
    return { bloque: true, raison: `Encore citée comme référence dans ${pluriel(liens.citations, "fiche")} de plan — délie-la d'abord.`, avertissement: null };
  }
  if (liens.repliquesDirectes > 0) {
    return { bloque: true, raison: `Voix directe de ${pluriel(liens.repliquesDirectes, "réplique")} — change leur voix ou supprime-les d'abord.`, avertissement: null };
  }
  if (liens.repliquesDuPersonnage > 0) {
    return {
      bloque: false,
      raison: null,
      avertissement: `${pluriel(liens.repliquesDuPersonnage, "réplique")}${personnageCode ? ` de ${personnageCode}` : ""} repasser${liens.repliquesDuPersonnage > 1 ? "ont" : "a"} « sans voix ».`,
    };
  }
  return { bloque: false, raison: null, avertissement: null };
}
