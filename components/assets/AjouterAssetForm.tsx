"use client";

import { useState, useTransition } from "react";
import { creerAsset } from "@/app/assets/actions";

const TYPES = ["personnage", "decor", "voix", "prop", "fx", "keyframe", "autre"];

export function AjouterAssetForm() {
  const [code, setCode] = useState("");
  const [type, setType] = useState("personnage");
  const [description, setDescription] = useState("");
  const [critique, setCritique] = useState(false);
  const [pending, startTransition] = useTransition();

  const onAjouter = () => {
    if (!code.trim()) return;
    startTransition(async () => {
      await creerAsset({ code: code.trim(), type, description, critique, deriveDeId: null });
      setCode("");
      setDescription("");
      setCritique(false);
    });
  };

  return (
    <section className="panel" style={{ marginBottom: "var(--sp-5)" }}>
      <div className="panel-hd">
        <h2>Nouveau sujet</h2>
      </div>
      <div className="panel-bd" style={{ display: "flex", flexWrap: "wrap", gap: "var(--sp-3)", alignItems: "end" }}>
        <div className="field-group" style={{ minWidth: 160 }}>
          <label>Code</label>
          <input className="field field-mono" value={code} onChange={(e) => setCode(e.target.value)} placeholder="PROP_..." />
        </div>
        <div className="field-group" style={{ minWidth: 140 }}>
          <label>Type</label>
          <select className="field" value={type} onChange={(e) => setType(e.target.value)}>
            {TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
        <div className="field-group" style={{ flex: 1, minWidth: 200 }}>
          <label>Description</label>
          <input className="field" value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <label className="chk">
          <input type="checkbox" checked={critique} onChange={(e) => setCritique(e.target.checked)} />
          Critique
        </label>
        <button className="btn btn-gold" onClick={onAjouter} disabled={pending || !code.trim()}>
          {pending ? "..." : "Ajouter"}
        </button>
      </div>
    </section>
  );
}
