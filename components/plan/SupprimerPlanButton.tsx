"use client";

import { useTransition } from "react";
import { supprimerPlan } from "@/app/plans/[numero]/actions";

export function SupprimerPlanButton({ planId, planNumero }: { planId: number; planNumero: number }) {
  const [pending, startTransition] = useTransition();

  const onSupprimer = () => {
    if (!window.confirm(`Supprimer définitivement le plan ${planNumero} ?`)) return;
    startTransition(() => supprimerPlan(planId));
  };

  return (
    <button className="btn btn-danger" type="button" onClick={onSupprimer} disabled={pending}>
      {pending ? "..." : "Supprimer"}
    </button>
  );
}
