import type { EtatPlan } from "./clip-sheet";

/** The states of a clip as the Scénario page states them. « Brouillon » would be misleading there: the episode header calls a clip whose sheet
 * is not developed a draft, whereas the state derived here only says that no attempt has been launched. */
export const LIBELLE_ETAT: Record<EtatPlan, string> = {
  brouillon: "Pas encore tourné",
  iteration: "En itération",
  pret: "Prêt à upscaler",
};

/** A clip as the Scénario page shows it. `position` is the rank in the episode (what is displayed), never an identifier;
 * `debut` is the start timing of the clip in the film (sum of the durations of the clips before it, scenes in order). */
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
  /** Video from which the thumbnail is taken (kept render, otherwise last finished render), null without render. */
  src: string | null;
  href: string;
  /** The « Générer la fiche » request in progress on this clip, if there is one. */
  ficheEnCours: number | null;
  /** The clip's text has changed since its sheet (`fiche`) or since its last render (`rendu`); null = nothing to report (lib/clips/stale-intention.ts). */
  intentionChangee: "fiche" | "rendu" | null;
};

/** What the « texte modifié » marker of a clip says, by what needs redoing. */
export const LIBELLE_INTENTION_CHANGEE: Record<"fiche" | "rendu", string> = {
  fiche: "Texte modifié · fiche à régénérer",
  rendu: "Texte modifié · rendu à refaire",
};

/** A scene (id null = « Sans scène », the zone where a clip is dropped to detach it). */
export type SceneVue = {
  id: number | null;
  titre: string;
  fonction: string | null;
  ambiance: string | null;
  /** Open H3 IR (lib/h3ir/settings.ts): null = the scene inherits from the project; style « aucun » = no style despite that of the project. */
  creativite: string | null;
  styleCamera: string | null;
  duree: number;
  plans: PlanVue[];
};

/** A clip being written (« Ajouter un plan »): the page keeps its place for it, as a ghost card, until it is added. */
export type AjoutEnCours = {
  /** The request (key of the task in the queue: `demande:<id>`). */
  id: number;
  sceneId: number | null;
  position: { apresPlanUuid: string } | { debut: true };
  consigne: string;
};

/** A scene being written (« Nouvelle scène »): the page keeps its place for it in the banner, as a ghost card. */
export type AjoutSceneEnCours = {
  /** The request (key of the task in the queue: `demande:<id>`). */
  id: number;
  place: { apresSceneId: number } | { debut: true };
  consigne: string;
};

/** Key of a scene in the URL (`?scene=`) and in the page state. */
export const cleScene = (id: number | null): string => (id == null ? "sans" : String(id));

/** 95 → « 1:35 » ; 8 → « 0:08 ». */
export function minutage(secondes: number): string {
  const total = Math.max(0, Math.round(secondes));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

/** 1 → « I », 4 → « IV », 14 → « XIV » (scene number). */
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
