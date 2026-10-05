"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Icone } from "@/components/ui/Icone";
import { LegendeMarques } from "./Marque";

export type EntreeSommaire = { id: string; label: string; compte?: number; aConfirmer?: boolean };

/** Sommaire de la page du brief : un rail collant à gauche sur grand écran ; sur tablette et téléphone, une barre compacte
 * collée sous le bandeau qui affiche la section en cours et ouvre la liste en menu déroulant (rien ne déborde, quel que
 * soit le nombre de sections). Le clic fait DÉFILER en douceur jusqu'à la section, puis la fait briller un instant ;
 * l'entrée active suit la lecture. Animations coupées si l'utilisateur réduit les animations. */
export function Sommaire({ entrees }: { entrees: EntreeSommaire[] }) {
  const [actif, setActif] = useState(entrees[0]?.id ?? "");
  const [ouvert, setOuvert] = useState(false);
  const racine = useRef<HTMLElement>(null);
  const idListe = useId();
  const cle = entrees.map((e) => e.id).join("|");

  useEffect(() => {
    const elements = cle
      .split("|")
      .map((id) => document.getElementById(id))
      .filter((e): e is HTMLElement => e !== null);
    if (elements.length === 0) return;
    // La section active : la première dont le haut est passé sous le bandeau, la plus basse parmi celles déjà entrées.
    const obs = new IntersectionObserver(
      (lignes) => {
        const visibles = lignes.filter((l) => l.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visibles[0]) setActif(visibles[0].target.id);
      },
      { rootMargin: "-96px 0px -60% 0px", threshold: 0 },
    );
    elements.forEach((e) => obs.observe(e));
    return () => obs.disconnect();
  }, [cle]);

  // Menu déroulant : se ferme au clic ailleurs et sur Échap.
  useEffect(() => {
    if (!ouvert) return;
    const dehors = (e: Event) => {
      if (!racine.current?.contains(e.target as Node)) setOuvert(false);
    };
    const echap = (e: KeyboardEvent) => e.key === "Escape" && setOuvert(false);
    document.addEventListener("pointerdown", dehors);
    document.addEventListener("keydown", echap);
    return () => {
      document.removeEventListener("pointerdown", dehors);
      document.removeEventListener("keydown", echap);
    };
  }, [ouvert]);

  const aller = (id: string) => {
    setOuvert(false);
    const cible = document.getElementById(id);
    if (!cible) return;
    const reduit = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    cible.scrollIntoView({ behavior: reduit ? "auto" : "smooth", block: "start" });
    setActif(id);
    // La section arrivée « s'allume » un instant (CSS .is-cible) : on repart de zéro pour pouvoir la rejouer.
    cible.classList.remove("is-cible");
    void cible.offsetWidth;
    cible.classList.add("is-cible");
    window.setTimeout(() => cible.classList.remove("is-cible"), 1600);
  };

  const courant = entrees.find((e) => e.id === actif) ?? entrees[0];

  return (
    <nav ref={racine} className={`bf-sommaire${ouvert ? " is-ouvert" : ""}`} aria-label="Sommaire du brief">
      <button type="button" className="bf-sommaire-bouton" aria-expanded={ouvert} aria-controls={idListe} onClick={() => setOuvert((v) => !v)}>
        <span className="bf-etiquette">Sections</span>
        <span className="bf-sommaire-courant">{courant?.label}</span>
        <Icone nom="bas" taille={18} />
      </button>
      <div id={idListe} className="bf-sommaire-panneau">
        <ul>
          {entrees.map((e) => (
            <li key={e.id}>
              <a
                href={`#${e.id}`}
                className={`bf-sommaire-lien${actif === e.id ? " is-actif" : ""}`}
                aria-current={actif === e.id ? "true" : undefined}
                onClick={(ev) => {
                  ev.preventDefault();
                  aller(e.id);
                }}
              >
                <span>{e.label}</span>
                {e.aConfirmer ? (
                  <span className="bf-sommaire-alerte" title="À confirmer">
                    <span aria-hidden="true">◇</span>
                    <span className="bf-sr">à confirmer</span>
                  </span>
                ) : e.compte != null ? (
                  <span className="bf-sommaire-n">{e.compte}</span>
                ) : null}
              </a>
            </li>
          ))}
        </ul>
        <LegendeMarques />
      </div>
    </nav>
  );
}
