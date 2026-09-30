import { ETAPES_VOIX, type EtatPhases } from "@/lib/voix";

/** Les quatre étapes du casting. Or plein = fait, hachuré = entamé, gris =
 * rien. Sur la carte du catalogue comme en tête de la fiche. */
export function PhasesVoix({ phases, detail = false }: { phases: EtatPhases; detail?: boolean }) {
  return (
    <ol className={`phases-voix${detail ? " is-detail" : ""}`}>
      {ETAPES_VOIX.map((e, i) => (
        <li key={e.cle} className={`ph-${phases[e.cle]}`} title={`${e.label} — ${e.aide}`}>
          <i />
          <span className="n num">{i + 1}</span>
          <span className="l">{e.label}</span>
          {detail ? <span className="a">{e.aide}</span> : null}
        </li>
      ))}
    </ol>
  );
}
