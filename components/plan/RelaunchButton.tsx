"use client";

import { useState, useTransition } from "react";
import { relancerPlan } from "@/app/plans/actions";

export function RelaunchButton({ planId }: { planId: number }) {
  const [pending, startTransition] = useTransition();
  const [erreur, setErreur] = useState<string | null>(null);

  const lancer = (activerUpscale: boolean) =>
    startTransition(async () => {
      const r = await relancerPlan(planId, activerUpscale);
      setErreur(r.ok ? null : r.erreur);
    });

  return (
    <div className="flex flex-col gap-1">
      <div className="flex gap-2">
        <button
          onClick={() => lancer(false)}
          disabled={pending}
          className="rounded border border-or-soft px-3 py-2 text-sm text-or hover:bg-or/10 disabled:opacity-50"
          title="Rendu basse résolution, sans upscale — pour itérer vite sur le prompt (F03)"
        >
          {pending ? "..." : "Prévisualiser"}
        </button>
        <button
          onClick={() => lancer(true)}
          disabled={pending}
          className="rounded border border-ecarlate px-3 py-2 text-sm text-ecarlate-glow hover:bg-ecarlate/10 disabled:opacity-50"
          title="Rendu final avec upscale"
        >
          {pending ? "..." : "Rendu final"}
        </button>
      </div>
      {erreur ? (
        <span className="tiny-note" role="alert" style={{ color: "var(--ecarlate-glow)", maxWidth: 360 }}>
          {erreur}
        </span>
      ) : null}
    </div>
  );
}
