"use client";

import { useState, useTransition } from "react";
import { updateScenarioGlobal } from "@/app/scenario/actions";

const FIELDS: { cle: "clauseStyle" | "scenarioArc" | "scenarioStyle" | "scenarioContinuite" | "scenarioRimes" | "scenarioPieges"; label: string; wide?: boolean }[] = [
  { cle: "clauseStyle", label: "Clause de style (image/vidéo)", wide: true },
  { cle: "scenarioArc", label: "Arc · 2 phrases", wide: true },
  { cle: "scenarioStyle", label: "Style visuel" },
  { cle: "scenarioRimes", label: "Rimes / échos" },
  { cle: "scenarioContinuite", label: "Règles de continuité" },
  { cle: "scenarioPieges", label: "Pièges à éviter" },
];

export function ScenarioGlobalsEditor({ projectId, valeurs }: { projectId: number; valeurs: Record<string, string> }) {
  const [champs, setChamps] = useState(valeurs);
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);

  const onSave = () => {
    startTransition(async () => {
      for (const f of FIELDS) {
        if (champs[f.cle] !== valeurs[f.cle]) {
          await updateScenarioGlobal(projectId, f.cle, champs[f.cle] ?? "");
        }
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    });
  };

  return (
    <section className="panel" style={{ marginTop: "var(--sp-5)" }}>
      <div className="panel-hd">
        <h2>Globaux du scénario</h2>
        <button className="btn btn-ghost" onClick={onSave} disabled={pending}>
          {pending ? "..." : saved ? "Enregistré" : "Enregistrer"}
        </button>
      </div>
      <div className="panel-bd form-grid">
        {FIELDS.map((f) => (
          <div key={f.cle} className={`field-group${f.wide ? " wide" : ""}`}>
            <label htmlFor={f.cle}>{f.label}</label>
            <textarea
              id={f.cle}
              className="field"
              rows={2}
              value={champs[f.cle] ?? ""}
              onChange={(e) => setChamps((c) => ({ ...c, [f.cle]: e.target.value }))}
            />
          </div>
        ))}
      </div>
    </section>
  );
}
