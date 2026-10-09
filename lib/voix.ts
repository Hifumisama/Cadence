/** Casting vocal — constantes métier et garde-fous, tirés du skill
 * `.claude/skills/voix-comfyui`. Six scènes dans l'assistant d'une voix (2026-10-09) : identité, origine, timbre (ou source),
 * référence, ressenti, répliques. Pur, sans accès disque ni base : importable côté client comme côté serveur. */

import { langueBalise } from "./repliques";

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

/** Les six scènes de l'assistant d'une voix (2026-10-09, remplace les quatre étapes du 2026-10-08) : l'identité (nom, personnage,
 * langue), l'origine (la décrire ou la fournir), le timbre (décrit) ou la source (fournie) — une même scène « voix », dont le contenu
 * suit l'origine —, la référence (générer, garder), le ressenti (test vidéo, verdict, retouche) et les répliques (prises, doublage). */
export const ETAPES_VOIX = [
  { cle: "identite", label: "Identité", aide: "nom · personnage · langue" },
  { cle: "origine", label: "Origine", aide: "la décrire ou la fournir" },
  { cle: "voix", label: "Le timbre", aide: "décrire le timbre, ou fournir la source" },
  { cle: "reference", label: "Référence", aide: "générer, garder" },
  { cle: "ressenti", label: "Ressenti", aide: "test vidéo · verdict" },
  { cle: "repliques", label: "Répliques", aide: "prises · doublage" },
] as const;

export type EtapeVoix = (typeof ETAPES_VOIX)[number]["cle"];

export function estEtapeVoix(v: string | undefined): v is EtapeVoix {
  return ETAPES_VOIX.some((e) => e.cle === v);
}

/** Libellé de la scène 3 : « Le timbre » pour une voix décrite, « La source » pour une voix fournie. */
export function libelleEtapeVoix(cle: EtapeVoix, source: SourceVoix): string {
  if (cle === "voix") return source === "design" ? "Le timbre" : "La source";
  return ETAPES_VOIX.find((e) => e.cle === cle)!.label;
}

/** Étape demandée par `?etape=` : les anciennes valeurs (« fiche », « validation », « test ») mènent à leur équivalent (les liens du
 * bandeau de suivi en portent encore) ; sans paramètre (ou valeur inconnue), la fiche s'ouvre sur la première scène. */
export function etapeDepuisParametre(v: string | undefined): EtapeVoix {
  if (estEtapeVoix(v)) return v;
  if (v === "validation" || v === "test") return "ressenti";
  return "identite";
}

/** Longueur maximale de la fenêtre d'une voix FOURNIE : on n'extrait jamais le fichier entier, seulement ce qui sert de référence. */
export const FENETRE_SOURCE_MAX_SECONDES = 30;
export const FENETRE_SOURCE_MIN_SECONDES = 3;

/** Pourquoi la fenêtre choisie dans une source ne peut pas partir (null = possible). */
export function raisonFenetreInvalide(debut: number, fin: number): string | null {
  if (![debut, fin].every(Number.isFinite) || debut < 0) return "Fenêtre invalide.";
  const duree = fin - debut;
  if (duree < FENETRE_SOURCE_MIN_SECONDES) return `Garde au moins ${FENETRE_SOURCE_MIN_SECONDES} secondes.`;
  if (duree > FENETRE_SOURCE_MAX_SECONDES + 0.05) return `${FENETRE_SOURCE_MAX_SECONDES} secondes au maximum : choisis une fenêtre plus courte.`;
  return null;
}

/** Le verdict rendu au ressenti. « À ajuster » ouvre la retouche ; « à refaire » renvoie à la scène du timbre. */
export type VerdictVoix = "ok" | "ajuster" | "refaire";
export const LIBELLE_VERDICT: Record<VerdictVoix, string> = { ok: "validé", ajuster: "à ajuster", refaire: "à refaire" };

/** Une ligne du journal des essais : l'instruction essayée et ce qu'on en a pensé. Le journal est lu par l'IA qui propose une
 * retouche, pour ne pas revenir sur ce qui a déjà été refusé. */
export type EssaiVoix = { n: number; instruction: string; verdict: VerdictVoix | null; note: string };

export const ESSAIS_GARDES = 12;

