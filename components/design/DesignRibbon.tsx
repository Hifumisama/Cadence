"use client";

/** The filmstrip ribbon of the design's nine steps. Past steps are shown as a summary; `onClick` is only given for
 * those that can be reached. Shared by the start page, the interview and the preparation progress. */
export type CadreRuban = {
  nom: string;
  resume: string;
  etat: "fait" | "courant" | "actif" | "futur";
  onClick?: () => void;
};

export function RubanConception({ cadres }: { cadres: CadreRuban[] }) {
  return (
    <nav className="cn-ruban" aria-label="Étapes de la conception">
      {cadres.map((c, i) => (
        <button
          key={c.nom}
          type="button"
          className={`cn-cadre${c.etat === "fait" ? " is-fait" : ""}${c.etat === "futur" ? " is-futur" : ""}`}
          aria-current={c.etat === "courant" ? "step" : undefined}
          disabled={!c.onClick}
          title={c.resume ? `${c.nom} : ${c.resume}` : c.nom}
          onClick={c.onClick}
        >
          <b>{String(i + 1).padStart(2, "0")} · {c.nom}</b>
          <span>{c.resume || "—"}</span>
        </button>
      ))}
    </nav>
  );
}
