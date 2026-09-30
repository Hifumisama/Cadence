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

export type AssetGenerable = {
  type: string;
  promptGeneration: string | null;
  methodeGeneration: string | null;
};

/** Pourquoi on ne peut pas générer, ou null. */
export function raisonNonGenerable(a: AssetGenerable): string | null {
  if (a.type === "voix") return "Une voix se fabrique au casting vocal, pas par image.";
  if (a.methodeGeneration === "edition") return "L'édition d'image n'est pas encore branchée : passe la méthode en génération pour utiliser Krea 2.";
  if (!a.promptGeneration?.trim()) return "Écris d'abord le prompt de génération.";
  return null;
}

/** Seed aléatoire (entier < 2^48, sûr en nombre JS), stockée en texte comme
 * `plans.seed`. */
export function nouvelleSeed(): string {
  return String(Math.floor(Math.random() * 2 ** 48));
}
