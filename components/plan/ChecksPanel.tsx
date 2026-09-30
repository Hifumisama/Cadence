import type { ProblemeStructure } from "@/lib/plan-checks";

/** Contrôles des références du plan. Le verbatim des dialogues (réplique <->
 * balise <d>) a son propre bandeau, dans le panneau Dialogues : il bloque la
 * génération, ce qui n'est pas le cas de ces signalements. */
export function ChecksPanel({
  labelsOrphelins,
  refsNonCitees,
  structure = [],
}: {
  labelsOrphelins: string[];
  refsNonCitees: string[];
  structure?: ProblemeStructure[];
}) {
  const rienASignaler = labelsOrphelins.length === 0 && refsNonCitees.length === 0 && structure.length === 0;

  if (rienASignaler) {
    return (
      <div className="checks">
        <div className="check ok">
          <span className="glyph">✅</span>
          <span>
            <span className="t">Tout est cohérent</span>
            <span className="d">Refs citées et déclarées, shots et durée en règle.</span>
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="checks">
      {labelsOrphelins.map((label) => (
        <div key={label} className="check warn">
          <span className="glyph">⚠️</span>
          <span>
            <span className="t">Référence citée mais non déclarée</span>
            <span className="d">
              <code>&lt;{label.replace(":", " ")}&gt;</code> est cité dans le prompt mais
              absent des références du plan.
            </span>
          </span>
        </div>
      ))}
      {structure.map((p, i) => (
        <div key={`${p.type}-${i}`} className="check warn">
          <span className="glyph">⚠️</span>
          <span>
            <span className="t">{p.type === "duree_invalide" ? "Durée de génération" : "Découpage en shots"}</span>
            <span className="d">{p.message}</span>
          </span>
        </div>
      ))}
      {refsNonCitees.map((label) => (
        <div key={label} className="check info">
          <span className="glyph">ℹ️</span>
          <span>
            <span className="t">Référence déclarée mais jamais citée</span>
            <span className="d">
              <code>&lt;{label.replace(":", " ")}&gt;</code> n&rsquo;apparaît dans aucune
              section du prompt.
            </span>
          </span>
        </div>
      ))}
    </div>
  );
}
