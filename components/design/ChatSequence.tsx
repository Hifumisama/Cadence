"use client";

import { useId, useState } from "react";
import type { SequenceProposee } from "@/lib/agents/chat-sequence";
import { formatTime } from "@/lib/agents/sequence-display";

type Etat = "proposee" | "validee" | "remplacee";

/** The sequence the screenwriter proposes, as a card under its message (mock-up « Maquettes entretien », 2026-11-18). Proposed: the whole
 * list, a time bar with the strong moment in gold, « Valider la séquence » and « Changer un moment » (active on the last card only). Validated or
 * replaced by a later card: folded into one line that can be reopened. Times: the duration split evenly (approximate). */
export function ChatSequence({
  sequence,
  etat,
  dureeSecondes,
  actions,
  valider,
  changer,
}: {
  sequence: SequenceProposee;
  etat: Etat;
  dureeSecondes: number | null;
  /** The buttons work (last message, nothing running). */
  actions: boolean;
  valider: () => void;
  changer: () => void;
}) {
  const [ouverte, setOuverte] = useState(etat === "proposee");
  const corps = useId();
  const n = sequence.moments.length;
  const temps = (i: number) => (dureeSecondes ? `${formatTime((i * dureeSecondes) / n)}–${formatTime(((i + 1) * dureeSecondes) / n)}` : "");
  const titre = etat === "validee" ? "Séquence validée" : etat === "remplacee" ? "Version précédente" : "Séquence proposée";
  const pliable = etat !== "proposee";

  return (
    <section className={`cs is-${etat}`} aria-label={titre}>
      {pliable ? (
        <button type="button" className="cs-tete is-bouton" aria-expanded={ouverte} aria-controls={corps} onClick={() => setOuverte((o) => !o)}>
          {etat === "validee" ? (
            <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="cs-coche"><path d="M5 12l5 5L19 8" /></svg>
          ) : null}
          <b>{titre}</b>
          <span className="cs-meta">{n} moments{dureeSecondes ? ` · ${formatTime(dureeSecondes)}` : ""}</span>
          <span className="cs-espace" />
          <span className="cs-meta">{ouverte ? "Replier" : "Revoir"}</span>
        </button>
      ) : (
        <div className="cs-tete">
          <b>{titre}</b>
          <span className="cs-meta">{n} moments{dureeSecondes ? ` · ${formatTime(dureeSecondes)}` : ""}</span>
          <span className="cs-espace" />
          <span className="cs-pastille">à valider</span>
        </div>
      )}
      {ouverte ? (
        <div id={corps}>
          <div className="cs-barre" aria-hidden="true">
            {sequence.moments.map((_, i) => <span key={i} className={sequence.tempsFort === i + 1 ? "is-fort" : ""} />)}
          </div>
          <ol className="cs-liste">
            {sequence.moments.map((m, i) => (
              <li key={i} className={sequence.tempsFort === i + 1 ? "is-fort" : ""}>
                <span className="cs-num">{i + 1}</span>
                <span className="cs-temps">{temps(i)}</span>
                <span className="cs-texte">{m}{sequence.tempsFort === i + 1 ? <span className="cs-fort-label"> · temps fort</span> : null}</span>
              </li>
            ))}
          </ol>
          {etat === "proposee" ? (
            <div className="cs-pied">
              <button type="button" className="btn cs-valider" disabled={!actions} onClick={valider}>Valider la séquence</button>
              <button type="button" className="btn" disabled={!actions} onClick={changer}>Changer un moment</button>
              {dureeSecondes ? <span className="cs-meta cs-note">Temps approximatifs, à parts égales.</span> : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
