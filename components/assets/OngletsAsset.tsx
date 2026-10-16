"use client";

import "./fiche-asset.css";
import "./fiche-asset-mise-en-page.css";
import { useState, type ReactNode } from "react";
import { Icone, type NomIcone } from "@/components/ui/Icone";

export type OngletAsset = {
  id: string;
  libelle: string;
  icone: NomIcone;
  /** Un petit nombre à côté du libellé (les essais d'une image). */
  compte?: number;
  /** Un point doré : quelque chose est en place (la voix du personnage est fixée). */
  point?: boolean;
  contenu: ReactNode;
};

/** Les onglets d'une fiche d'asset : un par chose que l'asset sait faire (image, voix, son). Tous les panneaux restent montés, seul l'actif est
 * visible : un essai en cours ou un texte à moitié écrit n'est pas perdu en changeant d'onglet. L'onglet vit dans l'adresse (`?onglet=`). */
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
      // adresse indisponible : l'onglet reste choisi dans la page
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
