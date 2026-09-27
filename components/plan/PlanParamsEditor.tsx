"use client";

import { useState, useTransition } from "react";
import { updatePlanParametres } from "@/app/plans/[numero]/actions";

export function PlanParamsEditor({
  planId,
  planNumero,
  fpsInitial,
  dureeInitiale,
  timecodeMusique,
  seed,
}: {
  planId: number;
  planNumero: number;
  fpsInitial: number;
  dureeInitiale: number;
  timecodeMusique: string | null;
  seed: string | null;
}) {
  const [fps, setFps] = useState(fpsInitial);
  const [duree, setDuree] = useState(dureeInitiale);
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);

  const onSave = () => {
    startTransition(async () => {
      await updatePlanParametres(planId, planNumero, { fps, dureeGenerationSecondes: duree });
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    });
  };

  return (
    <div className="border border-anthracite-line rounded-lg p-4 bg-anthracite-soft text-sm">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm uppercase tracking-wide text-or-soft">Paramètres</h2>
        <button
          onClick={onSave}
          disabled={pending}
          className="text-xs border border-or-soft rounded px-2 py-0.5 text-or hover:bg-or/10 disabled:opacity-50"
        >
          {pending ? "..." : saved ? "Enregistré" : "Enregistrer"}
        </button>
      </div>
      <div className="space-y-2 text-neutral-300">
        <label className="flex items-center justify-between gap-3">
          <span className="text-neutral-400">Durée génération (s)</span>
          <input
            type="number"
            min={1}
            value={duree}
            onChange={(e) => setDuree(Number(e.target.value))}
            className="w-20 bg-anthracite border border-anthracite-line rounded px-2 py-1 text-right font-data"
          />
        </label>
        <label className="flex items-center justify-between gap-3">
          <span className="text-neutral-400">FPS</span>
          <input
            type="number"
            min={1}
            value={fps}
            onChange={(e) => setFps(Number(e.target.value))}
            className="w-20 bg-anthracite border border-anthracite-line rounded px-2 py-1 text-right font-data"
          />
        </label>
        {timecodeMusique ? (
          <div className="flex items-center justify-between gap-3">
            <span className="text-neutral-400">Musique</span>
            <span>{timecodeMusique}</span>
          </div>
        ) : null}
        {seed ? (
          <div className="flex items-center justify-between gap-3">
            <span className="text-neutral-400">Seed</span>
            <span className="font-data">{seed}</span>
          </div>
        ) : null}
      </div>
    </div>
  );
}
