"use client";

import "./fiche-asset.css";
import "./fiche-asset-mise-en-page.css";
import { useState, type ReactNode } from "react";
import { Icone, type NomIcone } from "@/components/ui/Icon";

export type OngletAsset = {
  id: string;
  libelle: string;
  icone: NomIcone;
  /** A small number next to the label (the attempts of an image). */
  compte?: number;
  /** A gold dot: something is in place (the character's voice is set). */
  point?: boolean;
  contenu: ReactNode;
};

/** The tabs of an asset sheet: one per thing the asset can do (image, voice, sound). All panels stay mounted, only the active one is
 * visible: an attempt in progress or a half-written text is not lost when switching tabs. The tab lives in the address (`?onglet=`). */
export function OngletsAsset({ onglets, initial }: { onglets: OngletAsset[]; initial: string }) {
  const [actif, setActif] = useState(onglets.some((o) => o.id === initial) ? initial : onglets[0]!.id);

  const choisir = (id: string) => {
    setActif(id);
    try {
      const url = new URL(window.location.href);
      url.searchParams.set("onglet", id);
      url.searchParams.delete("generation");
      window.history.replaceState(null, "", url);
    } catch {
      // address unavailable: the tab stays selected in the page
    }
  };

  const surFleche = (e: React.KeyboardEvent) => {
    const pas = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!pas) return;
    e.preventDefault();
    const i = onglets.findIndex((o) => o.id === actif);
    const suivant = onglets[(i + pas + onglets.length) % onglets.length]!;
    choisir(suivant.id);
    (e.currentTarget.querySelector(`[data-onglet="${suivant.id}"]`) as HTMLElement | null)?.focus();
  };

  return (
    <>
      <div className="onglets" role="tablist" aria-label="Sections de la fiche" onKeyDown={surFleche}>
        {onglets.map((o) => (
          <button
            key={o.id}
            type="button"
            role="tab"
            id={`onglet-${o.id}`}
            data-onglet={o.id}
            aria-selected={actif === o.id}
            aria-controls={`panneau-${o.id}`}
            tabIndex={actif === o.id ? 0 : -1}
            className="onglet"
            onClick={() => choisir(o.id)}
          >
            <Icone nom={o.icone} taille={16} />
            {o.libelle}
            {o.compte ? <span className="compte">{o.compte}</span> : null}
            {o.point ? <span className="point" aria-label="en place" /> : null}
          </button>
        ))}
      </div>
      {onglets.map((o) => (
        <div key={o.id} role="tabpanel" id={`panneau-${o.id}`} aria-labelledby={`onglet-${o.id}`} className="panneau" hidden={actif !== o.id}>
          {o.contenu}
        </div>
      ))}
    </>
  );
}
