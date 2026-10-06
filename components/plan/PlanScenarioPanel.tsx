"use client";

import { useState, useTransition } from "react";
import { updatePlanScenario, developperEnFichePlan } from "@/app/plans/actions";
import {
  ScenarioNarratifFields,
  type ChampsNarratifs,
} from "@/components/plan/ScenarioNarratifFields";

type Valeurs = ChampsNarratifs & {
  titre: string;
  dureeMontageSecondes: number;
};

export function PlanScenarioPanel({
  planId,
  brouillon,
  initial,
}: {
  planId: number;
  brouillon: boolean;
  initial: Valeurs;
}) {
  const [champs, setChamps] = useState(initial);
  const [editionOuverte, setEditionOuverte] = useState(brouillon);
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);

  const majNarratifTitre = (titre: string) => setChamps((c) => ({ ...c, titre }));
  const majNarratif = (cle: keyof ChampsNarratifs, valeur: string) =>
    setChamps((c) => ({ ...c, [cle]: valeur }));

  const onSave = () => {
    startTransition(async () => {
      await updatePlanScenario(planId, champs);
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
      if (!brouillon) setEditionOuverte(false);
    });
  };

  const onDevelopper = () => {
    startTransition(async () => {
      await updatePlanScenario(planId, champs);
      await developperEnFichePlan(planId);
    });
  };

  if (!brouillon && !editionOuverte) {
    return (
      <div className="ctx">
        <div className="ctx-hd">
          <span className="eyebrow">Rappel scénario · lecture seule</span>
          <a onClick={() => setEditionOuverte(true)} style={{ cursor: "pointer" }}>
            Modifier
          </a>
        </div>
        <dl>
          <dt>Description</dt>
          <dd style={{ whiteSpace: "pre-wrap" }}>{initial.description || "—"}</dd>
          <dt>Durée au montage</dt>
          <dd className="num">{initial.dureeMontageSecondes} s</dd>
        </dl>
      </div>
    );
  }

  return (
    <section className="panel">
      <div className="panel-hd">
        <h2>{brouillon ? "Découpage scénario" : "Modifier le scénario"}</h2>
        {brouillon ? <span className="eyebrow">Pas encore de fiche de plan</span> : null}
      </div>
      <div className="panel-bd form-grid">
        <div className="field-group wide">
          <label>Titre</label>
          <input className="field" value={champs.titre} onChange={(e) => majNarratifTitre(e.target.value)} />
        </div>
        <div className="field-group">
          <label>Durée montage (s)</label>
          <input
            className="field field-mono"
            value={champs.dureeMontageSecondes}
            onChange={(e) =>
              setChamps((c) => ({ ...c, dureeMontageSecondes: Number(e.target.value) || 0 }))
            }
          />
        </div>
        <ScenarioNarratifFields valeurs={champs} onChange={majNarratif} />
        <div className="form-actions wide">
          {brouillon ? (
            <button className="btn btn-gold" onClick={onDevelopper} disabled={pending}>
              {pending ? "..." : "Développer en fiche de plan"}
            </button>
          ) : null}
          <button className="btn btn-ghost" onClick={onSave} disabled={pending}>
            {pending ? "..." : saved ? "Enregistré" : "Enregistrer"}
          </button>
          {!brouillon ? (
            <button className="btn btn-ghost" type="button" onClick={() => setEditionOuverte(false)}>
              Fermer
            </button>
          ) : null}
        </div>
      </div>
    </section>
  );
}
