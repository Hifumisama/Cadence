"use client";

import { useEffect, useRef, useState } from "react";
import { EVENEMENT_ONGLET, ONGLET_DE_ANCRE } from "@/components/plan/OngletsPlan";

export type AlerteControle = {
  cle: string;
  niveau: "warn" | "info";
  titre: string;
  detail: string;
  /** Ancre du panneau concerné (« fp-dialogues »…) : un lien « Voir » ouvre l'onglet correspondant. */
  ancre?: string;
};

/** Les contrôles automatiques, repliés dans le titre du plan : une pastille « 2 contrôles » qui ouvre la liste (rendu périmé, référence
 * citée mais non déclarée, structure des shots, dialogues…). Quand tout est en règle, rien à lire : pas de pastille. */
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
    const onglet = ONGLET_DE_ANCRE[ancre];
    if (onglet) window.dispatchEvent(new CustomEvent(EVENEMENT_ONGLET, { detail: onglet }));
    setOuvert(false);
  };

  return (
    <div className="fp-ctrl" ref={racine}>
      <button type="button" className="tm-ctrl-pastille" aria-expanded={ouvert} onClick={() => setOuvert((o) => !o)}>
        {alertes.length} contrôle{alertes.length > 1 ? "s" : ""}
      </button>
      {ouvert ? (
        <div className="fp-alertes tm-ctrl-pop" role="status">
          <ul>
            {alertes.map((a) => (
              <li key={a.cle} className={a.niveau === "info" ? "is-info" : undefined}>
                <b>{a.titre}</b>
                <span>{a.detail}</span>
                {a.ancre && ONGLET_DE_ANCRE[a.ancre] ? (
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
