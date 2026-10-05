/** Génération d'images d'un asset — règles pures (sans base ni disque), partagées
 * par l'application et le worker. Voir docs/FRICTIONS.md (tâches ComfyUI) et
 * workflows/README.md (contrat des workflows d'images). */

export const STATUTS_GENERATION = ["en_attente", "en_cours", "termine", "echoue", "annulee"] as const;
export type StatutGeneration = (typeof STATUTS_GENERATION)[number];

export const LIBELLE_STATUT_GENERATION: Record<StatutGeneration, string> = {
  en_attente: "En attente",
  en_cours: "En cours",
  termine: "Terminée",
  echoue: "Échouée",
  annulee: "Annulée",
};

/** Formats proposés, associés aux chaînes exactes du nœud `ResolutionSelector`
 * de ComfyUI (liste relevée dans comfy_extras/nodes_resolution.py). */
export const ASPECTS_COMFYUI = {
  "1:1": "1:1 (Square)",
  "2:3": "2:3 (Portrait Photo)",
  "3:2": "3:2 (Photo)",
  "3:4": "3:4 (Portrait Standard)",
  "4:3": "4:3 (Standard)",
  "9:16": "9:16 (Portrait Widescreen)",
  "16:9": "16:9 (Widescreen)",
  "21:9": "21:9 (Ultrawide)",
} as const;
export type Aspect = keyof typeof ASPECTS_COMFYUI;

export const ASPECTS = Object.keys(ASPECTS_COMFYUI) as Aspect[];

export function estAspect(v: string): v is Aspect {
  return v in ASPECTS_COMFYUI;
}

export const MEGAPIXELS_PROPOSES = [1, 1.3, 2] as const;

/** Deux modes (variante B de la maquette) : « texte » = text-to-image
 * (IMG_01_TextToImage, Krea 2 Turbo) ; « images » = IMG_Simple_Edit
 * (Qwen Image Edit 2511) avec 1 à 3 images sources, la première étant la cible
 * modifiée. Un seul image = modification, plusieurs = fusion de références. */
export const MODES_GENERATION = ["texte", "images"] as const;
export type ModeGeneration = (typeof MODES_GENERATION)[number];
export const MAX_SOURCES = 3;

/** Une image source d'une génération en mode « images », dans l'ordre :
 * - `asset` : l'image courante d'un asset du registre ;
 * - `import` : un fichier déposé à la volée dans la popup (jetable, rangé sous
 *   generations/<assetId>/sources/, jamais rattaché au registre). */
export type SourceGeneration =
  | { origine: "asset"; assetId: number }
  | { origine: "import"; fichier: string };

/** Ce que la popup envoie à `lancerGeneration` (app/assets/generation-actions.ts).
 * Le prompt est un instantané propre à cette demande : il ne devient celui de
 * l'asset que si le candidat est adopté (adopterGeneration). Le format et les
 * mégapixels ne concernent que le mode « texte » (en mode « images » la sortie
 * suit l'image 1, le graphe d'édition n'a pas de nœud de taille). L'édition
 * tourne toujours avec le LoRA Lightning (4 étapes) : le mode « Qualité » sans
 * LoRA, testé, ne change rien au rendu. */
export type DemandeGeneration = {
  mode: ModeGeneration;
  prompt: string;
  aspect: Aspect;
  megapixels: number;
  loraPersonnage: boolean;
  sources: SourceGeneration[];
};

/** Nombre de candidats gardés par asset : les plus anciens sont purgés. */
export const CANDIDATS_GARDES = 8;

/** Format proposé selon le type : les décors et plates suivent le ratio du film
 * (16:9, ~1536×864), l'identité et les détails restent carrés (1024×1024),
 * comme dans le registre. */
export function formatParDefaut(type: string): { aspect: Aspect; megapixels: number } {
  // Personnage et décor en 16:9 par défaut (retour de recette, 2026-10-05) : meilleurs résultats dans ce ratio, et c'est le
  // format des plans vidéo. Réglable à la main en régénérant l'image.
  if (type === "decor" || type === "personnage") return { aspect: "16:9", megapixels: 1.3 };
  return { aspect: "1:1", megapixels: 1 };
}

