import type { StatutDuree } from "@/lib/plan-checks";

type DialogueRow = {
  slot: number;
  locuteur: string;
  replique: string;
  dureeSecondes: number | null;
};

const STATUT_LABEL: Record<StatutDuree, string> = {
  tient: "✅ tient",
  a_mesurer: "⏳ voix à mesurer",
  decoupage_a_envisager: "✂️ découpage à envisager",
};

export function DialogueTable({
  dialogues,
  statutDuree,
  totalSecondes,
  plafondSecondes,
}: {
  dialogues: DialogueRow[];
  statutDuree: StatutDuree;
  totalSecondes: number | null;
  plafondSecondes: number;
}) {
  if (dialogues.length === 0) return null;

  return (
    <div className="border border-anthracite-line rounded-lg p-4 bg-anthracite-soft">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm uppercase tracking-wide text-or-soft">Dialogue</h2>
        <span className="text-xs text-neutral-400">
          {totalSecondes != null ? `${totalSecondes}s / ${plafondSecondes}s` : "—"}{" "}
          {STATUT_LABEL[statutDuree]}
        </span>
      </div>
      <table className="w-full text-sm">
        <thead className="text-neutral-500 text-xs">
          <tr>
            <th className="text-left py-1">#</th>
            <th className="text-left py-1">Locuteur</th>
            <th className="text-left py-1">Réplique (verbatim)</th>
            <th className="text-right py-1">Durée</th>
          </tr>
        </thead>
        <tbody>
          {dialogues.map((d) => (
            <tr key={d.slot} className="border-t border-anthracite-line">
              <td className="py-1 text-neutral-500">S{d.slot}</td>
              <td className="py-1">{d.locuteur}</td>
              <td className="py-1 text-neutral-300">{d.replique}</td>
              <td className="py-1 text-right text-neutral-400">
                {d.dureeSecondes != null ? `${d.dureeSecondes}s` : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
