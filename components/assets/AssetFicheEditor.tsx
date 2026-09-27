"use client";

import { useState, useTransition } from "react";
import { updateAsset } from "@/app/assets/actions";

export function AssetFicheEditor({
  assetId,
  description,
  promptGeneration,
  critique,
}: {
  assetId: number;
  description: string;
  promptGeneration: string;
  critique: boolean;
}) {
  const [desc, setDesc] = useState(description);
  const [prompt, setPrompt] = useState(promptGeneration);
  const [crit, setCrit] = useState(critique);
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);

  const onSave = () => {
    startTransition(async () => {
      await updateAsset(assetId, { description: desc, promptGeneration: prompt, critique: crit });
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    });
  };

  return (
    <div className="field-group wide" style={{ gap: "var(--sp-3)" }}>
      <div className="field-group">
        <label>Description canonique</label>
        <textarea className="field" rows={3} value={desc} onChange={(e) => setDesc(e.target.value)} />
      </div>
      <div className="field-group">
        <label>Prompt de génération</label>
        <textarea
          className="field field-mono"
          rows={4}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Prompt à coller dans Krea 2 / Qwen Image Edit / Qwen3-TTS selon le type"
        />
      </div>
      <div className="form-actions">
        <label className="chk">
          <input type="checkbox" checked={crit} onChange={(e) => setCrit(e.target.checked)} />
          Critique
        </label>
        <button className="btn btn-ghost" onClick={onSave} disabled={pending}>
          {pending ? "..." : saved ? "Enregistré" : "Enregistrer"}
        </button>
      </div>
    </div>
  );
}
