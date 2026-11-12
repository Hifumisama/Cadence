"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Icone } from "@/components/ui/Icon";

export type EntreeSommaire = { id: string; label: string; compte?: number };

/** Summary of the brief page: a sticky rail on the left on large screens; on tablet and phone, a compact bar
 * stuck under the banner that shows the current section and opens the list as a dropdown menu (nothing overflows, whatever the
 * number of sections). Clicking SCROLLS smoothly to the section, then makes it flash briefly;
 * the active entry follows the reading. Animations are turned off if the user reduces motion. */
export function Sommaire({ entrees, libelle = "Sommaire du brief" }: { entrees: EntreeSommaire[]; libelle?: string }) {
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
    // The active section: the first whose top has gone under the banner, the lowest among those already entered.
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

  // Dropdown menu: closes on a click elsewhere and on Escape.
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
    // The section reached « lights up » briefly (CSS .is-cible): we start from zero so it can be replayed.
    cible.classList.remove("is-cible");
    void cible.offsetWidth;
    cible.classList.add("is-cible");
    window.setTimeout(() => cible.classList.remove("is-cible"), 1600);
  };

  const courant = entrees.find((e) => e.id === actif) ?? entrees[0];

  return (
    <nav ref={racine} className={`bf-sommaire${ouvert ? " is-ouvert" : ""}`} aria-label={libelle}>
      <button type="button" className="bf-sommaire-bouton" aria-expanded={ouvert} aria-controls={idListe} onClick={() => setOuvert((v) => !v)}>
        <span className="bf-sommaire-texte">
          <span className="bf-etiquette">Sections</span>
          <span className="bf-sommaire-courant">{courant?.label}</span>
        </span>
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
                {e.compte != null ? <span className="bf-sommaire-n">{e.compte}</span> : null}
              </a>
            </li>
          ))}
        </ul>
      </div>
    </nav>
  );
}
