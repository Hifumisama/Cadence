/** The image grid of a video render: 24 images per second, number of images of the form 17k+5 (lib/renders/video-steps.ts, « nombre d'images » node of the workflow:
 * `max(5, round(a * 24)) + (5 - (max(5, round(a * 24)) % 17)) % 17`, reproduced by worker/comfyui/mapping.test.ts). Open H3 IR rounds the same way
 * (h3ir/grid.py:58-83). The EFFECTIVE duration of a clip is thus that of its images, not the requested duration: 5 s → 5.167 s, 6 s → 6.583 s, 7 s → 7.292 s, 8 s → 8.000 s
 * (192 images, already on the grid), 9 s → 9.417 s, 10 s → 10.125 s. The sheet's checks reason on this one. Pure. */

const IMAGES_PAR_SECONDE = 24;

/** The number of images the render will produce for `secondes` requested. */
export function imagesPourSecondes(secondes: number): number {
  const n = Math.max(5, Math.round(secondes * IMAGES_PAR_SECONDE));
  return n + ((((5 - n) % 17) + 17) % 17);
}

/** The real duration of a render requested at `secondes`, in seconds. */
export function dureeEffectiveSecondes(secondes: number): number {
  return imagesPourSecondes(secondes) / IMAGES_PAR_SECONDE;
}
