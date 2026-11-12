/** La grille d'images d'un rendu vidéo : 24 images par seconde, nombre d'images de la forme 17k+5 (lib/etapes-video.ts, nœud « nombre d'images » du workflow :
 * `max(5, round(a * 24)) + (5 - (max(5, round(a * 24)) % 17)) % 17`, reproduit par worker/comfyui/mapping.test.ts). Open H3 IR arrondit de la même façon
 * (h3ir/grid.py:58-83). La durée EFFECTIVE d'un plan est donc celle de ses images, pas la durée demandée : 5 s → 5,167 s, 6 s → 6,583 s, 7 s → 7,292 s, 8 s → 8,000 s
 * (192 images, déjà sur la grille), 9 s → 9,417 s, 10 s → 10,125 s. Les contrôles de la fiche raisonnent sur celle-ci. Pur. */

const IMAGES_PAR_SECONDE = 24;

/** Le nombre d'images que le rendu produira pour `secondes` demandées. */
export function imagesPourSecondes(secondes: number): number {
  const n = Math.max(5, Math.round(secondes * IMAGES_PAR_SECONDE));
  return n + ((((5 - n) % 17) + 17) % 17);
}

/** La durée réelle d'un rendu demandé à `secondes`, en secondes. */
export function dureeEffectiveSecondes(secondes: number): number {
  return imagesPourSecondes(secondes) / IMAGES_PAR_SECONDE;
}
