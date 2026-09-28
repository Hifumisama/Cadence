"use client";

import { useState, useTransition } from "react";
import { ajouterRef, supprimerRef } from "@/app/plans/[numero]/actions";
import { MAX_REFS, type RefLabel } from "@/lib/plan-checks";

type RefRow = {
  id: number;
  type: RefLabel["type"];
  slot: number;
  role: string | null;
  asset: { id: number; code: string; statut: string } | null;
};

type AssetOption = { id: number; code: string; type: string };

const LABEL_TYPE: Record<RefLabel["type"], string> = {
  picture: "Picture",
  video: "Video",
  audio: "Audio",
};

function AddRefRow({
  planId,
  planNumero,
  type,
  assets,
  disabled,
}: {
  planId: number;
  planNumero: number;
  type: RefLabel["type"];
  assets: AssetOption[];
  disabled: boolean;
}) {
  const [assetId, setAssetId] = useState<number | "">("");
  const [role, setRole] = useState("");
  const [pending, startTransition] = useTransition();

  if (disabled) {
    return <p className="text-xs text-neutral-500">Maximum atteint ({MAX_REFS[type]}).</p>;
  }

  const onAdd = () => {
    if (!assetId) return;
    startTransition(async () => {
      await ajouterRef(planId, type, Number(assetId), role);
      setAssetId("");
      setRole("");
    });
  };

  return (
    <div className="flex flex-wrap gap-2 items-center">
      <select
        value={assetId}
        onChange={(e) => setAssetId(e.target.value ? Number(e.target.value) : "")}
        className="bg-anthracite border border-anthracite-line rounded px-2 py-1 text-sm flex-1 min-w-[140px]"
      >
        <option value="">Choisir un asset...</option>
        {assets.map((a) => (
          <option key={a.id} value={a.id}>
            {a.code}
          </option>
        ))}
      </select>
      <input
        value={role}
        onChange={(e) => setRole(e.target.value)}
        placeholder="rôle (optionnel)"
        className="bg-anthracite border border-anthracite-line rounded px-2 py-1 text-sm flex-1 min-w-[100px]"
      />
      <button
        onClick={onAdd}
        disabled={!assetId || pending}
        className="text-xs border border-or-soft rounded px-2 py-1 text-or hover:bg-or/10 disabled:opacity-50"
      >
        {pending ? "..." : "Ajouter"}
      </button>
    </div>
  );
}

export function RefsPanel({
  planId,
  planNumero,
  refs,
  assets,
}: {
  planId: number;
  planNumero: number;
  refs: RefRow[];
  assets: AssetOption[];
}) {
  const [, startTransition] = useTransition();
  const parType = (t: RefLabel["type"]) => refs.filter((r) => r.type === t);

  const onSupprimer = (refId: number) => {
    startTransition(async () => {
      await supprimerRef(refId);
    });
  };

  return (
    <div className="border border-anthracite-line rounded-lg p-4 bg-anthracite-soft">
      <h2 className="text-sm uppercase tracking-wide text-or-soft mb-3">Références</h2>
      {(["picture", "video", "audio"] as const).map((type) => {
        const items = parType(type).sort((a, b) => a.slot - b.slot);
        return (
          <div key={type} className="mb-4">
            <div className="text-xs text-neutral-500 mb-1">{LABEL_TYPE[type]}</div>
            <ul className="space-y-1 mb-2">
              {items.map((r) => (
                <li
                  key={r.id}
                  className="text-sm flex items-center gap-2 text-neutral-300"
                >
                  <span className="text-neutral-500">
                    &lt;{LABEL_TYPE[type]} {r.slot}&gt;
                  </span>
                  <span>{r.asset?.code ?? "—"}</span>
                  {r.asset && r.asset.statut !== "valide" ? (
                    <span className="text-xs text-or-glow">
                      ({r.asset.statut === "en_cours" ? "🟡" : "⬜"})
                    </span>
                  ) : null}
                  {r.role ? (
                    <span className="text-xs text-neutral-500">— {r.role}</span>
                  ) : null}
                  <button
                    onClick={() => onSupprimer(r.id)}
                    className="ml-auto text-xs text-neutral-500 hover:text-ecarlate-glow"
                  >
                    supprimer
                  </button>
                </li>
              ))}
              {items.length === 0 ? (
                <li className="text-xs text-neutral-500">Aucune référence.</li>
              ) : null}
            </ul>
            <AddRefRow
              planId={planId}
              planNumero={planNumero}
              type={type}
              assets={assets}
              disabled={items.length >= MAX_REFS[type]}
            />
          </div>
        );
      })}
    </div>
  );
}