export function lireEssais(v: unknown): EssaiVoix[] {
  if (!Array.isArray(v)) return [];
  const essais: EssaiVoix[] = [];
  for (const x of v) {
    if (typeof x !== "object" || x === null) continue;
    const o = x as Record<string, unknown>;
    if (typeof o.n !== "number" || typeof o.instruction !== "string") continue;
    const verdict = o.verdict === "ok" || o.verdict === "ajuster" || o.verdict === "refaire" ? o.verdict : null;
    essais.push({ n: o.n, instruction: o.instruction, verdict, note: typeof o.note === "string" ? o.note : "" });
  }
  return essais.slice(-ESSAIS_GARDES);
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
  // « Origine » : de quoi produire la référence existe (une instruction, ou l'audio fourni).
  const sourcePrete = v.source === "design" ? instruction !== "" : !!v.referenceFichier;
  // « Le timbre » (voix décrite : l'instruction + la réplique d'écoute de 2 phrases) ou « La source » (voix fournie : l'audio isolé
  // + sa transcription).
  const ecouteOk = compterPhrases(refText) >= PHRASES_MIN_ECOUTE;
  const voix: EtatEtape =
    v.source === "design"
      ? instruction !== "" && ecouteOk ? "on" : instruction !== "" || refText ? "part" : "vide"
      : v.referenceFichier && refText ? "on" : v.referenceFichier ? "part" : "vide";
  return {
    identite: "on", // le nom existe toujours (dérivé à défaut d'être choisi)
    origine: sourcePrete ? "on" : "vide",
    voix,
    reference: v.referenceFichier ? "on" : "vide",
    // « Ressenti » : fait quand la voix est validée ; entamé dès qu'un test vidéo existe.
    ressenti: v.referenceFichier && v.statut === "valide" ? "on" : v.testVideo ? "part" : "vide",
    repliques: v.nbRepliques === 0 ? "vide" : v.nbRepliquesMesurees >= v.nbRepliques ? "on" : "part",
  };
}

/** Ce qu'il manque pour que la scène soit « faite », en une phrase (affichée dans la barre du bas), ou null. Un conseil, jamais un
 * verrou : on peut toujours glisser vers la scène suivante. */
export function manquePourAvancer(
  etape: EtapeVoix,
  v: { source: SourceVoix; instruction: string | null; refText: string; referenceFichier: string | null; valide: boolean; testVideo: boolean },
): string | null {
  switch (etape) {
    case "voix":
      if (v.source === "design") {
        if (!v.instruction?.trim()) return "Il manque : le timbre de la voix.";
        if (compterPhrases(v.refText) < PHRASES_MIN_ECOUTE) return `Il manque : une réplique d'écoute d'au moins ${PHRASES_MIN_ECOUTE} phrases.`;
        return null;
      }
      if (!v.referenceFichier) return "Il manque : la source, extraite puis utilisée comme voix.";
      return v.refText.trim() ? null : "Il manque : la transcription, au mot près.";
    case "reference":
      return v.referenceFichier ? null : v.source === "design" ? "Il manque : une prise gardée comme voix de référence." : "Il manque : la voix isolée de la source.";
    case "ressenti":
      if (!v.referenceFichier) return "Il faut d'abord une voix de référence.";
      if (v.valide) return null;
      return v.testVideo ? "À toi de juger : c'est bon, à ajuster ou à refaire." : "Lance un test vidéo pour juger la voix.";
    default:
      return null;
  }
}

/** L'état d'une fiche vocale, tel qu'on l'affiche (pastille avec libellé texte) : « voix à créer » = pas de référence ;
 * « à valider » = une référence, statut pas encore « valide » ; « validée » = statut « valide ». */
export type EtatFiche = "a_creer" | "a_valider" | "validee";

export const LIBELLE_ETAT_FICHE: Record<EtatFiche, string> = { a_creer: "Voix à créer", a_valider: "À valider", validee: "Validée" };

export function etatFiche(v: { fichier: string | null; statut: string }): EtatFiche {
  if (!v.fichier) return "a_creer";
  return v.statut === "valide" ? "validee" : "a_valider";
}

/** Le nom lisible d'une voix, partout dans le casting (le code VOICE_* n'y apparaît plus). Le nom choisi dans l'assistant
 * (`voix_fiches.nom`) passe avant tout ; à défaut on le dérive du personnage assigné (CHAR_conspirateur_nerveux → « Conspirateur
 * nerveux »), puis du code de la voix sans son préfixe. Le code, lui, ne change jamais : il nomme les fichiers. */
export function nomVoix(v: { code: string; personnageCode?: string | null; nom?: string | null }): string {
  const choisi = v.nom?.trim();
  if (choisi) return choisi;
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

/** Le texte dit dans un prompt de test (la balise `<d>[Langue] texte</d>` de `promptTestVoix`), ou "" s'il n'y en a pas. Sert à
 * nommer les anciennes tentatives, lancées avant que le texte soit gardé à part. */
export function texteDuPromptTest(prompt: string): string {
  const m = prompt.match(/<d>\s*(?:\[[^\]]*\]\s*)?([\s\S]*?)<\/d>/);
  return m ? m[1]!.replace(/\s+/g, " ").trim() : "";
}

