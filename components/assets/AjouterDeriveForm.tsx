"use client";

import { useState, useTransition } from "react";
import { creerAsset } from "@/app/assets/actions";

const TYPES = ["personnage", "decor", "voix", "prop", "fx", "keyframe", "autre"];

export function AjouterDeriveForm({
  parentId,
  parentType,
}: {
  parentId: number;
  parentType: string;
}) {
  const [code, setCode] = useState("");
  const [type, setType] = useState(parentType);
  const [description, setDescription] = useState("");
  const [critique, setCritique] = useState(false);
  const [pending, startTransition] = useTransition();

  const onAjouter = () => {
    if (!code.trim()) return;
    startTransition(async () => {
      await creerAsset({ code: code.trim(), type, description, critique, deriveDeId: parentId });
      setCode("");
      setDescription("");
      setCritique(false);
    });
  };

  return (
    <div className="form-grid" style={{ marginTop: "var(--sp-4)", paddingTop: "var(--sp-3)", borderTop: "1px dashed var(--line-strong)" }}>
      <div className="field-group">
        <label>Code du dérivé</label>
        <input className="field field-mono" value={code} onChange={(e) => setCode(e.target.value)} placeholder="ex. CHAR_maya_plan_yeux" />
      </div>
      <div className="field-group">
        <label>Type</label>
        <select className="field" value={type} onChange={(e) => setType(e.target.value)}>
          {TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </div>
      <div className="field-group wide">
        <label>Description</label>
        <input className="field" value={description} onChange={(e) => setDescription(e.target.value)} />
      </div>
      <div className="form-actions wide">
        <label className="chk">
          <input type="checkbox" checked={critique} onChange={(e) => setCritique(e.target.checked)} />
          Critique
        </label>
        <button className="btn btn-gold" onClick={onAjouter} disabled={pending || !code.trim()}>
          {pending ? "..." : "Ajouter le dérivé"}
        </button>
      </div>
    </div>
  );
}
