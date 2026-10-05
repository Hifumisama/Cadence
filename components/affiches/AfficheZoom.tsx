"use client";

import { useRef } from "react";
import { Icone } from "@/components/ui/Icone";

/** L'affiche, cliquable : ouvre l'image seule en grand (<dialog> natif : Échap ou clic sur le fond ferment). Sans image,
 * le dégradé de repli n'a rien à agrandir et reste tel quel. */
export function AfficheZoom({ src, titre, children }: { src: string | null; titre: string; children: React.ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  if (!src) return <>{children}</>;
  return (
    <>
      <button type="button" className="aff-zoom" onClick={() => ref.current?.showModal()} aria-label={`Agrandir l'image de « ${titre} »`}>
        {children}
      </button>
      <dialog
        ref={ref}
        className="zoom-dialog"
        onClick={(e) => {
          if (e.target === e.currentTarget) ref.current?.close();
        }}
      >
        <button type="button" className="zoom-close" onClick={() => ref.current?.close()} aria-label="Fermer">
          <Icone nom="fermer" />
        </button>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={`Affiche de « ${titre} »`} loading="lazy" />
      </dialog>
    </>
  );
}
