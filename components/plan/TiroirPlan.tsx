"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Icone } from "@/components/ui/Icone";

export type CleOnglet = "scenario" | "refs" | "prompt" | "reglages";

const LIBELLES: Record<CleOnglet, string> = {
  scenario: "Scénario",
  refs: "Références",
  prompt: "Prompt",
  reglages: "Réglages",
};
const ORDRE: CleOnglet[] = ["scenario", "refs", "prompt", "reglages"];

/** Un lien « Voir » d'un contrôle (ControlesEntete) ouvre le bon tiroir : l'ancre d'avant (« fp-refs »…) désignait un panneau. */
export const ONGLET_DE_ANCRE: Record<string, CleOnglet> = { "fp-refs": "refs", "fp-prompt": "prompt", "fp-console": "reglages" };
export const EVENEMENT_ONGLET = "tm-onglet";

/** Les panneaux de la fiche (scénario du plan, références, prompt, réglages) : une rangée de boutons sous le titre, et le panneau choisi dans un tiroir
 * à droite, posé par-dessus la page comme celui du Scénario (sans voile : le lecteur reste utilisable). Un seul tiroir ouvert à la fois, monté à
 * l'ouverture : chaque panneau repart d'un état propre (et relit les données du serveur). Échap ou la croix le ferment. */
export function TiroirPlan({ panneaux, compteurs }: { panneaux: Record<CleOnglet, ReactNode>; compteurs: Partial<Record<CleOnglet, number>> }) {
  const [actif, setActif] = useState<CleOnglet | null>(null);

  useEffect(() => {
    const ouvrir = (e: Event) => {
      const cle = (e as CustomEvent<CleOnglet>).detail;
      if (ORDRE.includes(cle)) setActif(cle);
    };
    window.addEventListener(EVENEMENT_ONGLET, ouvrir);
    return () => window.removeEventListener(EVENEMENT_ONGLET, ouvrir);
  }, []);

  useEffect(() => {
    if (!actif) return;
    const echap = (e: KeyboardEvent) => e.key === "Escape" && setActif(null);
    document.addEventListener("keydown", echap);
    return () => document.removeEventListener("keydown", echap);
  }, [actif]);

  return (
    <>
      <div className="tm-outils" role="toolbar" aria-label="Détails du plan">
        {ORDRE.map((cle) => (
          <button key={cle} type="button" className="tm-outil" aria-pressed={actif === cle} aria-expanded={actif === cle} onClick={() => setActif((a) => (a === cle ? null : cle))}>
            {LIBELLES[cle]}
            {compteurs[cle] ? <span className="tm-outil-n num">{compteurs[cle]}</span> : null}
          </button>
        ))}
      </div>
      {actif ? (
        <aside className="tm-tiroir" aria-label={LIBELLES[actif]}>
          <div className="tm-tiroir-hd">
            <span className="tm-tiroir-etiquette">{LIBELLES[actif]}</span>
            <button type="button" className="tm-tiroir-fermer" aria-label="Fermer le tiroir" onClick={() => setActif(null)}>
              <Icone nom="fermer" taille={16} />
            </button>
          </div>
          <div className="tm-tiroir-corps" key={actif}>
            {panneaux[actif]}
          </div>
        </aside>
      ) : null}
    </>
  );
}
