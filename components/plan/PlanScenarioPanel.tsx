"use client";

import { useState, useTransition } from "react";
import { updatePlanScenario, developperEnFichePlan } from "@/app/plans/[numero]/actions";

type Valeurs = {
  titre: string;
  valeur: string;
  sujet: string;
  decor: string;
  lumiere: string;
  mouvementCamera: string;
  son: string;
  intention: string;
  assetsRequis: string;
  dureeMontageSecondes: number;
};

export function PlanScenarioPanel({
  planId,
  planNumero,
  brouillon,
  initial,
}: {
  planId: number;
  planNumero: number;
  brouillon: boolean;
  initial: Valeurs;
}) {
  const [champs, setChamps] = useState(initial);
  const [editionOuverte, setEditionOuverte] = useState(brouillon);
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);

  type ChampTexte = Exclude<keyof Valeurs, "dureeMontageSecondes">;
  const majChamp = (cle: ChampTexte) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => setChamps((c) => ({ ...c, [cle]: e.target.value }));

  const onSave = () => {
    startTransition(async () => {
      await updatePlanScenario(planId, planNumero, champs);
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
      if (!brouillon) setEditionOuverte(false);
    });
  };

  const onDevelopper = () => {
    startTransition(async () => {
      await updatePlanScenario(planId, planNumero, champs);
      await developperEnFichePlan(planId, planNumero);
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
          <dt>Sujet</dt>
          <dd>{initial.sujet || "—"}</dd>
          <dt>Décor</dt>
          <dd>{initial.decor || "—"}</dd>
          <dt>Lumière</dt>
          <dd>{initial.lumiere || "—"}</dd>
          <dt>Intention</dt>
          <dd>{initial.intention || "—"}</dd>
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
          <input className="field" value={champs.titre} onChange={majChamp("titre")} />
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
        <div className="field-group">
          <label>Valeur de plan</label>
          <input className="field" value={champs.valeur} onChange={majChamp("valeur")} />
        </div>
        <div className="field-group wide">
          <label>Sujet</label>
          <textarea className="field" rows={2} value={champs.sujet} onChange={majChamp("sujet")} />
        </div>
        <div className="field-group">
          <label>Décor</label>
          <textarea className="field" rows={2} value={champs.decor} onChange={majChamp("decor")} />
        </div>
        <div className="field-group">
          <label>Lumière</label>
          <textarea className="field" rows={2} value={champs.lumiere} onChange={majChamp("lumiere")} />
        </div>
        <div className="field-group">
          <label>Mouvement caméra</label>
          <textarea className="field" rows={2} value={champs.mouvementCamera} onChange={majChamp("mouvementCamera")} />
        </div>
        <div className="field-group">
          <label>Son</label>
          <textarea className="field" rows={2} value={champs.son} onChange={majChamp("son")} />
        </div>
        <div className="field-group wide">
          <label>Intention</label>
          <textarea className="field" rows={2} value={champs.intention} onChange={majChamp("intention")} />
        </div>
        <div className="field-group wide">
          <label>Assets requis</label>
          <input className="field" value={champs.assetsRequis} onChange={majChamp("assetsRequis")} />
        </div>
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