/** Le LoRA « CharacterDesign » (fiche personnage à 4 vues) n'a de sens que pour
 * un personnage en génération. */
export function loraParDefaut(type: string): boolean {
  return type === "personnage";
}

/** Ce qu'on sait d'un asset pour décider s'il est générable. Les champs de
 * prompt et de méthode ne servent plus : le prompt se vérifie sur la demande
 * (la popup propose celui de l'asset, mais l'utilisateur peut l'écrire). */
export type AssetGenerable = {
  type: string;
  promptGeneration?: string | null;
  methodeGeneration?: string | null;
};

/** Pourquoi on ne peut pas générer d'IMAGE pour cet asset, ou null. La voix est
 * refusée (casting vocal) ; un son (sfx) aussi : il se génère par la popup audio
 * (raisonAudioNonGenerable). */
export function raisonNonGenerable(a: AssetGenerable): string | null {
  if (a.type === "voix") return "Une voix se fabrique au casting vocal, pas par image.";
  if (a.type === "sfx") return "Un son se génère avec la génération audio, pas par image.";
  return null;
}

// ---------------------------------------------------------------------------
// Génération audio (SFX, Stable Audio 3 — workflows/audio/SFX_Generate_Sounds.json).
// Même table que les images (`asset_generations`, méthode « audio ») : la file,
// l'annulation, la reprise et le header en profitent sans duplication. La durée
// est un paramètre du workflow, séparé du prompt.
// ---------------------------------------------------------------------------

export const METHODE_AUDIO = "audio";
export const DUREE_AUDIO_MIN = 1;
export const DUREE_AUDIO_MAX = 60;
export const DUREE_AUDIO_DEFAUT = 4;

/** Ce que la popup audio envoie à `lancerGenerationAudio`. La seed est tirée côté
 * serveur. */
export type DemandeAudio = {
  prompt: string;
  dureeSecondes: number;
};

/** Seuls les assets `sfx` se génèrent en audio (la voix passe par le casting). */
export function raisonAudioNonGenerable(type: string): string | null {
  if (type === "sfx") return null;
  if (type === "voix") return "Une voix se fabrique au casting vocal, pas par la génération audio.";
  return "La génération audio ne concerne que les sons (type sfx).";
}

export function dureeAudioValide(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v) && v >= DUREE_AUDIO_MIN && v <= DUREE_AUDIO_MAX;
}

/** Validation de la structure d'une demande audio (sans base ni disque). */
export function raisonDemandeAudioInvalide(d: DemandeAudio): string | null {
  if (!d.prompt?.trim()) return "Écris le prompt du son.";
  if (!dureeAudioValide(d.dureeSecondes)) return `Durée hors limites (${DUREE_AUDIO_MIN} à ${DUREE_AUDIO_MAX} secondes).`;
  return null;
}

// ---------------------------------------------------------------------------
// Génération d'une VOIX de référence (Qwen3-TTS Voice Design —
// workflows/audio/VOX_Generate_Voice_Simplified.json). Même table et même file que
// les images et les sons (`asset_generations`, méthode « voix »). Le prompt de la
// génération est l'instruction de timbre ; le texte lu, sa langue et la température
// sont des paramètres séparés.
// ---------------------------------------------------------------------------

export const METHODE_VOIX = "voix";
/** « Température » de Qwen3-TTS : le niveau de créativité de la voix. */
export const TEMPERATURE_VOIX_MIN = 0.8;
export const TEMPERATURE_VOIX_MAX = 1.2;
// 1,2 par défaut (retour de recette, 2026-10-05) : la plus expressive aux essais directs sous ComfyUI ; 0,8 à 1,2 reste réglable.
export const TEMPERATURE_VOIX_DEFAUT = 1.2;

/** Ce que le casting envoie à `lancerGenerationVoix`. La seed est tirée côté serveur. */
export type DemandeVoix = {
  instruction: string;
  texteReference: string;
  temperature: number;
};

