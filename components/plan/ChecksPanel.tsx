export function ChecksPanel({
  labelsOrphelins,
  refsNonCitees,
  repliquesNonTrouvees,
}: {
  labelsOrphelins: string[];
  refsNonCitees: string[];
  repliquesNonTrouvees: string[];
}) {
  const rienASignaler =
    labelsOrphelins.length === 0 &&
    refsNonCitees.length === 0 &&
    repliquesNonTrouvees.length === 0;

  if (rienASignaler) {
    return (
      <div className="checks">
        <div className="check ok">
          <span className="glyph">✅</span>
          <span>
            <span className="t">Tout est cohérent</span>
            <span className="d">Refs citées, verbatim aligné, aucune anomalie.</span>
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
      {repliquesNonTrouvees.map((r) => (
        <div key={r} className="check warn">
          <span className="glyph">⚠️</span>
          <span>
            <span className="t">Réplique absente ou modifiée</span>
            <span className="d">
              Introuvable au mot près dans une balise <code>&lt;d&gt;</code> : « {r} »
            </span>
          </span>
        </div>
      ))}
    </div>
  );
}
