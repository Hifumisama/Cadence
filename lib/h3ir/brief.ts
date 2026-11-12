import { libelleAsset, slugifyCode } from "../assets/assetCode";
import { LANGUE_AUTO } from "../voice/languages-tts";
import { MAX_REFS_AUDIO, MAX_REFS_VISUELLES } from "../clips/clip-continuity";
import { SHOT_MIN_FICHE_SECONDES } from "../clips/clip-checks";
import { estCreativite, estProfilPerso, STYLE_AUCUN, type Creativite } from "./settings";
import { PROFILS_PERSO } from "./character-profiles";
import { STYLES_CAMERA } from "./styles-camera";

/** A clip's Open H3 IR brief (step 1 of the integration plan, docs/PLAN_INTEGRATION_OPEN_H3_IR.md): the Cadence → `BriefIn` mapping, the
 * body of `POST /v1/briefs` of the `open-h3-ir` package. Pure: everything needed is already loaded (lib/h3ir/brief-clip.ts), no database or disk access.
 *
 * The service refuses any unknown key (`extra="forbid"`, 422 `unknown-field`): the brief only carries keys of the contract. The intent is in
 * FRENCH at this step (no LLM); its translation into English will come with the worker's task (step 3), because the package only spots light, framing,
 * palette, clothing, action and prohibitions in English words. */

/** Fixed resolution (decision of 2026-11-02): 0,4 megapixel, whatever the clip's setting. */
const MEGAPIXELS_H3IR = 0.4;


/** The package's ceiling on `shots` (`PINNED_SHOTS_MAX`). Its per-shot floor (`MIN_SHOT_MS` = 1200) is `SHOT_MIN_FICHE_SECONDES` (lib/clips/clip-checks.ts). The package
 * refuses a number of shots that does not fit in the NOMINAL duration (`shots-do-not-fit`, h3ir/compile.py:116): the ceiling is therefore computed on it, not on the effective duration. */
const SHOTS_MAX = 10;

/** The declared role of an image according to the asset's type. Always declared: an omitted role lets the package guess the mode (it may switch to
 * the clip's first frame, I2VA/FL2VA) and turns an audio into background music. A single constant, to adjust after the bench.
 *
 * A visual effect (`vfx`) goes as `style` (2026-11-09): a WEAK reference (`weak_reference`, without `<Subject N>`), because an effect is never
 * reused as is; only its colour, matter and movement pass onto the clip's subjects. TO BE VALIDATED ON THE RENDER BENCH. An effect to reuse as is
 * (a famous attack) does not yet have its own setting: `plan_refs.retention` is only kept for audio (always null for an image, neither written by
 * the sheet nor editable) and `plan_refs.role` is a free label. Meanwhile, typing the asset as `prop` (a visible object, hence `subject`) makes it pass as is. */
export const ROLE_PAR_TYPE: Record<string, "subject" | "environment" | "storyboard" | "style"> = {
  personnage: "subject",
  prop: "subject",
  vfx: "style",
  oth: "subject",
  decor: "environment",
  keyframe: "storyboard",
};

type AssetBrief = { path: string; kind: "image" | "video" | "audio"; role: string; note?: string };
type DialogueBrief = { text: string; language: string; speaker?: string; voiceover: boolean };

/** The request body, in the order one wants to read it. */
export type BriefH3ir = {
  intent: string;
  assets: AssetBrief[];
  seconds: number;
  megapixels: number;
  dialogue: DialogueBrief[];
  shots?: number;
  /** Absent = « balanced », the package's default. */
  creativity?: Creativite;
  director?: string;
  /** A custom profile (character-profiles.ts): in place of `director`, never with it. */
  director_profile?: { name: string; notes: string };
  effort: "standard";
  seed?: number;
  transcripts?: Record<string, string>;
};

/** A character in the registry: their fixed voice if they have one (the cleaned master, its sha256 and the line the test says). */
export type PersonnageEntree = {
  code: string;
  label: string | null;
  voix: { chemin: string; sha256: string; description: string | null; repliqueBase: string | null } | null;
};

/** A reference of the clip (`plan_refs`) with its asset. `chemin`: the file as an absolute path, null if it does not exist yet. */
export type ReferenceEntree = {
  type: "picture" | "video" | "audio";
  slot: number;
  code: string;
  label: string | null;
  typeAsset: string;
  description: string | null;
  chemin: string | null;
};

export type EntreeBrief = {
  plan: { description: string; dureeSecondes: number; seed: string | null };
  scene: { titre: string; ambiance: string | null } | null;
  /** Language of the dialogues in the engine's sense (« French »…, « Auto »), see lib/voice/language-dialogues.ts. */
  langueDialogues: string;
  /** Codes of the characters whose brief says « voix off » (thoughts): `codesEnVoixOff`, lib/agents/conversion.ts. */
  codesVoixOff: string[];
  personnages: PersonnageEntree[];
  references: ReferenceEntree[];
};

/** `director`: one of the 7 profiles, `"aucun"` or empty = no staging style. `creativity`: one of the 4 levels (`balanced` = the package's default, the key is then not sent).
 * The values inherited from the project, the scene or the clip are resolved BEFORE (lib/h3ir/settings.ts, `chargerBriefPlan`). */
