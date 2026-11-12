import type { EtatPlan } from "./clip-sheet";

/** Les états d'un plan tels que la page Scénario les dit. « Brouillon » y serait trompeur : l'en-tête d'épisode appelle brouillon un plan dont la fiche
 * n'est pas développée, alors que l'état dérivé ici dit seulement qu'aucun essai n'a été lancé. */
export const LIBELLE_ETAT: Record<EtatPlan, string> = {
  brouillon: "Pas encore tourné",
  iteration: "En itération",
  pret: "Prêt à upscaler",
};

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
  /** La demande « Générer la fiche » en cours sur ce plan, s'il y en a une. */
  ficheEnCours: number | null;
  /** Le texte du plan a changé depuis sa fiche (`fiche`) ou depuis son dernier rendu (`rendu`) ; null = rien à signaler (lib/clips/stale-intention.ts). */
  intentionChangee: "fiche" | "rendu" | null;
};

/** Ce que dit le repère « texte modifié » d'un plan, par ce qui est à refaire. */
export const LIBELLE_INTENTION_CHANGEE: Record<"fiche" | "rendu", string> = {
  fiche: "Texte modifié · fiche à régénérer",
  rendu: "Texte modifié · rendu à refaire",
};

/** Une scène (id null = « Sans scène », la zone où l'on dépose un plan pour le détacher). */
export type SceneVue = {
  id: number | null;
  titre: string;
  fonction: string | null;
  ambiance: string | null;
  /** Open H3 IR (lib/h3ir/settings.ts) : null = la scène hérite du projet ; style « aucun » = pas de style malgré celui du projet. */
  creativite: string | null;
  styleCamera: string | null;
  duree: number;
  plans: PlanVue[];
};

/** Un plan en cours d'écriture (« Ajouter un plan ») : la page lui garde sa place, sous forme de carte fantôme, jusqu'à ce qu'il soit ajouté. */
export type AjoutEnCours = {
  /** La demande (clé de la tâche dans la file : `demande:<id>`). */
  id: number;
  sceneId: number | null;
  position: { apresPlanUuid: string } | { debut: true };
  consigne: string;
};

/** Une scène en cours d'écriture (« Nouvelle scène ») : la page lui garde sa place dans le bandeau, sous forme de carte fantôme. */
export type AjoutSceneEnCours = {
  /** La demande (clé de la tâche dans la file : `demande:<id>`). */
  id: number;
  place: { apresSceneId: number } | { debut: true };
  consigne: string;
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
  const table: [number, string][] = [[100, "C"], [90, "XC"], [50, "L"], [40, "XL"], [10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"]];
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
