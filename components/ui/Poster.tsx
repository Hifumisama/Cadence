import { posterBackgroundImage, posterInitiale, posterPorteLeTitre } from "@/lib/poster";

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
  /** Toutes les affiches sont en 2:3. "apercu" : petite affiche des en-têtes et des formulaires d'édition
   * (projet/saison/épisode) — distincte de "card" (grande affiche des cartes projet, accueil). */
  taille: "card" | "apercu" | "sm" | "mini";
}) {
  if (src) {
    return (
      <span className={`poster poster-${taille}`} aria-hidden="true">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt="" />
        {/* Le titre se superpose à l'image, comme sur le dégradé de repli : il n'est jamais incrusté dans le fichier
            (une affiche générée n'en contient pas), donc il reste net, suit le renommage et se lit sur chaque carte.
            Aux petites tailles (saison, épisode) l'image seule suffit. */}
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
      {/* Grande initiale en filigrane : sans affiche, les dégradés d'une même palette se ressemblent, l'initiale
          fait la différence d'un coup d'œil. Réservée aux grandes cartes (le titre complet y est déjà écrit). */}
      {taille === "card" ? (
        <span className="pi" aria-hidden="true">
          {posterInitiale(titre)}
        </span>
      ) : null}
      <span className="pt">{texte}</span>
    </span>
  );
}
