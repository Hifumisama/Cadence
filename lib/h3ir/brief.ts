import { libelleAsset, slugifyCode } from "../assets/assetCode";
import { LANGUE_AUTO } from "../voice/langues-tts";
import { MAX_REFS_AUDIO, MAX_REFS_VISUELLES } from "../plans/plan-raccord";
import { SHOT_MIN_FICHE_SECONDES } from "../plans/plan-checks";
import { estCreativite, estProfilPerso, STYLE_AUCUN, type Creativite } from "./reglages";
import { PROFILS_PERSO } from "./profils-perso";
import { STYLES_CAMERA } from "./styles-camera";

/** Le brief Open H3 IR d'un plan (étape 1 du plan d'intégration, docs/PLAN_INTEGRATION_OPEN_H3_IR.md) : la correspondance Cadence → `BriefIn`, le
 * corps de `POST /v1/briefs` du paquet `open-h3-ir`. Pur : tout ce qu'il faut est déjà chargé (lib/h3ir/brief-plan.ts), aucun accès base ni disque.
 *
 * Le service refuse toute clé inconnue (`extra="forbid"`, 422 `unknown-field`) : le brief ne porte que des clés du contrat. L'intent est en
 * FRANÇAIS à cette étape (pas de LLM) ; sa traduction en anglais viendra avec la tâche du worker (étape 3), car le paquet ne repère lumière, cadrage,
 * palette, vêtements, action et interdits que sur des mots anglais. */

/** Résolution fixée (décision du 2026-11-02) : 0,4 mégapixel, quel que soit le réglage du plan. */
const MEGAPIXELS_H3IR = 0.4;


/** Plafond de `shots` du paquet (`PINNED_SHOTS_MAX`). Son plancher par shot (`MIN_SHOT_MS` = 1200) est `SHOT_MIN_FICHE_SECONDES` (lib/plans/plan-checks.ts). Le paquet
 * refuse un nombre de shots qui ne tient pas dans la durée NOMINALE (`shots-do-not-fit`, h3ir/compile.py:116) : le plafond se calcule donc sur elle, non sur la durée effective. */
const SHOTS_MAX = 10;

/** Le rôle déclaré d'une image selon le type de l'asset. Toujours déclaré : un rôle omis laisse le paquet deviner le mode (il peut basculer en
 * première image du clip, I2VA/FL2VA) et fait d'un audio une musique de fond. Une seule constante, à ajuster après le banc.
 *
 * Un effet visuel (`vfx`) part en `style` (2026-11-09) : référence FAIBLE (`weak_reference`, sans `<Subject N>`), car un effet n'est jamais
 * repris tel quel, seuls sa couleur, sa matière et son mouvement passent sur les sujets du plan. À VALIDER AU BANC DE RENDU. Un effet à
 * reprendre tel quel (une attaque célèbre) n'a pas encore de réglage propre : `plan_refs.retention` n'est tenue que pour l'audio (toujours
 * null pour une image, ni écrite par la fiche ni éditable) et `plan_refs.role` est un libellé libre. En attendant, typer l'asset en `prop`
 * (un objet visible, donc `subject`) le fait passer tel quel. */
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

/** Le corps de la requête, dans l'ordre où on veut le lire. */
export type BriefH3ir = {
  intent: string;
  assets: AssetBrief[];
  seconds: number;
  megapixels: number;
  dialogue: DialogueBrief[];
  shots?: number;
  /** Absent = « balanced », le défaut du paquet. */
  creativity?: Creativite;
  director?: string;
  /** Un profil personnalisé (profils-perso.ts) : à la place de `director`, jamais avec. */
  director_profile?: { name: string; notes: string };
  effort: "standard";
  seed?: number;
  transcripts?: Record<string, string>;
};

/** Un personnage du registre : sa voix fixée s'il en a une (le master nettoyé, son sha256 et la réplique que dit le test). */
export type PersonnageEntree = {
  code: string;
  label: string | null;
  voix: { chemin: string; sha256: string; description: string | null; repliqueBase: string | null } | null;
};

/** Une référence du plan (`plan_refs`) avec son asset. `chemin` : le fichier en chemin absolu, null s'il n'existe pas encore. */
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
  /** Langue des dialogues au sens du moteur (« French »…, « Auto »), voir lib/voice/langue-dialogues.ts. */
  langueDialogues: string;
  /** Codes des personnages dont le brief dit « voix off » (pensées) : `codesEnVoixOff`, lib/agents/conversion.ts. */
  codesVoixOff: string[];
  personnages: PersonnageEntree[];
  references: ReferenceEntree[];
};

