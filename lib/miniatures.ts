/** Miniatures d'images — partie PURE (aucun import node:*), utilisable côté
 * client comme côté serveur. La génération vit dans lib/miniatures-serveur.ts ;
 * la route /api/media la déclenche quand l'URL porte `?w=<largeur>`.
 *
 * Pourquoi : les PNG d'assets et de candidats font 1,5 à 7 Mo ; les vignettes
 * (40 à 300 px à l'écran) les chargeaient en pleine taille. */

/** Largeurs autorisées (px) — liste blanche : la route refuse toute autre valeur,
 * sinon `?w=` deviendrait un moyen de remplir le disque de miniatures.
 * Dimensionnées pour un écran 2× : 96 (≤ 48 px affichés), 192 (≤ 96 px),
 * 384 (cartes), 768 (aperçu principal, scène de la popup). */
export const LARGEURS_MINIATURE = [96, 192, 384, 768] as const;
export type LargeurMiniature = (typeof LARGEURS_MINIATURE)[number];

export function estLargeurMiniature(n: number): n is LargeurMiniature {
  return (LARGEURS_MINIATURE as readonly number[]).includes(n);
}

/** Largeur lue dans un paramètre d'URL (`?w=192`), ou null si absente ou hors
 * liste blanche. Strict : « 192abc », « 1e2 » ou « 192.0 » sont refusés. */
export function lireLargeur(brut: string | null): LargeurMiniature | null {
  if (brut == null || !/^\d{1,4}$/.test(brut)) return null;
  const n = Number(brut);
  return estLargeurMiniature(n) ? n : null;
}

// GIF exclu : une miniature figerait l'animation.
const EXT_MINIATURISABLES = [".png", ".jpg", ".jpeg", ".webp"];

export function estMiniaturisable(chemin: string): boolean {
  const idx = chemin.lastIndexOf(".");
  return idx !== -1 && EXT_MINIATURISABLES.includes(chemin.slice(idx).toLowerCase());
}

const PREFIXE_ROUTE_MEDIA = "/api/media/";

/** URL de la miniature d'une image servie par /api/media, en conservant le
 * `?v=` de version. Toute autre URL (vidéo, audio, GIF, hors route média) est
 * rendue telle quelle : appeler ce helper n'est jamais dangereux. */
export function urlMiniature(src: string, largeur: LargeurMiniature): string {
  if (!src.startsWith(PREFIXE_ROUTE_MEDIA)) return src;
  const [chemin = "", requete = ""] = src.split("?", 2);
  if (!estMiniaturisable(chemin)) return src;
  const params = new URLSearchParams(requete);
  params.set("w", String(largeur));
  return `${chemin}?${params.toString()}`;
}
