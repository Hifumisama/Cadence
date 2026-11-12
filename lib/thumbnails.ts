/** Image thumbnails — PURE part (no node:* import), usable client-side
 * as well as server-side. Generation lives in lib/thumbnails-server.ts;
 * the /api/media route triggers it when the URL carries `?w=<largeur>`.
 *
 * Why: the PNGs of assets and candidates weigh 1.5 to 7 MB; the thumbnails
 * (40 to 300 px on screen) were loading them at full size. */

/** Allowed widths (px) — allowlist: the route refuses any other value,
 * otherwise `?w=` would become a way to fill the disk with thumbnails.
 * Sized for a 2× screen: 96 (≤ 48 px displayed), 192 (≤ 96 px),
 * 384 (cards), 768 (main preview, scene of the popup). */
const LARGEURS_MINIATURE = [96, 192, 384, 768] as const;
export type LargeurMiniature = (typeof LARGEURS_MINIATURE)[number];

export function estLargeurMiniature(n: number): n is LargeurMiniature {
  return (LARGEURS_MINIATURE as readonly number[]).includes(n);
}

/** Width read from a URL parameter (`?w=192`), or null if absent or outside the
 * allowlist. Strict: « 192abc », « 1e2 » or « 192.0 » are refused. */
export function lireLargeur(brut: string | null): LargeurMiniature | null {
  if (brut == null || !/^\d{1,4}$/.test(brut)) return null;
  const n = Number(brut);
  return estLargeurMiniature(n) ? n : null;
}

// GIF excluded: a thumbnail would freeze the animation.
const EXT_MINIATURISABLES = [".png", ".jpg", ".jpeg", ".webp"];

export function estMiniaturisable(chemin: string): boolean {
  const idx = chemin.lastIndexOf(".");
  return idx !== -1 && EXT_MINIATURISABLES.includes(chemin.slice(idx).toLowerCase());
}

const PREFIXE_ROUTE_MEDIA = "/api/media/";

/** Thumbnail URL of an image served by /api/media, keeping the
 * `?v=` version. Any other URL (video, audio, GIF, outside the media route) is
 * returned as it is: calling this helper is never dangerous. */
export function urlMiniature(src: string, largeur: LargeurMiniature): string {
  if (!src.startsWith(PREFIXE_ROUTE_MEDIA)) return src;
  const [chemin = "", requete = ""] = src.split("?", 2);
  if (!estMiniaturisable(chemin)) return src;
  const params = new URLSearchParams(requete);
  params.set("w", String(largeur));
  return `${chemin}?${params.toString()}`;
}