/** Génération d'une PRISE de réplique (Qwen3-TTS Voice Clone, workflows/audio/VOX_Generate_Replique_Simplified.json) : même
 * table et même file que les images, les sons et les voix de référence ; `asset_generations.repliqueId` désigne la réplique. */
export const METHODE_REPLIQUE = "replique";

export function temperatureVoixValide(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v) && v >= TEMPERATURE_VOIX_MIN && v <= TEMPERATURE_VOIX_MAX;
}

/** Seule une voix (asset de type `voix`) se génère ainsi. */
export function raisonVoixNonGenerable(type: string): string | null {
  return type === "voix" ? null : "La génération de voix ne concerne que les voix du casting (type voix).";
}

/** Validation de la structure d'une demande de voix (sans base ni disque). */
export function raisonDemandeVoixInvalide(d: DemandeVoix): string | null {
  if (!d.instruction?.trim()) return "Écris l'instruction de la voix (étape Voix du casting).";
  if (!d.texteReference?.trim()) return "Écris le texte de référence (étape Voix du casting).";
  if (!temperatureVoixValide(d.temperature)) return `Créativité hors limites (${TEMPERATURE_VOIX_MIN} à ${TEMPERATURE_VOIX_MAX}).`;
  return null;
}

/** Langue du texte lu par Qwen3-TTS : le texte de référence du projet est en anglais (le même pour toutes les
 * voix) ; un texte différent est supposé écrit dans la langue de la fiche de voix. */
export function langueDuTexteDeReference(texte: string, texteParDefaut: string, langueFiche: string): string {
  return texte.trim() === texteParDefaut.trim() ? "English" : langueFiche.trim() || "French";
}

// ---------------------------------------------------------------------------
// Test d'une voix (casting vocal, étape « Test vidéo »). Deux méthodes de plus pour `asset_generations`, sur l'asset
// `voix` : « test_audio » (une réplique dite avec la voix de référence, workflows/audio/VOX_Generate_Replique_Simplified.json)
// puis « test_video » (la voix sur un visage, workflows/video-generation/VID_REF2VA.json). Comme pour les images, le résultat
// est un candidat : « Utiliser » en fait l'audio ou la vidéo de test de la fiche, sans toucher à la voix de référence.
// ---------------------------------------------------------------------------

export const METHODE_TEST_AUDIO = "test_audio";
export const METHODE_TEST_VIDEO = "test_video";

export const estMethodeTestVoix = (m: string): boolean => m === METHODE_TEST_AUDIO || m === METHODE_TEST_VIDEO;

/** Un son pour tout ce qui suit (pas de vignette ni d'aperçu, fichier audio) : un son, une voix, l'audio d'un test. */
export const estMethodeSon = (m: string): boolean => m === METHODE_AUDIO || m === METHODE_VOIX || m === METHODE_TEST_AUDIO || m === METHODE_REPLIQUE;

/** Durée du test vidéo : une réplique face caméra tient en huit secondes (prompt T1, lib/voix.ts:promptTestVoix). */
export const DUREE_TEST_VIDEO_SECONDES = 8;

/** Ce que le test vidéo fige au lancement (`asset_generations.parametres`) : les fichiers de références tels qu'ils étaient quand
 * l'utilisateur a cliqué (le prompt a été composé avec eux), et le mode — prévisualisation rapide (`upscale` faux, sans
 * l'interpolation et l'agrandissement) ou rendu final. Un fichier est un chemin relatif à MEDIA_ROOT. */
export type ParametresTestVideo = {
  upscale: boolean;
  personnage: string | null;
  decor: string | null;
  audio: string | null;
};

export function parametresTestVideo(v: unknown): ParametresTestVideo | null {
  if (typeof v !== "object" || v === null) return null;
  const o = v as Record<string, unknown>;
  const texte = (x: unknown) => (typeof x === "string" && x.trim() !== "" ? x : null);
  if (typeof o.upscale !== "boolean") return null;
  return { upscale: o.upscale, personnage: texte(o.personnage), decor: texte(o.decor), audio: texte(o.audio) };
}