// — Durée du test vidéo : celle de l'AUDIO. Un test à durée fixe désynchronise : trop court, la phrase est coupée ; trop long, le visage
// parle dans le vide (ou, pire, ComfyUI étire/tronque l'audio). Le modèle vidéo accepte 5 à 15 s (DUREE_GENERATION_MIN/MAX,
// lib/plan-checks.ts — un test de cohérence veille à l'égalité). —

export const TEST_VIDEO_DUREE_MIN = 5;
export const TEST_VIDEO_DUREE_MAX = 15;
/** Durée quand l'audio n'est pas mesurable (M4A, OGG…) : l'ancienne durée fixe. */
export const TEST_VIDEO_DUREE_DEFAUT = 8;
/** Le plan garde le visage une seconde après la dernière syllabe (le prompt : « then falls silent and holds the gaze »). */
export const TEST_VIDEO_QUEUE_SECONDES = 1;

/** La durée de la vidéo de test pour un audio de `audioSecondes` secondes (null = non mesuré) : l'audio plus une seconde de silence,
 * arrondie à la seconde, entre 5 et 15 s. Un audio de plus de 15 s ne tient pas dans une vidéo : refus, avec la raison (le plan
 * tronquerait la phrase). */
export function dureeVideoPourAudio(audioSecondes: number | null): { ok: true; duree: number } | { ok: false; erreur: string } {
  if (audioSecondes == null) return { ok: true, duree: TEST_VIDEO_DUREE_DEFAUT };
  if (!Number.isFinite(audioSecondes) || audioSecondes <= 0) return { ok: false, erreur: "L'audio du test est vide ou illisible." };
  if (audioSecondes > TEST_VIDEO_DUREE_MAX) {
    return { ok: false, erreur: `L'audio dure ${Math.round(audioSecondes * 10) / 10} s : une vidéo de test tient en ${TEST_VIDEO_DUREE_MAX} s au plus. Raccourcis le texte du test.` };
  }
  const voulue = Math.ceil(audioSecondes + TEST_VIDEO_QUEUE_SECONDES);
  return { ok: true, duree: Math.min(TEST_VIDEO_DUREE_MAX, Math.max(TEST_VIDEO_DUREE_MIN, voulue)) };
}

/** « 00:08.000 » : une durée en secondes dans la forme des plages du prompt H3. */
export function formaterPlageH3(secondes: number): string {
  const ms = Math.round(secondes * 1000);
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(ms % 1000).padStart(3, "0")}`;
}

const PLAGE_TEST = /\[Shot 1, 00:00\.000–[0-9:.]+\]/;

/** Remet la plage du plan d'un prompt de test à la durée réelle de la vidéo (`[Shot 1, 00:00.000–00:08.000]`). Le worker l'appelle une
 * fois l'audio connu : le prompt composé au lancement n'avait que la durée par défaut. Un prompt sans plage est rendu tel quel. */
export function ajusterDureePromptTest(prompt: string, secondes: number): string {
  return prompt.replace(PLAGE_TEST, `[Shot 1, 00:00.000–${formaterPlageH3(secondes)}]`);
}

/** Prompt vidéo dédié au test de voix (gabarit T1 de FICHE_DE_PLAN_UTILITAIRES.md) :
 * plan fixe, une seule réplique face caméra, aucun geste — la voix porte seule.
 * Le texte va dans `<d>` tel quel (verbatim), le reste du corps est en anglais. La plage du plan suit `dureeSecondes` (8 s à défaut,
 * puis ajustée à l'audio par le worker : `ajusterDureePromptTest`) ; la balise de langue suit celle de la voix (« French » → [Français]). */
export function promptTestVoix(v: {
  texte: string;
  personnage: { code: string; description: string | null } | null;
  decor: { code: string; description: string | null } | null;
  avecAudio: boolean;
  dureeSecondes?: number;
  langue?: string | null;
}): string {
  const plage = formaterPlageH3(v.dureeSecondes ?? TEST_VIDEO_DUREE_DEFAUT);
  const langue = langueBalise(v.langue);
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
[Shot 1, 00:00.000–${plage}] A locked medium shot of <Subject 1>, framed from the chest up, standing still in <Subject 2>. The camera does not move at any point. <Subject 1> faces the lens directly and speaks one single line, then falls silent and holds the gaze. There is no gesture, no step, no head tilt and no hand entering frame at any moment; the only motion in the entire video is the mouth, the eyes and the natural settle of breathing.
<d>[${langue}] ${texte}</d>

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
