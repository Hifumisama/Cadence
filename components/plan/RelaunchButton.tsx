"use client";

import { useTransition } from "react";
import { relancerPlan } from "@/app/plans/actions";

export function RelaunchButton({ planId }: { planId: number }) {
  const [pending, startTransition] = useTransition();

  const lancer = (activerUpscale: boolean) =>
    startTransition(() => relancerPlan(planId, activerUpscale));

  return (
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
  );
}
