/** The steps of a video render (docs/PLAN_INTEGRATION_WORKER.md): a preview is the generation; a final render is the upscale then the finishing,
 * preceded by the generation when one cannot start from a still-valid preview latent. Pure, tested. */
/** Resolution of the generation: locked at 0.4 MP (decision of 2026-10-29). */
export const MEGAPIXELS_VIDEO = 0.4;

export type EtapeVideo = "generation" | "upscale" | "finition";

export function etapesDuRendu(final: boolean, latentSourceValable: boolean): EtapeVideo[] {
  if (!final) return ["generation"];
  return latentSourceValable ? ["upscale", "finition"] : ["generation", "upscale", "finition"];
}

/** What makes a preview's latent unusable for a final render: it was not kept, or the sheet has changed since. */
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

/** How a clip in « suite » extends the previous one: `latent` (Motion Context: the last 22 images and the audio of the previous clip enter the
 * generation, the finishing removes this prefix) or `image` (the previous one's last image as first image: the fallback, without a latent to take up). */
export type Continuite = "latent" | "image";

/** A render from before the `continuite` column that has a recorded continuity is an image continuity. */
export const continuiteEffective = (job: { continuite: string | null; raccordJobId: number | null }): Continuite | null =>
  job.continuite === "latent" || job.continuite === "image" ? job.continuite : job.raccordJobId != null ? "image" : null;

/** The image continuity to replay for the upscale of a preview: `null` (none) when it extended its predecessor through the latent, because its
 * conditioning then contained no continuity image. */
export const raccordImageARejouer = (job: { continuite: string | null; raccordJobId: number | null }): number | null =>
  continuiteEffective(job) === "image" ? job.raccordJobId : null;
