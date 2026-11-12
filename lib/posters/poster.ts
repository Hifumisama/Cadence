/** Visual fallback of posters (project/episode) when no file is
 * provided — a gradient from the `.preview-frame` family, chosen
 * deterministically from a hash of the name (same parameter → same render
 * at each display, no flash on reload). Ported from the
 * Opus mockup of 2026-09-28 (see docs/FRICTIONS.md). */

function hashFnv1a(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const DUOS: [string, string][] = [
  ["240,208,137", "200,16,46"],
  ["240,208,137", "211,121,63"],
  ["211,121,63", "122,15,34"],
  ["201,162,75", "200,16,46"],
  ["240,208,137", "122,15,34"],
  ["211,121,63", "200,16,46"],
];

/** CSS `background-image` (3 radial gradients) for the given key — pass
 * a stable identifier (e.g. `"projet:12"`, `"episode:12"`), not the name
 * displayed (which may change without the poster having to change its look). */
export function posterBackgroundImage(key: string): string {
  const r = mulberry32(hashFnv1a(key));
  const duo = DUOS[Math.floor(r() * DUOS.length)]!;
  const x1 = Math.round(10 + r() * 45);
  const y1 = Math.round(15 + r() * 35);
  const x2 = Math.round(45 + r() * 45);
  const y2 = Math.round(55 + r() * 35);
  const x3 = Math.round(25 + r() * 50);
  const a1 = (0.22 + r() * 0.2).toFixed(2);
  const a2 = (0.28 + r() * 0.22).toFixed(2);
  const a3 = (0.25 + r() * 0.3).toFixed(2);
  return [
    `radial-gradient(60% 80% at ${x1}% ${y1}%, rgba(${duo[0]},${a1}), transparent 62%)`,
    `radial-gradient(70% 90% at ${x2}% ${y2}%, rgba(${duo[1]},${a2}), transparent 66%)`,
    `radial-gradient(120% 120% at ${x3}% 100%, rgba(122,15,34,${a3}), transparent 70%)`,
  ].join(", ");
}

/** First letter of the title, leading article ignored ("La porte d'Anfa" ->
 * "P") — used on posters too small for full text
 * (episode). "·" if the title is empty ("Sans titre" (Untitled) by default). */
export function posterInitiale(titre: string): string {
  const sansArticle = titre.replace(/^(les|le|la|l'|une|un)\s+|^l'/i, "");
  const match = sansArticle.match(/[A-Za-zÀ-ÿ]/);
  return match ? match[0]!.toUpperCase() : "·";
}

/** A poster whose title the model wrote carries the `-titre` suffix in its file name (see
 * lib/posters/poster-application.ts): the Poster component then does not overlay the title a second time. */
export const SUFFIXE_TITRE = "-titre";

export function posterPorteLeTitre(src: string | null): boolean {
  return src != null && /-titre\.[a-z0-9]+(\?.*)?$/i.test(src);
}
