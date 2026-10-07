/** Filtres de la bibliothèque de styles : types et fonctions pures, SANS le fichier de la bibliothèque (le client les importe sans
 * embarquer 250 Ko de JSON). Les fonctions sont génériques : elles marchent sur une entrée complète ou sur sa vue allégée. */

export type FiltresStyle = {
  medium: string;
  rendu: string[];
  palette: string[];
  epoque: string;
  ambiance: string[];
};

export type AxeFiltre = keyof FiltresStyle;
export const AXES_FILTRE: readonly AxeFiltre[] = ["medium", "rendu", "palette", "epoque", "ambiance"];

type Filtrable = { nom: string; categories: string[]; filtres: FiltresStyle };

const valeursDe = (v: string | string[]): string[] => (Array.isArray(v) ? v : [v]);

/** Valeurs distinctes d'un axe, avec leur effectif, triées par effectif décroissant (puis alphabétique). */
export function valeursFiltre<T extends Filtrable>(styles: readonly T[], axe: AxeFiltre): { valeur: string; effectif: number }[] {
  const compte = new Map<string, number>();
  for (const s of styles) for (const x of valeursDe(s.filtres[axe])) compte.set(x, (compte.get(x) ?? 0) + 1);
  return [...compte.entries()]
    .map(([valeur, effectif]) => ({ valeur, effectif }))
    .sort((a, b) => b.effectif - a.effectif || a.valeur.localeCompare(b.valeur, "fr"));
}

export type CritereStyles = {
  recherche?: string;
  categorie?: string;
  /** Un style doit avoir au moins une des valeurs cochées sur chaque axe renseigné (ET entre axes, OU dans un axe). */
  filtres?: Partial<Record<AxeFiltre, string[]>>;
};

export function filtrerStyles<T extends Filtrable>(styles: readonly T[], c: CritereStyles): T[] {
  const q = (c.recherche ?? "").trim().toLowerCase();
  return styles.filter((s) => {
    if (q && !`${s.nom} ${s.categories.join(" ")}`.toLowerCase().includes(q)) return false;
    if (c.categorie && !s.categories.includes(c.categorie)) return false;
    for (const [axe, valeurs] of Object.entries(c.filtres ?? {}) as [AxeFiltre, string[]][]) {
      if (!valeurs?.length) continue;
      const propres = valeursDe(s.filtres[axe]);
      if (!valeurs.some((x) => propres.includes(x))) return false;
    }
    return true;
  });
}
