import brut from "./bibliotheque.json";
import { clausesProduites } from "./clause";
import type { FiltresStyle } from "./filters";

export * from "./filters";

/** Style library offered when creating a project. Source: `bibliotheque.json` (versioned, it is the file
 * to sort by hand: removing an entry is enough to remove it from the application). Each style has a long prompt (the
 * descriptor, in English, which goes to Krea 2). Its presentation images are the common scenes of `subjects.ts`
 * rendered in this style. The short clause for video (H3) is an optional field: as long as an entry has none,
 * the application cannot offer it as a ready-to-use style (see `styleUtilisable`). */

export type StyleBibliotheque = {
  /** Stable identifier: slug of the original name. File name of the preview. */
  id: string;
  nom: string;
  /** Long prompt of the style (English). */
  descriptor: string;
  categories: string[];
  filtres: FiltresStyle;
  /** Short clause for video (1 to 2 English sentences, rendered only), once it has been produced. */
  clause?: string;
};

type EntreeBrute = Omit<StyleBibliotheque, "id" | "nom"> & { name: string };

/** « Ghibli Style » → « ghibli-style ». Accents removed, everything else becomes a dash. */
export function slugStyle(nom: string): string {
  return nom
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Converts the raw entries; rejects two names that yield the same identifier (it serves as the file name). */
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

/** Path relative to MEDIA_ROOT of a style's presentation image for a subject (`subjects.ts`). */
export function cheminApercuStyle(id: string, sujet: string): string {
  return `styles/${id}/${sujet}.webp`;
}

/** A library style can be used as is for a project when it has its short clause. */
export function styleUtilisable(s: StyleBibliotheque): boolean {
  return !!s.clause && s.clause.trim().length > 0;
}
