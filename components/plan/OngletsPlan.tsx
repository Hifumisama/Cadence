"use client";

import { useEffect, useState, type ReactNode } from "react";

export type CleOnglet = "refs" | "prompt" | "reglages" | "journal";

const LIBELLES: Record<CleOnglet, string> = {
  refs: "Références",
  prompt: "Prompt",
  reglages: "Réglages",
  journal: "Journal",
};
const ORDRE: CleOnglet[] = ["refs", "prompt", "reglages", "journal"];

/** Un lien « Voir » d'un contrôle (ControlesEntete) ouvre le bon onglet : l'ancre d'avant (« fp-refs »…) désignait un panneau, qui est
 * maintenant un onglet. */
export const ONGLET_DE_ANCRE: Record<string, CleOnglet> = { "fp-refs": "refs", "fp-prompt": "prompt", "fp-console": "reglages" };
export const EVENEMENT_ONGLET = "tm-onglet";

/** Le panneau d'onglets de la fiche (collant à droite) : Références, Prompt, Réglages, Journal. TOUS les panneaux restent montés
 * (seul l'actif est visible) : un brouillon de prompt, une fenêtre ouverte ou une saisie ne se perdent pas en changeant d'onglet. */
export function OngletsPlan({ panneaux, compteurs }: { panneaux: Record<CleOnglet, ReactNode>; compteurs: Partial<Record<CleOnglet, number>> }) {
  const [actif, setActif] = useState<CleOnglet>("refs");

  useEffect(() => {
    const ouvrir = (e: Event) => {
      const cle = (e as CustomEvent<CleOnglet>).detail;
      if (ORDRE.includes(cle)) setActif(cle);
    };
    window.addEventListener(EVENEMENT_ONGLET, ouvrir);
    return () => window.removeEventListener(EVENEMENT_ONGLET, ouvrir);
  }, []);

  return (
    <aside className="tm-panneau" aria-label="Détails du plan">
      <div className="tm-onglets" role="tablist">
        {ORDRE.map((cle) => (
          <button key={cle} type="button" role="tab" id={`tm-o-${cle}`} aria-selected={actif === cle} aria-controls={`tm-p-${cle}`} className="tm-onglet" onClick={() => setActif(cle)}>
            {LIBELLES[cle]}
            {compteurs[cle] ? <span className="tm-onglet-n num">{compteurs[cle]}</span> : null}
          </button>
        ))}
      </div>
      {ORDRE.map((cle) => (
        <div key={cle} id={`tm-p-${cle}`} role="tabpanel" aria-labelledby={`tm-o-${cle}`} className="tm-contenu" hidden={actif !== cle}>
          {panneaux[cle]}
        </div>
      ))}
    </aside>
  );
}
