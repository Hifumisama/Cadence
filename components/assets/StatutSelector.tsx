"use client";

import { useTransition } from "react";
import { updateAssetStatut } from "@/app/assets/actions";

const OPTIONS: { valeur: "a_produire" | "en_cours" | "valide"; label: string; glyph: string }[] = [
  { valeur: "a_produire", label: "à produire", glyph: "⬜" },
  { valeur: "en_cours", label: "en cours", glyph: "🟡" },
  { valeur: "valide", label: "validé", glyph: "✅" },
];

export function StatutSelector({
  assetId,
  statut,
}: {
  assetId: number;
  statut: "a_produire" | "en_cours" | "valide";
}) {
  const [pending, startTransition] = useTransition();

  return (
    <div className="stat-seg">
      {OPTIONS.map((o) => (
        <button
          key={o.valeur}
          type="button"
          aria-pressed={statut === o.valeur}
          disabled={pending}
          onClick={() => startTransition(() => updateAssetStatut(assetId, o.valeur))}
        >
          <span className="g">{o.glyph}</span>
          <span className="t">{o.label}</span>
        </button>
      ))}
    </div>
  );
}
