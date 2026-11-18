"use client";

import { useId, useState } from "react";
import { matiere, messageProposerSuite, type SequenceProposee } from "@/lib/agents/chat-sequence";
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
  proposerSuite,
}: {
  sequence: SequenceProposee;
  etat: Etat;
  dureeSecondes: number | null;
  /** The buttons work (last message, nothing running). */
  actions: boolean;
  /** Validates the sequence with the strong moment kept on the card (1-based rank, or null). */
  valider: (tempsFort: number | null) => void;
  changer: () => void;
  /** Sends « Propose-moi la suite » (the gauge's button). */
  proposerSuite?: (texte: string) => void;
}) {
  const [ouverte, setOuverte] = useState(etat === "proposee");
  // The strong moment: the AI's by default; a click on another moment moves it, a click on it removes it.
  const [fort, setFort] = useState<number | null>(sequence.tempsFort);
  const choisissable = etat === "proposee" && actions;
  const corps = useId();
  const n = sequence.moments.length;
  const temps = (i: number) => (dureeSecondes ? `${formatTime((i * dureeSecondes) / n)}–${formatTime(((i + 1) * dureeSecondes) / n)}` : "");
  const titre = etat === "validee" ? "Séquence validée" : etat === "remplacee" ? "Version précédente" : "Séquence proposée";
  const pliable = etat !== "proposee";
  const jauge = etat === "proposee" ? matiere(n, dureeSecondes) : null;

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
            {sequence.moments.map((_, i) => <span key={i} className={fort === i + 1 ? "is-fort" : ""} />)}
          </div>
          <ol className="cs-liste">
            {sequence.moments.map((m, i) => (
              <li key={i} className={fort === i + 1 ? "is-fort" : ""}>
                <span className="cs-num">{i + 1}</span>
                <span className="cs-temps">{temps(i)}</span>
                <span className="cs-texte">{m}{fort === i + 1 ? <span className="cs-fort-label"> · temps fort</span> : null}</span>
                {choisissable ? (
                  <button
                    type="button"
                    className={`cs-etoile${fort === i + 1 ? " is-fort" : ""}`}
                    aria-pressed={fort === i + 1}
                    aria-label={fort === i + 1 ? `Retirer le temps fort du moment ${i + 1}` : `Faire du moment ${i + 1} le temps fort`}
                    title={fort === i + 1 ? "Temps fort (cliquer pour retirer)" : "En faire le temps fort"}
                    onClick={() => setFort((f) => (f === i + 1 ? null : i + 1))}
                  >
                    <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill={fort === i + 1 ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2"><path d="M12 3l2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9z" /></svg>
                  </button>
                ) : null}
              </li>
            ))}
          </ol>
          {jauge ? (
            <div className="cs-matiere">
              <div className="cs-matiere-tete">
                <b>Matière du film</b>
                <span className="cs-espace" />
                <span className="cs-matiere-chiffre">{formatTime(jauge.couvertes)}</span>
                <span className="cs-meta">sur {formatTime(jauge.visees)} visées</span>
              </div>
              <div className="cs-cases" role="img" aria-label={`${jauge.pleines} moments couvrent environ ${jauge.couvertes} secondes sur ${jauge.visees}`}>
                {Array.from({ length: jauge.cases }, (_, i) => <span key={i} className={i >= jauge.pleines ? "is-vide" : fort === i + 1 ? "is-fort" : ""} />)}
              </div>
              {jauge.manquants > 0 ? (
                <div className="cs-matiere-pied">
                  <span className="cs-manque">Il manque {jauge.manquants} moment{jauge.manquants > 1 ? "s" : ""} (≈ {jauge.manquants * 10} s) pour tenir la durée.</span>
                  {proposerSuite ? <button type="button" className="btn cs-suite" disabled={!actions} onClick={() => proposerSuite(messageProposerSuite(jauge))}>Propose-moi la suite</button> : null}
                </div>
              ) : <span className="cs-meta">Assez de matière pour la durée visée.</span>}
            </div>
          ) : null}
          {etat === "proposee" ? (
            <div className="cs-pied">
              <button type="button" className="btn cs-valider" disabled={!actions} onClick={() => valider(fort)}>Valider la séquence</button>
              <button type="button" className="btn" disabled={!actions} onClick={changer}>Changer un moment</button>
              <span className="cs-meta cs-note">{fort ? "L’étoile marque le temps fort : clique sur un autre moment pour le changer." : "Clique sur l’étoile d’un moment pour en faire le temps fort."}{dureeSecondes ? " Temps approximatifs." : ""}</span>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
