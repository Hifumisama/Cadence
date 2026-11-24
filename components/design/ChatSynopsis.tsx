"use client";

import { useId, useState } from "react";

type Etat = "proposee" | "validee" | "remplacee";

/** The synopsis the screenwriter proposes, as a card under its message (test feedback 2026-11-23): the first milestone of the interview.
 * Proposed: the text, « Valider le synopsis » and « Corriger » (active on the last card only). Validated or replaced by a later card: folded
 * into one line that can be reopened. Same look as the sequence card (`cs-*`). */
export function ChatSynopsis({ texte, etat, actions, valider, corriger }: { texte: string; etat: Etat; actions: boolean; valider: () => void; corriger: () => void }) {
  const [ouverte, setOuverte] = useState(etat === "proposee");
  const corps = useId();
  const titre = etat === "validee" ? "Synopsis validé" : etat === "remplacee" ? "Version précédente du synopsis" : "Synopsis proposé";

  return (
    <section className={`cs is-${etat}`} aria-label={titre}>
      {etat !== "proposee" ? (
        <button type="button" className="cs-tete is-bouton" aria-expanded={ouverte} aria-controls={corps} onClick={() => setOuverte((o) => !o)}>
          {etat === "validee" ? (
            <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="cs-coche"><path d="M5 12l5 5L19 8" /></svg>
          ) : null}
          <b>{titre}</b>
          <span className="cs-espace" />
          <span className="cs-meta">{ouverte ? "Replier" : "Revoir"}</span>
        </button>
      ) : (
        <div className="cs-tete">
          <b>{titre}</b>
          <span className="cs-espace" />
          <span className="cs-pastille">à valider</span>
        </div>
      )}
      {ouverte ? (
        <div id={corps}>
          <p className="cs-synopsis">{texte}</p>
          {etat === "proposee" ? (
            <div className="cs-pied">
              <button type="button" className="btn cs-valider" disabled={!actions} onClick={valider}>Valider le synopsis</button>
              <button type="button" className="btn" disabled={!actions} onClick={corriger}>Corriger</button>
              <span className="cs-meta cs-note">La fin viendra plus tard, une fois les moments du film posés.</span>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
