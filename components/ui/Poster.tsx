import { posterBackgroundImage, posterInitiale, posterPorteLeTitre } from "@/lib/posters/poster";

/** Film poster ("affiche de film") at three scales — card (home, full
 * text), sm (season header), mini (episode row). `src` is already
 * resolved by the caller (see lib/media.ts:posterSrc, a disk access —
 * never done here, so that it stays importable from a "use client" component
 * such as SaisonSection). Without src, deterministic gradient + initial/title in
 * Marcellus (lib/posters/poster.ts) rather than a real fallback image to generate. */
export function Poster({
  src,
  titre,
  cleRepli,
  taille,
}: {
  src: string | null;
  titre: string;
  /** Stable key for the fallback gradient (e.g. "projet:12") — independent
   * of the displayed title, so that it does not change look if the title is edited. */
  cleRepli: string;
  /** All posters are 2:3. "apercu": small poster for headers and edit forms
   * (project/season/episode) — distinct from "card" (large poster of the project cards, home). */
  taille: "card" | "apercu" | "sm" | "mini";
}) {
  if (src) {
    return (
      <span className={`poster poster-${taille}`} aria-hidden="true">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt="" />
        {/* The title overlays the image, as on the fallback gradient: it is never burned into the file
            (a generated poster does not contain it), so it stays sharp, follows renaming and reads on every card.
            At small sizes (season, episode) the image alone is enough. */}
        {(taille === "card" || taille === "apercu") && !posterPorteLeTitre(src) ? <span className="pt">{titre}</span> : null}
      </span>
    );
  }

  const texte = taille === "card" || taille === "apercu" ? titre : posterInitiale(titre);
  return (
    <span
      className={`poster poster-${taille}`}
      style={{ backgroundImage: posterBackgroundImage(cleRepli) }}
      aria-hidden="true"
    >
      {/* Large watermark initial: without a poster, the gradients of one palette look alike, the initial
          makes the difference at a glance. Reserved for large cards (the full title is already written there). */}
      {taille === "card" ? (
        <span className="pi" aria-hidden="true">
          {posterInitiale(titre)}
        </span>
      ) : null}
      <span className="pt">{texte}</span>
    </span>
  );
}
