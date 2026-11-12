"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Icone } from "@/components/ui/Icon";

export type CleOnglet = "prompt";

const ETIQUETTE: Record<CleOnglet, string> = { prompt: "Prompt" };

/** A « Voir » link of a check (ControlesEntete) or the prompt card (CartePrompt) opens the drawer through this event: the anchor « fp-prompt » designates the panel. */
export const ONGLET_DE_ANCRE: Record<string, CleOnglet> = { "fp-prompt": "prompt" };
export const EVENEMENT_ONGLET = "tm-onglet";

/** The prompt drawer, on the right, laid over the page like the Scenario one (no veil: the player stays usable). It opens from the
 * prompt card, below the references, and mounts when opened: the text starts again from what the server holds. Esc or the cross closes it. */
export function TiroirPlan({ panneaux }: { panneaux: Record<CleOnglet, ReactNode> }) {
  const [actif, setActif] = useState<CleOnglet | null>(null);

  useEffect(() => {
    const ouvrir = (e: Event) => {
      const cle = (e as CustomEvent<CleOnglet>).detail;
      if (cle in panneaux) setActif(cle);
    };
    window.addEventListener(EVENEMENT_ONGLET, ouvrir);
    return () => window.removeEventListener(EVENEMENT_ONGLET, ouvrir);
  }, [panneaux]);

  useEffect(() => {
    if (!actif) return;
    const echap = (e: KeyboardEvent) => e.key === "Escape" && setActif(null);
    document.addEventListener("keydown", echap);
    return () => document.removeEventListener("keydown", echap);
  }, [actif]);

  if (!actif) return null;
  return (
    <aside className="tm-tiroir is-large" aria-label={ETIQUETTE[actif]}>
      <div className="tm-tiroir-hd">
        <span className="tm-tiroir-etiquette">{ETIQUETTE[actif]}</span>
        <button type="button" className="tm-tiroir-fermer" aria-label="Fermer le tiroir" onClick={() => setActif(null)}>
          <Icone nom="fermer" taille={16} />
        </button>
      </div>
      <div className="tm-tiroir-corps" key={actif}>
        {panneaux[actif]}
      </div>
    </aside>
  );
}