export type OptionsBrief = { shots?: number | null; director?: string | null; creativity?: string | null };

/** Which file sent is which Cadence asset: the compiler's manifest only knows fingerprints, `liens` (with the `fichiers` of the Python bridge,
 * fingerprint → path) gives each reference back its asset (lib/h3ir/conversion.ts). `type`: that of the clip's reference (`plan_refs.type`). */
export type LienFichier = { path: string; code: string; type: "picture" | "video" | "audio" };

export type ResultatBrief = { brief: BriefH3ir | null; refus: string | null; avertissements: string[]; liens: LienFichier[] };

/** A dialogue line of the description: « NOM : « texte » ». A full stop after the closing quote is tolerated (« Katara : « l'Air ». » : without this the line stayed
 * in the narration and was never spoken, clip 03 of project 236). */
const LIGNE_REPLIQUE = /^[\s  ]*([^:«»\n]{1,60}?)[\s  ]*:[\s  ]*«[\s  ]*([\s\S]*?)[\s  ]*»[\s  .]*$/;
const ETAT_DE_FIN = /^[\s  ]*État en fin de plan/i;

/** French typography puts a space (often non-breaking) before `! ? ; :`: the package turns it into a break in its draft (h3ir/render.py:407). */
export const normaliserReplique = (texte: string): string =>
  texte
    .replace(/[\s  ]+([!?;:])/g, "$1")
    .replace(/\.{3,}/g, "…")
    .trim();

/** Splits a clip's description into narration (without « État en fin de plan ») and lines `{ nom, texte }`, in order. */
export function separerDescription(description: string): { narration: string; repliques: { nom: string; texte: string }[] } {
  const repliques: { nom: string; texte: string }[] = [];
  const gardees: string[] = [];
  let dansEtat = false;
  for (const ligne of description.replace(/\r\n?/g, "\n").split("\n")) {
    if (ETAT_DE_FIN.test(ligne)) dansEtat = true;
    else if (!ligne.trim()) dansEtat = false;
    if (dansEtat) continue;
    const m = LIGNE_REPLIQUE.exec(ligne);
    if (m) repliques.push({ nom: m[1]!.trim(), texte: m[2]! });
    else gardees.push(ligne);
  }
  return { narration: gardees.join("\n").replace(/\n{3,}/g, "\n\n").trim(), repliques };
}

/** A text between straight quotes « "…" » would be taken for text to display on screen (creativity.build): we use chevrons. */
const sansGuillemetsDroits = (texte: string): string => texte.replace(/"([^"]*)"/g, "«$1»").replace(/"/g, "'");

export const estVoixOff = (nom: string) => slugifyCode(nom) === "voix_off";

/** The registry character who bears this speaker name (label, otherwise code without prefix), or nothing. Shared with the choice of references (references-plan.ts). */
export function trouverPersonnage<T extends { code: string; label?: string | null }>(nom: string, personnages: T[]): T | undefined {
  const cle = slugifyCode(nom);
  if (!cle) return undefined;
  return (
    personnages.find((p) => slugifyCode(libelleAsset(p)) === cle) ??
    personnages.find((p) => slugifyCode(p.code.replace(/^[A-Z]+_/, "")) === cle)
  );
}

