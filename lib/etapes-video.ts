/** Les étapes d'un rendu vidéo (docs/PLAN_INTEGRATION_WORKER.md) : une prévisualisation est la génération ; un rendu final est l'upscale puis la finition,
 * précédés de la génération quand on ne peut pas partir d'un latent de prévisualisation encore valable. Pur, testé. */
/** Résolution de la génération : verrouillée à 0,4 MP (décision du 2026-10-29). */
export const MEGAPIXELS_VIDEO = 0.4;

export type EtapeVideo = "generation" | "upscale" | "finition";

export function etapesDuRendu(final: boolean, latentSourceValable: boolean): EtapeVideo[] {
  if (!final) return ["generation"];
  return latentSourceValable ? ["upscale", "finition"] : ["generation", "upscale", "finition"];
}

/** Ce qui rend le latent d'une prévisualisation inutilisable pour un rendu final : il n'a pas été gardé, ou la fiche a changé depuis. */
export type RaisonSourceInvalide = "pas_de_source" | "pas_termine" | "pas_de_latent" | "fiche_modifiee";

export function raisonSourceInvalide(source: { statut: string; latentDossier: string | null } | null, ficheModifiee: boolean): RaisonSourceInvalide | null {
  if (!source) return "pas_de_source";
  if (source.statut !== "termine") return "pas_termine";
  if (!source.latentDossier) return "pas_de_latent";
  return ficheModifiee ? "fiche_modifiee" : null;
}

export const LIBELLE_SOURCE_INVALIDE: Record<RaisonSourceInvalide, string> = {
  pas_de_source: "aucune prévisualisation retenue",
  pas_termine: "la prévisualisation n'est pas terminée",
  pas_de_latent: "la prévisualisation n'a pas gardé son latent",
  fiche_modifiee: "la fiche a changé depuis la prévisualisation",
};