/** `director` : un des 7 profils, `"aucun"` ou vide = pas de style de mise en scène. `creativity` : un des 4 niveaux (`balanced` = le défaut du paquet, la clé n'est alors pas envoyée).
 * Les valeurs héritées du projet, de la scène ou du plan sont résolues AVANT (lib/h3ir/reglages.ts, `chargerBriefPlan`). */
export type OptionsBrief = { shots?: number | null; director?: string | null; creativity?: string | null };

/** Quel fichier envoyé est quel asset de Cadence : le manifeste du compilateur ne connaît que des empreintes, `liens` (avec les `fichiers` du pont Python,
 * empreinte → chemin) permet de rendre à chaque référence son asset (lib/h3ir/conversion.ts). `type` : celui de la référence du plan (`plan_refs.type`). */
export type LienFichier = { path: string; code: string; type: "picture" | "video" | "audio" };

export type ResultatBrief = { brief: BriefH3ir | null; refus: string | null; avertissements: string[]; liens: LienFichier[] };

/** Une ligne de réplique de la description : « NOM : « texte » ». Un point après le guillemet fermant est toléré (« Katara : « l'Air ». » : sans cela la réplique restait
 * dans la narration et n'était jamais jouée, plan 03 du projet 236). */
const LIGNE_REPLIQUE = /^[\s  ]*([^:«»\n]{1,60}?)[\s  ]*:[\s  ]*«[\s  ]*([\s\S]*?)[\s  ]*»[\s  .]*$/;
const ETAT_DE_FIN = /^[\s  ]*État en fin de plan/i;

/** La typographie française met une espace (souvent insécable) devant `! ? ; :` : le paquet en fait une rupture de son brouillon (h3ir/render.py:407). */
export const normaliserReplique = (texte: string): string =>
  texte
    .replace(/[\s  ]+([!?;:])/g, "$1")
    .replace(/\.{3,}/g, "…")
    .trim();

/** Sépare la description d'un plan en narration (sans « État en fin de plan ») et répliques `{ nom, texte }` dans l'ordre. */
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

/** Un texte entre guillemets droits « "…" » serait pris pour du texte à afficher à l'écran (creativity.build) : on met des chevrons. */
const sansGuillemetsDroits = (texte: string): string => texte.replace(/"([^"]*)"/g, "«$1»").replace(/"/g, "'");

export const estVoixOff = (nom: string) => slugifyCode(nom) === "voix_off";

/** Le personnage du registre qui porte ce nom de locuteur (libellé, sinon code sans préfixe), ou rien. Partagé avec le choix des références (references-plan.ts). */
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

  // --- Références visuelles : au moins une, toutes avec leur fichier, 6 au plus ---
  const visuelles = entree.references.filter((r) => r.type !== "audio").sort((a, b) => a.slot - b.slot);
  if (visuelles.length === 0) return refuser("Le plan n'a aucune image de référence : Open H3 IR passerait en mode texte seul. Ajoute au moins une référence.");
  const sansFichier = visuelles.filter((r) => !r.chemin);
  if (sansFichier.length > 0) {
    return refuser(`Ces références n'ont pas encore de fichier : ${sansFichier.map((r) => r.label?.trim() || r.code).join(", ")}. Crée leurs images d'abord.`);
  }
  if (visuelles.length > MAX_REFS_VISUELLES) {
    return refuser(`Le plan a ${visuelles.length} références visuelles, ${MAX_REFS_VISUELLES} au plus : retires-en ${visuelles.length - MAX_REFS_VISUELLES}.`);
  }

  // --- Description : narration et répliques ---
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

  // --- Assets : les images de ceux qui parlent d'abord (le paquet lie la voix à la première), puis le reste dans l'ordre des emplacements ---
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

  // --- Voix : un audio `voice_timbre` par personnage qui parle et dont la voix est fixée ; sa transcription est la réplique du test ---
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

  // --- Intent : narration, ambiance de la scène (en français à cette étape) ---
  const morceaux = [narration];
  if (entree.scene?.ambiance?.trim()) morceaux.push(`Ambiance : ${entree.scene.ambiance.trim()}`);
  // Pas de titre de scène dans l'intent (décision du 2026-11-02, après les démos) : un titre est un mot de rangement (« Styles ») qui se retrouvait tel quel dans le prompt.
  const intent = sansGuillemetsDroits(morceaux.join("\n\n"));

  // --- Durée, shots, style de mise en scène, seed ---
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
