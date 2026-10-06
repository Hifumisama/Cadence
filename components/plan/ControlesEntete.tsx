"use client";

import { useState } from "react";

export type AlerteControle = {
  cle: string;
  niveau: "warn" | "info";
  titre: string;
  detail: string;
  /** Ancre vers le panneau concerné (« fp-dialogues ») : un lien « Voir » est affiché. */
  ancre?: string;
};

/** Les contrôles automatiques, repliés dans l'en-tête : une pastille (« Cohérent » ou « 2 alertes ») qui déplie la liste. Quand tout
 * est en règle, rien à lire. */
export function ControlesEntete({ alertes }: { alertes: AlerteControle[] }) {
  const [ouvert, setOuvert] = useState(false);

  if (alertes.length === 0) {
    return (
      <span className="fp-pastille is-ok" title="Refs citées et déclarées, shots, durée et dialogues en règle.">
        <i /> Cohérent
      </span>
    );
  }
  return (
    <div className="fp-ctrl">
      <button type="button" className="fp-pastille is-alerte" aria-expanded={ouvert} onClick={() => setOuvert((o) => !o)}>
        <i /> {alertes.length} alerte{alertes.length > 1 ? "s" : ""}
      </button>
      {ouvert ? (
        <div className="fp-alertes" role="status">
          <ul>
            {alertes.map((a) => (
              <li key={a.cle} className={a.niveau === "info" ? "is-info" : undefined}>
                <b>{a.titre}</b>
                <span>{a.detail}</span>
                {a.ancre ? (
                  <a className="btn btn-ghost btn-sm" href={`#${a.ancre}`}>
                    Voir
                  </a>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
