/** Génération d'images d'un asset — règles pures (sans base ni disque), partagées
 * par l'application et le worker. Voir docs/FRICTIONS.md (tâches ComfyUI) et
 * workflows/README.md (contrat des workflows d'images). */

export const STATUTS_GENERATION = ["en_attente", "en_cours", "termine", "echoue"] as const;
export type StatutGeneration = (typeof STATUTS_GENERATION)[number];

export const LIBELLE_STATUT_GENERATION: Record<StatutGeneration, string> = {
  en_attente: "En attente",
  en_cours: "En cours",
  termine: "Terminée",
  echoue: "Échouée",
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
  if (type === "decor") return { aspect: "16:9", megapixels: 1.3 };
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

/** Pourquoi on ne peut pas générer pour cet asset, ou null. Seule la voix est
 * refusée : sa fabrication passe par le casting vocal. */
export function raisonNonGenerable(a: AssetGenerable): string | null {
  if (a.type === "voix") return "Une voix se fabrique au casting vocal, pas par image.";
  return null;
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
