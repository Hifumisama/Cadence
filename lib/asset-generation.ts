

/** Un essai lancé depuis la fiche attend d'abord que sa consigne française soit traduite en prompt (tâche LLM, skill `prompt-asset`) :
 * il n'entre dans la file d'images qu'ensuite. */
export const STATUT_TRADUCTION = "traduction";

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

/** Deux modes (variante B de la maquette) : « texte » = text-to-image
 * (IMG_01_TextToImage, Krea 2 Turbo) ; « images » = IMG_Simple_Edit
 * (Qwen Image Edit 2511) avec 1 à 3 images sources, la première étant la cible
 * modifiée. Un seul image = modification, plusieurs = fusion de références. */
const MODES_GENERATION = ["texte", "images"] as const;
type ModeGeneration = (typeof MODES_GENERATION)[number];
const MAX_SOURCES = 3;

/** Une image source d'une génération en mode « images », dans l'ordre :
 * - `asset` : l'image courante d'un asset du registre ;
 * - `import` : un fichier déposé à la volée dans la popup (jetable, rangé sous
 *   generations/<assetId>/sources/, jamais rattaché au registre). */
type SourceGeneration =
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
  sources: SourceGeneration[];
};

/** La méthode d'un essai lancé depuis la fiche : **sans image de base, Krea 2** (on crée l'image) ; **avec une image de base, Qwen Image
 * Edit** (on la retouche). Pour un résultat tout autre, on duplique l'asset ou on retire son image : on ne défigure pas l'image actuelle. */
export const methodeDEssai = (aDesImages: boolean): "generation" | "edition" => (aDesImages ? "edition" : "generation");

/** Les images qu'un essai peut porter (Qwen Image Edit en prend 3). Créer à partir d'images jointes : jusqu'à 3, la 1re « porte » les
 * modifications des autres. Retoucher : l'image de base compte pour une, il reste de la place pour deux images jointes. */
const MAX_IMAGES_CREATION = 3;
const MAX_IMAGES_RETOUCHE = 3;
/** Combien d'images jointes (en plus de la base, s'il y en a une) on peut ajouter. */
export const maxImagesJointes = (aUneBase: boolean): number => (aUneBase ? MAX_IMAGES_RETOUCHE - 1 : MAX_IMAGES_CREATION);

/** Pourquoi une consigne ne peut pas partir, ou null. Sans image de base elle peut être vide (l'agent écrit alors le prompt d'après la
 * description de l'asset) ; sans description non plus, il n'y a rien à dessiner. Une retouche exige une consigne. */
export function raisonConsigneInvalide(consigne: string, aUneBase: boolean, description: string | null): string | null {
  if (consigne.trim().length > 2000) return "Consigne trop longue (2 000 caractères au plus).";
  if (consigne.trim()) return null;
  if (aUneBase) return "Dis ce que tu veux changer sur l'image.";
  if (!(description ?? "").trim()) return "Décris l'image que tu veux (ou remplis la description de l'asset).";
  return null;
}

/** Nombre de candidats gardés par asset : les plus anciens sont purgés. */
export const CANDIDATS_GARDES = 8;

/** Format proposé selon le type : les décors et plates suivent le ratio du film
 * (16:9, ~1536×864), l'identité et les détails restent carrés (1024×1024),
 * comme dans le registre. */
export function formatParDefaut(type: string): { aspect: Aspect; megapixels: number } {
  // Une affiche de présentation est un portrait 2:3 (comme les cartes), lib/posters/affiches.ts.
  if (type === "affiche") return { aspect: "2:3", megapixels: 1.3 };
  // Personnage et décor en 16:9 par défaut (retour de recette, 2026-10-05) : meilleurs résultats dans ce ratio, et c'est le
  // format des plans vidéo. Réglable à la main en régénérant l'image.
  if (type === "decor" || type === "personnage") return { aspect: "16:9", megapixels: 1.3 };
  return { aspect: "1:1", megapixels: 1 };
}

// ---------------------------------------------------------------------------
// Master de voix d'un personnage (chantier voix/master, 2026-10-14) : une vidéo de test H3, dont on garde la voix. Méthode de plus
// pour `asset_generations`, sur l'asset personnage ; le résultat est un candidat, « Utiliser comme master » l'adopte.
// ---------------------------------------------------------------------------

/** Master de voix d'un PERSONNAGE (2026-10-14) : la vidéo de test H3 (sans audio fourni, le modèle invente la voix d'après le prompt),
 * avec en plus la voix nettoyée (workflow dédié). Le fichier de la génération est l'AUDIO ; la vidéo est à côté (`videoDeMaster`).
 * `assetId` est le personnage. */
export const METHODE_MASTER_VOIX = "master_voix";


/** Durée de la vidéo de test d'un master : une réplique face caméra tient en huit secondes (prompt T1, lib/voice/voix.ts:promptMasterVoix). */
export const DUREE_TEST_VIDEO_SECONDES = 8;

/** Ce que la génération d'un master fige au lancement : l'image du personnage (chemin relatif à MEDIA_ROOT, null pour une voix off sans
 * visage). */
export type ParametresMasterVoix = { personnage: string | null };

export function parametresMasterVoix(v: unknown): ParametresMasterVoix | null {
  if (typeof v !== "object" || v === null) return null;
  const p = (v as Record<string, unknown>).personnage;
  return { personnage: typeof p === "string" && p.trim() !== "" ? p : null };
}

/** La vidéo de test d'un master vit à côté de son audio, sous le même nom (`<uuid>.mp4`) : rien à mémoriser, rien d'orphelin à la purge. */
export const videoDeMaster = (fichierAudio: string): string => fichierAudio.replace(/\.[^./\\]+$/, "") + ".mp4";

/** « 4 s », « 2,5 s » : durée d'un son pour l'affichage. */
export function formaterDuree(secondes: number): string {
  return `${String(Math.round(secondes * 10) / 10).replace(".", ",")} s`;
}

const MEGAPIXELS_MIN = 0.3;
const MEGAPIXELS_MAX = 4;

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