export function briefDepuisPlan(entree: EntreeBrief, options: OptionsBrief = {}): ResultatBrief {
  const avertissements: string[] = [];
  const refuser = (refus: string): ResultatBrief => ({ brief: null, refus, avertissements, liens: [] });

  // --- Visual references: at least one, all with their file, 6 at most ---
  const visuelles = entree.references.filter((r) => r.type !== "audio").sort((a, b) => a.slot - b.slot);
  if (visuelles.length === 0) return refuser("Le plan n'a aucune image de référence : Open H3 IR passerait en mode texte seul. Ajoute au moins une référence.");
  const sansFichier = visuelles.filter((r) => !r.chemin);
  if (sansFichier.length > 0) {
    return refuser(`Ces références n'ont pas encore de fichier : ${sansFichier.map((r) => r.label?.trim() || r.code).join(", ")}. Crée leurs images d'abord.`);
  }
  if (visuelles.length > MAX_REFS_VISUELLES) {
    return refuser(`Le plan a ${visuelles.length} références visuelles, ${MAX_REFS_VISUELLES} au plus : retires-en ${visuelles.length - MAX_REFS_VISUELLES}.`);
  }

  // --- Description: narration and lines ---
  const { narration, repliques } = separerDescription(entree.plan.description ?? "");
  if (!narration) return refuser("Le plan n'a pas de description (hors répliques) : il n'y a rien à raconter à Open H3 IR.");

  const langue = entree.langueDialogues === LANGUE_AUTO || !entree.langueDialogues ? "French" : entree.langueDialogues;
  if (repliques.length > 0 && langue !== entree.langueDialogues) avertissements.push("La langue des dialogues est « Auto » : « French » est envoyé.");

  const voixOff = new Set(entree.codesVoixOff);
  const dialogue: DialogueBrief[] = [];
  const parlants: PersonnageEntree[] = [];
  for (const r of repliques) {
    const texte = normaliserReplique(r.texte);
    if (!texte) continue;
    if (estVoixOff(r.nom)) {
      dialogue.push({ text: texte, language: langue, voiceover: true });
      continue;
    }
    const perso = trouverPersonnage(r.nom, entree.personnages);
    if (!perso) avertissements.push(`Le locuteur « ${r.nom} » n'est pas au registre : sa réplique est transmise sans lien avec un personnage.`);
    else if (!parlants.includes(perso)) parlants.push(perso);
    dialogue.push({ text: texte, language: langue, speaker: perso ? libelleAsset(perso) : r.nom, voiceover: !!perso && voixOff.has(perso.code) });
  }

  // --- Assets: the images of those who speak first (the package links the voice to the first one), then the rest in slot order ---
  const rang = (r: ReferenceEntree) => {
    const i = parlants.findIndex((p) => p.code === r.code);
    return i < 0 ? parlants.length : i;
  };
  const ordonnees = [...visuelles].sort((a, b) => rang(a) - rang(b) || a.slot - b.slot);
  const assets: AssetBrief[] = ordonnees.map((r) => {
    const nom = r.label?.trim() || libelleAsset(r);
    const note = [nom, r.description?.trim()].filter(Boolean).join(" — ");
    return {
      path: r.chemin!,
      kind: r.type === "video" ? "video" : "image",
      role: ROLE_PAR_TYPE[r.typeAsset] ?? "subject",
      ...(note ? { note } : {}),
    };
  });

  // --- Voice: one `voice_timbre` audio per character who speaks and whose voice is fixed; its transcription is the test line ---
  const liens: LienFichier[] = ordonnees.map((r) => ({ path: r.chemin!, code: r.code, type: r.type as LienFichier["type"] }));
  const transcripts: Record<string, string> = {};
  let nbVoix = 0;
  for (const p of parlants) {
    if (!p.voix) {
      avertissements.push(`${libelleAsset(p)} parle mais n'a pas de voix fixée : le modèle inventera sa voix.`);
      continue;
    }
    if (nbVoix >= MAX_REFS_AUDIO) {
      avertissements.push(`Plus de ${MAX_REFS_AUDIO} personnages parlent : la voix de ${libelleAsset(p)} n'est pas transmise.`);
      continue;
    }
    nbVoix++;
    liens.push({ path: p.voix.chemin, code: p.code, type: "audio" });
    const note = p.voix.description?.trim();
    assets.push({ path: p.voix.chemin, kind: "audio", role: "voice_timbre", ...(note ? { note: `${libelleAsset(p)} : ${note}` } : { note: libelleAsset(p) }) });
    if (p.voix.repliqueBase?.trim()) transcripts[p.voix.sha256] = p.voix.repliqueBase.trim();
  }

  // --- Intent: narration, scene ambiance (in French at this step) ---
  const morceaux = [narration];
  if (entree.scene?.ambiance?.trim()) morceaux.push(`Ambiance : ${entree.scene.ambiance.trim()}`);
  // No scene title in the intent (decision of 2026-11-02, after the demos): a title is a filing word (« Styles ») that would turn up as is in the prompt.
  const intent = sansGuillemetsDroits(morceaux.join("\n\n"));

  // --- Duration, shots, staging style, seed ---
  const seconds = entree.plan.dureeSecondes;
  const brief: BriefH3ir = { intent, assets, seconds, megapixels: MEGAPIXELS_H3IR, dialogue, effort: "standard" };

  if (options.shots != null) {
    const max = Math.min(SHOTS_MAX, Math.floor(seconds / SHOT_MIN_FICHE_SECONDES));
    if (!Number.isInteger(options.shots) || options.shots < 1 || options.shots > max) {
      return refuser(`Le nombre de shots doit être un entier de 1 à ${max} pour ${seconds} s (1,2 s au plus court par shot).`);
    }
    brief.shots = options.shots;
  }
  const creativite = options.creativity?.trim();
  if (creativite) {
    if (!estCreativite(creativite)) return refuser(`Créativité inconnue : « ${creativite} ».`);
    if (creativite !== "balanced") brief.creativity = creativite;
  }
  const camera = options.director?.trim();
  if (camera && camera !== STYLE_AUCUN && estProfilPerso(camera)) {
    brief.director_profile = PROFILS_PERSO[camera];
  } else if (camera && camera !== STYLE_AUCUN) {
    if (!(STYLES_CAMERA as readonly string[]).includes(camera)) return refuser(`Style de mise en scène inconnu : « ${camera} ».`);
    brief.director = camera;
  }
  const seed = Number(entree.plan.seed);
  if (entree.plan.seed != null && Number.isSafeInteger(seed)) brief.seed = seed;
  else avertissements.push("Le plan n'a pas de seed utilisable : le paquet prend la sienne.");
  if (Object.keys(transcripts).length > 0) brief.transcripts = transcripts;

  return { brief, refus: null, avertissements, liens };
}
