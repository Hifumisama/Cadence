import brut from "./bibliotheque.json";
import { clausesProduites } from "./clause";
import type { FiltresStyle } from "./filtres";

export * from "./filtres";

/** Bibliothèque de styles proposée à la création d'un projet. Source : `bibliotheque.json` (versionné, c'est le fichier
 * à trier à la main : retirer une entrée suffit à la retirer de l'application). Chaque style a un prompt long (le
 * descripteur, en anglais, qui part vers Krea 2) et un prompt d'aperçu = une scène commune + ce descripteur. La clause
 * courte pour la vidéo (H3) est un champ facultatif : tant qu'une entrée n'en a pas, l'application ne peut pas la
 * proposer comme style prêt à l'emploi (voir `styleUtilisable`). */

export type StyleBibliotheque = {
  /** Identifiant stable : slug du nom d'origine. Nom de fichier de l'aperçu. */
  id: string;
  nom: string;
  /** Prompt long du style (anglais). */
  descriptor: string;
  /** Scène d'aperçu + descripteur : le prompt complet d'une image de présentation. */
  promptApercu: string;
  /** Famille de scène d'aperçu (base, fantasy, photo…). */
  varianteApercu: string;
  categories: string[];
  filtres: FiltresStyle;
  /** Clause courte pour la vidéo (1 à 2 phrases d'anglais, rendu seulement), quand elle a été produite. */
  clause?: string;
};

type EntreeBrute = Omit<StyleBibliotheque, "id" | "nom"> & { name: string };

/** « Ghibli Style » → « ghibli-style ». Accents retirés, tout le reste devient un tiret. */
export function slugStyle(nom: string): string {
  return nom
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Convertit les entrées brutes ; refuse deux noms qui donnent le même identifiant (il sert de nom de fichier). */
export function construireBibliotheque(entrees: EntreeBrute[]): StyleBibliotheque[] {
  const vus = new Map<string, string>();
  return entrees.map(({ name, ...reste }) => {
    const id = slugStyle(name);
    if (!id) throw new Error(`Style « ${name} » : identifiant vide`);
    const autre = vus.get(id);
    if (autre) throw new Error(`Styles « ${autre} » et « ${name} » : même identifiant « ${id} »`);
    vus.set(id, name);
    return { id, nom: name, ...reste };
  });
}

export function bibliothequeStyles(): StyleBibliotheque[] {
  return construireBibliotheque(brut as unknown as EntreeBrute[]).map((s) => (s.clause ? s : clausesProduites[s.id] ? { ...s, clause: clausesProduites[s.id] } : s));
}

export function styleParId(id: string): StyleBibliotheque | null {
  return bibliothequeStyles().find((s) => s.id === id) ?? null;
}

/** La scène seule (sans le style) : ce que reçoit le nœud « prompt » du workflow d'image, le descripteur allant dans
 * le nœud « style ». Erreur franche si le prompt d'aperçu ne se termine plus par le descripteur. */
export function sceneApercu(s: Pick<StyleBibliotheque, "nom" | "promptApercu" | "descriptor">): string {
  if (!s.promptApercu.endsWith(s.descriptor)) {
    throw new Error(`Style « ${s.nom} » : le prompt d'aperçu ne se termine pas par le descripteur`);
  }
  return s.promptApercu.slice(0, s.promptApercu.length - s.descriptor.length).trim();
}

/** Chemin relatif à MEDIA_ROOT de l'image de présentation (2:3). */
export function cheminApercuStyle(id: string): string {
  return `styles/${id}.webp`;
}

/** Un style de la bibliothèque est utilisable tel quel pour un projet quand il a sa clause courte. */
export function styleUtilisable(s: StyleBibliotheque): boolean {
  return !!s.clause && s.clause.trim().length > 0;
}
