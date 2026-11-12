"use client";

import { useRef } from "react";
import { Icone } from "@/components/ui/Icon";

/** Clickable preview: opens the asset at full size in a modal window
 * (native <dialog>: Escape and clicking the background close it). Image: click on
 * the image. Video: enlarge button, since a click on the video drives
 * its controls. */
export function MediaZoom({
  kind,
  src,
  apercu,
  alt,
  classe,
}: {
  kind: "image" | "video";
  src: string;
  /** Thumbnail shown in place of the original (image only): the original
   * only loads when the enlarged window opens. */
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
          <Icone nom="fermer" />
        </button>
        {kind === "image" ? (
          // loading="lazy": an image inside a closed <dialog> (display: none) is
          // otherwise loaded anyway. Lazy, it only starts loading on opening.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt={alt} loading="lazy" />
        ) : (
          <video controls src={src} preload="none" />
        )}
      </dialog>
    </div>
  );
}
