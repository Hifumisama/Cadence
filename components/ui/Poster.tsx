import { posterBackgroundImage, posterInitiale } from "@/lib/poster";

/** Poster "affiche de film" à trois échelles — carte (accueil, texte
 * complet), sm (en-tête de saison), mini (ligne d'épisode). `src` est déjà
 * résolu par l'appelant (voir lib/media.ts:posterSrc, un accès disque —
 * jamais fait ici, pour rester importable depuis un composant "use client"
 * comme SaisonSection). Sans src, dégradé déterministe + initiale/titre en
 * Marcellus (lib/poster.ts) plutôt qu'une vraie image de repli à générer. */
export function Poster({
  src,
  titre,
  cleRepli,
  taille,
}: {
  src: string | null;
  titre: string;
  /** Clé stable pour le dégradé de repli (ex. "projet:12") — indépendante
   * du titre affiché, pour ne pas changer d'aspect si le titre est édité. */
  cleRepli: string;
  /** "wide" : aperçu 16:9 plus grand utilisé dans les formulaires
   * d'édition (projet/saison/épisode) — distinct de "card" (affiche
   * verticale des cartes projet, accueil). */
  taille: "card" | "wide" | "sm" | "mini";
}) {
  if (src) {
    return (
      <span className={`poster poster-${taille}`} aria-hidden="true">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt="" />
      </span>
    );
  }

  const texte = taille === "card" || taille === "wide" ? titre : posterInitiale(titre);
  return (
    <span
      className={`poster poster-${taille}`}
      style={{ backgroundImage: posterBackgroundImage(cleRepli) }}
      aria-hidden="true"
    >
      <span className="pt">{texte}</span>
    </span>
  );
}
