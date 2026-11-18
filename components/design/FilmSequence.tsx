"use client";

import { useState } from "react";
import { formatTime, timeLabel, type MomentView, type SequenceView } from "@/lib/agents/sequence-display";

/** The film's moments as a readable sequence: numbered cards with their approximate position in the film. Two views: « Plans directs »
 * (the flat ordered list) and « Par actes » (even thirds Début / Milieu / Fin, offered from three moments on: the interview has no act
 * grouping, the treatment makes the real one). `compact`: the notes sheet's narrow column, list only; `limit`: show only the first ones
 * (preview). Data shaping: sequence-display.ts. */
export function FilmSequence({ sequence, compact = false, limit, vueInitiale = "direct" }: { sequence: SequenceView; compact?: boolean; limit?: number; vueInitiale?: "direct" | "acts" }) {
  const [view, setView] = useState<"direct" | "acts">(vueInitiale);
  const { moments, thirds } = sequence;
  if (moments.length === 0) return <p className="fs-vide">Aucun moment noté pour l’instant.</p>;
  const acts = !compact && view === "acts" && thirds.length > 0;
  const { missing } = sequence;

  return (
    <div className={`fs${compact ? " is-compact" : ""}`}>
      <div className="fs-tete">
        <p className="fs-resume">
          {moments.length} moment{moments.length > 1 ? "s" : ""}
          {sequence.durationSeconds !== null ? ` · ${formatTime(sequence.durationSeconds)}` : ""}
          {sequence.statusLabel ? <span className={`fs-statut is-${sequence.status}`}> · {sequence.statusLabel}</span> : null}
          {missing > 0 ? <span className="fs-manque"> · {missing} de plus attendu{missing > 1 ? "s" : ""} pour la durée</span> : null}
        </p>
        {!compact && thirds.length > 0 ? (
          <div className="fs-bascule" role="group" aria-label="Affichage de la séquence">
            <button type="button" aria-pressed={view === "acts"} onClick={() => setView("acts")}>Par actes</button>
            <button type="button" aria-pressed={view === "direct"} onClick={() => setView("direct")}>Plans directs</button>
          </div>
        ) : null}
      </div>
      {acts ? (
        <>
          {thirds.map((g) => (
            <section key={g.label} className="fs-acte" aria-label={g.label}>
              <h4>
                {g.label}
                {g.moments.length && g.moments[0]!.startSeconds !== null && g.moments[g.moments.length - 1]!.endSeconds !== null ? (
                  <small>{formatTime(g.moments[0]!.startSeconds!)} – {formatTime(g.moments[g.moments.length - 1]!.endSeconds!)}</small>
                ) : null}
              </h4>
              <Moments moments={g.moments} />
            </section>
          ))}
          <p className="fs-note">Découpage indicatif en trois tiers égaux : la répartition en scènes viendra avec le traitement.</p>
        </>
      ) : (
        <Moments moments={limit === undefined ? moments : moments.slice(0, limit)} />
      )}
      {sequence.durationSeconds !== null && !compact ? <p className="fs-note">Les repères de temps sont approximatifs : la durée partagée à parts égales.</p> : null}
    </div>
  );
}

function Moments({ moments }: { moments: MomentView[] }) {
  return (
    <ol className="fs-liste">
      {moments.map((m) => {
        const t = timeLabel(m);
        return (
          <li key={m.number} value={m.number}>
            <span className="fs-num" aria-hidden="true">{String(m.number).padStart(2, "0")}</span>
            <span className="fs-corps">
              {t ? <span className="fs-temps">{t}</span> : null}
              <span className="fs-texte">{m.text}</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}
