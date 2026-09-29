"use client";

import { useTransition } from "react";
import { rattacherPlanAScene } from "@/app/scenario/actions";

/** Sur la page d'un plan : choisir sa scène, ou le détacher. */
export function PlanSceneSelect({
  planId,
  sceneId,
  scenes,
}: {
  planId: number;
  sceneId: number | null;
  scenes: { id: number; titre: string }[];
}) {
  const [pending, startTransition] = useTransition();
  return (
    <div className="field-group">
      <label>Scène</label>
      <select
        className="field"
        value={sceneId ?? ""}
        disabled={pending}
        onChange={(e) => {
          const v = e.target.value;
          startTransition(() => rattacherPlanAScene(planId, v ? Number(v) : null));
        }}
      >
        <option value="">Sans scène</option>
        {scenes.map((sc) => (
          <option key={sc.id} value={sc.id}>
            {sc.titre}
          </option>
        ))}
      </select>
    </div>
  );
}
