import type { EtatPlan } from "./fiche-plan";

/** Un plan tel que la page Scénario le montre. `position` est le rang dans l'épisode (ce qu'on affiche), jamais un identifiant ;
 * `debut` est le minutage de départ du plan dans le film (somme des durées des plans qui le précèdent, scènes dans l'ordre). */
export type PlanVue = {
  id: number;
  uuid: string;
  position: number;
  titre: string;
  description: string | null;
  statut: string;
  duree: number;
  debut: number;
  etat: EtatPlan;
  /** Vidéo dont on tire la vignette (rendu retenu, sinon dernier rendu terminé), null sans rendu. */
  src: string | null;
  href: string;
};

/** Une scène (id null = « Sans scène », la zone où l'on dépose un plan pour le détacher). */
export type SceneVue = {
  id: number | null;
  titre: string;
  fonction: string | null;
  genre: string | null;
  ambiance: string | null;
  duree: number;
  plans: PlanVue[];
};

/** Clé d'une scène dans l'URL (`?scene=`) et dans l'état de la page. */
export const cleScene = (id: number | null): string => (id == null ? "sans" : String(id));

/** 95 → « 1:35 » ; 8 → « 0:08 ». */
export function minutage(secondes: number): string {
  const total = Math.max(0, Math.round(secondes));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

/** 1 → « I », 4 → « IV », 14 → « XIV » (numéro de scène). */
export function romain(n: number): string {
  const table: [number, string][] = [[10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"]];
  let reste = n;
  let sortie = "";
  for (const [valeur, signe] of table) {
    while (reste >= valeur) {
      sortie += signe;
      reste -= valeur;
    }
  }
  return sortie || String(n);
}
