/** Resolution of a video render (decision of 2026-10-27): the user chooses 0.2, 0.3 or 0.4 megapixel for the clip (node `22:9` of the workflow).
 *
 * Two regimes, depending on the resolution:
 * - **0.2 MP** (default): the earlier path. Low-resolution preview, then final render with upscale (H3's « latent upscaler » redraws
 *   in latent space: ×2 per side, i.e. 0.8 MP).
 * - **Beyond (0.3 and 0.4)**: the render is directly the FINAL render, native, without upscale (an upscale from 0.4 MP, i.e. 1.6 MP, does not fit on the
 *   card). So there is no preview at these resolutions: the job is created « final » (`jobs.activer_upscale` means « final render », and
 *   the worker decides whether there is actually an upscale).
 *
 * Same seed + same prompt + same references + same duration give the same result at equal resolution. At a different resolution the gesture survives
 * (observed on H3, 2026-10-27) but the render is not identical. Pure, tested. */

export const RESOLUTIONS_VIDEO = [0.2, 0.3, 0.4] as const;
export type ResolutionVideo = (typeof RESOLUTIONS_VIDEO)[number];

const RESOLUTION_PAR_DEFAUT: ResolutionVideo = 0.2;

/** Highest resolution that accepts the upscale. */
const RESOLUTION_UPSCALE_MAX: ResolutionVideo = 0.2;

/** A value read from the database (`real`: 0.20000000298…) or typed, brought back to a known resolution; `null` if it is not one. */
export function resolutionDepuis(valeur: unknown): ResolutionVideo | null {
  const n = Number(valeur);
  if (!Number.isFinite(n)) return null;
  return RESOLUTIONS_VIDEO.find((r) => Math.abs(r - n) < 0.005) ?? null;
}

/** The resolution of a base row; the default if it is unreadable (clip or render from before the column). */
export const resolutionOuDefaut = (valeur: unknown): ResolutionVideo => resolutionDepuis(valeur) ?? RESOLUTION_PAR_DEFAUT;

/** Does this render go through the upscale? It must be final AND at the base resolution. */
export const avecUpscale = (final: boolean, resolution: unknown): boolean => final && resolutionOuDefaut(resolution) <= RESOLUTION_UPSCALE_MAX;

/** A native final render: final, without upscale (resolution above the base). */
export const estFinalNatif = (final: boolean, resolution: unknown): boolean => final && resolutionOuDefaut(resolution) > RESOLUTION_UPSCALE_MAX;
