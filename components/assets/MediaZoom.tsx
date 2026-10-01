"use client";

import { useRef } from "react";

/** Aperçu cliquable : ouvre l'asset en taille réelle dans une fenêtre modale
 * (<dialog> natif : Échap et clic sur le fond ferment). Image : clic sur
 * l'image. Vidéo : bouton d'agrandissement, car un clic sur la vidéo pilote
 * ses contrôles. */
export function MediaZoom({
  kind,
  src,
  apercu,
  alt,
  classe,
}: {
  kind: "image" | "video";
  src: string;
  /** Miniature affichée à la place de l'original (image seulement) : l'original
   * ne se charge qu'à l'ouverture de la fenêtre agrandie. */
  apercu?: string;
  alt: string;
  classe: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const ouvrir = () => ref.current?.showModal();
  const fermer = () => {
    const d = ref.current;
    if (!d) return;
    d.querySelector("video")?.pause();
    d.close();
  };

  return (
    <div className={classe}>
      {kind === "image" ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={apercu ?? src} alt={alt} className="zoom-trigger" onClick={ouvrir} />
      ) : (
        <>
          <video controls src={src} />
          <button type="button" className="zoom-btn" onClick={ouvrir} aria-label="Agrandir">
            ⤢
          </button>
        </>
      )}

      <dialog
        ref={ref}
        className="zoom-dialog"
        onClick={(e) => {
          if (e.target === e.currentTarget) fermer();
        }}
        onClose={(e) => e.currentTarget.querySelector("video")?.pause()}
      >
        <button type="button" className="zoom-close" onClick={fermer} aria-label="Fermer">
          ✕
        </button>
        {kind === "image" ? (
          // loading="lazy" : une image dans un <dialog> fermé (display: none) est
          // sinon chargée d'office. Paresseuse, elle ne part qu'à l'ouverture.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt={alt} loading="lazy" />
        ) : (
          <video controls src={src} preload="none" />
        )}
      </dialog>
    </div>
  );
}