/** Validation d'un test audio (sans base ni disque) : une référence à cloner, un texte à dire. */
export function raisonTestAudioInvalide(v: { texte: string; referenceFichier: string | null }): string | null {
  if (!v.referenceFichier) return "Il faut d'abord une voix de référence (étape Référence) : c'est elle qui est clonée.";
  if (!v.texte?.trim()) return "Écris le texte à tester.";
  return null;
}

/** Validation d'un test vidéo : sans audio, la voix n'est pas testée. */
export function raisonTestVideoInvalide(v: { texte: string; audio: string | null }): string | null {
  if (!v.texte?.trim()) return "Écris le texte à tester.";
  if (!v.audio) return "Pas d'audio à tester : génère l'audio de test, ou dépose la voix de référence.";
  return null;
}

/** « 4 s », « 2,5 s » : durée d'un son pour l'affichage. */
export function formaterDuree(secondes: number): string {
  return `${String(Math.round(secondes * 10) / 10).replace(".", ",")} s`;
}

export const MEGAPIXELS_MIN = 0.3;
export const MEGAPIXELS_MAX = 4;

/** Validation de la structure d'une demande (sans base ni disque : l'existence
 * des sources se vérifie côté action). Renvoie le message à afficher, ou null. */
export function raisonDemandeInvalide(d: DemandeGeneration): string | null {
  if (!d.prompt?.trim()) return "Écris le prompt de la génération.";
  if (!(MODES_GENERATION as readonly string[]).includes(d.mode)) return "Mode de génération inconnu.";

  if (d.mode === "texte") {
    if (!estAspect(d.aspect)) return "Format inconnu.";
    if (!Number.isFinite(d.megapixels) || d.megapixels < MEGAPIXELS_MIN || d.megapixels > MEGAPIXELS_MAX) {
      return "Mégapixels hors limites (0,3 à 4).";
    }
    return null;
  }

  if (!Array.isArray(d.sources) || d.sources.length === 0) {
    return "Ajoute au moins une image : la première est celle qui sera modifiée.";
  }
  if (d.sources.length > MAX_SOURCES) return `${MAX_SOURCES} images au maximum.`;
  const vues = new Set<string>();
  for (const src of d.sources) {
    const cle = src.origine === "asset" ? `asset:${src.assetId}` : src.origine === "import" ? `import:${src.fichier}` : "";
    if (!cle) return "Source d'image inconnue.";
    if (vues.has(cle)) return "La même image ne peut pas servir deux fois.";
    vues.add(cle);
  }
  return null;
}

/** Nom d'une source une fois envoyée à ComfyUI (dossier d'entrée partagé) : unique
 * par génération et par rang, pour ne jamais écraser l'image d'une autre tâche. */
export function nomSourceDistante(genUuid: string, rang: number, ext: string): string {
  return `cadence_${genUuid}_${rang}${ext}`;
}

/** Seed aléatoire (entier < 2^48, sûr en nombre JS), stockée en texte comme
 * `plans.seed`. */
export function nouvelleSeed(): string {
  return String(Math.floor(Math.random() * 2 ** 48));
}

/** Nom de la voix de référence une fois envoyée à ComfyUI (dossier d'entrée partagé) : porte la date de modification du fichier,
 * pour qu'une référence REMPLACÉE ne resserve jamais l'ancienne copie du même nom. */
export function nomReferenceVoixDistante(codeVoix: string, mtimeMs: number, ext: string): string {
  return `cadence_voixref_${codeVoix}_${Math.floor(mtimeMs)}${ext || ".mp3"}`;
}

/** Ce que le test audio fige au lancement : la voix de référence à cloner, telle qu'elle était (chemin relatif à MEDIA_ROOT, sous
 * `assets/`) — la remplacer pendant que la demande attend ne change pas ce test. */
export type ParametresTestAudio = { reference: string };

export function parametresTestAudio(v: unknown): ParametresTestAudio | null {
  if (typeof v !== "object" || v === null) return null;
  const r = (v as Record<string, unknown>).reference;
  return typeof r === "string" && r.trim() !== "" ? { reference: r } : null;
}
