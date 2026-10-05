"use client";

import { useEffect, useState } from "react";

export type EntreeSommaire = { id: string; label: string; compte?: number; aConfirmer?: boolean };

/** Sommaire de la page du brief : un rail collant à gauche sur grand écran, une bande défilante collée sous le bandeau
 * sur tablette et téléphone. Le clic fait DÉFILER en douceur jusqu'à la section (puis la fait briller un instant) ;
 * l'entrée active suit la lecture. Animations coupées si l'utilisateur réduit les animations. */
export function Sommaire({ entrees }: { entrees: EntreeSommaire[] }) {
  const [actif, setActif] = useState(entrees[0]?.id ?? "");
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

  const aller = (id: string) => {
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

  return (
    <nav className="bf-sommaire" aria-label="Sommaire du brief">
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
    </nav>
  );
}
