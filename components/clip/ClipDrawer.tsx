"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Icone } from "@/components/ui/Icon";

export type CleOnglet = "prompt";

const ETIQUETTE: Record<CleOnglet, string> = { prompt: "Prompt" };

/** Un lien « Voir » d'un contrôle (ControlesEntete) ou la carte du prompt (CartePrompt) ouvrent le tiroir par cet évènement : l'ancre « fp-prompt » désigne le panneau. */
export const ONGLET_DE_ANCRE: Record<string, CleOnglet> = { "fp-prompt": "prompt" };
export const EVENEMENT_ONGLET = "tm-onglet";

/** Le tiroir du prompt, à droite, posé par-dessus la page comme celui du Scénario (sans voile : le lecteur reste utilisable). Il s'ouvre depuis la carte du
 * prompt, sous les références, et se monte à l'ouverture : le texte repart de ce que le serveur a. Échap ou la croix le ferment. */
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
