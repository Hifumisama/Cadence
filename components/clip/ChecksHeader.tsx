"use client";

import { useEffect, useRef, useState } from "react";
import { EVENEMENT_ONGLET, ONGLET_DE_ANCRE } from "@/components/clip/ClipDrawer";

export type AlerteControle = {
  cle: string;
  niveau: "warn" | "info";
  titre: string;
  detail: string;
  /** Anchor of the panel concerned (« fp-refs »…): a « Voir » link opens the matching tab. */
  ancre?: string;
};

/** The automatic checks, folded into the clip's title: a « 2 points à revoir » badge that opens the list (stale render, reference cited
 * but not declared, shot structure…). When everything is in order, nothing to read: no badge. */
export function ControlesEntete({ alertes }: { alertes: AlerteControle[] }) {
  const [ouvert, setOuvert] = useState(false);
  const racine = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ouvert) return;
    const dehors = (e: MouseEvent) => {
      if (racine.current && !racine.current.contains(e.target as Node)) setOuvert(false);
    };
    const echap = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOuvert(false);
    };
    document.addEventListener("mousedown", dehors);
    document.addEventListener("keydown", echap);
    return () => {
      document.removeEventListener("mousedown", dehors);
      document.removeEventListener("keydown", echap);
    };
  }, [ouvert]);

  if (alertes.length === 0) return null;

  const voir = (ancre: string) => {
    if (ancre === "fp-refs") {
      // The references sit next to the player: we lead there and make them shine for a moment.
      const el = document.getElementById("fp-refs");
      el?.scrollIntoView({ block: "center", behavior: "smooth" });
      el?.classList.remove("fp-gel");
      void el?.offsetWidth;
      el?.classList.add("fp-gel");
      setOuvert(false);
      return;
    }
    const onglet = ONGLET_DE_ANCRE[ancre];
    if (onglet) window.dispatchEvent(new CustomEvent(EVENEMENT_ONGLET, { detail: onglet }));
    setOuvert(false);
  };

  return (
    <div className="fp-ctrl" ref={racine}>
      <button type="button" className="tm-ctrl-pastille" aria-expanded={ouvert} onClick={() => setOuvert((o) => !o)}>
        {alertes.length} point{alertes.length > 1 ? "s" : ""} à revoir
      </button>
      {ouvert ? (
        <div className="fp-alertes tm-ctrl-pop" role="status">
          <ul>
            {alertes.map((a) => (
              <li key={a.cle} className={a.niveau === "info" ? "is-info" : undefined}>
                <b>{a.titre}</b>
                <span>{a.detail}</span>
                {a.ancre && (a.ancre === "fp-refs" || ONGLET_DE_ANCRE[a.ancre]) ? (
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => voir(a.ancre!)}>
                    Voir
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
