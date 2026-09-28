import { PHASES, type PhaseAgregee } from "@/lib/phase";

/** Badge d'étape du pipeline — dérivé des statuts de plans, jamais saisi à
 * la main (retour utilisateur 2026-09-28). Distinct du badge de statut de
 * production (StatusBadge) : deux questions différentes. */
export function PhaseBadge({ agregee }: { agregee: PhaseAgregee }) {
  if (agregee.phase === "mixte") {
    return (
      <span className="phase ph-mixte" title={agregee.detail ?? undefined}>
        <Pips bornes={agregee.bornes} />
        Mixte
      </span>
    );
  }
  const p = PHASES[agregee.phase];
  const classe = agregee.phase === "fini" ? " ph-fini" : agregee.phase === "vide" ? " ph-vide" : "";
  return (
    <span className={`phase${classe}`} title={`Étape du pipeline (${p.ordre}/4)`}>
      <Pips bornes={[p.ordre, p.ordre]} />
      {p.label}
    </span>
  );
}

function Pips({ bornes: [lo, hi] }: { bornes: [number, number] }) {
  return (
    <span className="pips">
      {[0, 1, 2, 3].map((i) => (
        <i key={i} className={i < lo ? "on" : i < hi ? "part" : ""} />
      ))}
    </span>
  );
}
