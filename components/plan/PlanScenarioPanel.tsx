"use client";

import { useState, useTransition } from "react";
import { updatePlanScenario } from "@/app/plans/actions";
import { GenererFiche } from "@/components/plan/GenererFiche";
import { LIAISONS, LIBELLE_LIAISON, type Liaison } from "@/lib/plan-liaison";
import {
  ScenarioNarratifFields,
  type ChampsNarratifs,
} from "@/components/plan/ScenarioNarratifFields";

type Valeurs = ChampsNarratifs & {
  titre: string;
  dureeMontageSecondes: number;
  liaison: Liaison;
};

export function PlanScenarioPanel({
  planId,
  projectId,
  planUuid,
  brouillon,
  initial,
  demandeEnCours = null,
}: {
  planId: number;
  projectId: number;
  planUuid: string;
  brouillon: boolean;
  initial: Valeurs;
  /** La demande « Générer la fiche » déjà en cours sur ce plan, s'il y en a une. */
  demandeEnCours?: number | null;
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

  // « Développer » écrit réellement la fiche : le scénario du plan est enregistré, puis l'agent l'écrit en arrière-plan (même demande que « Générer la fiche »).
  const enregistrerAvant = async () => {
    await updatePlanScenario(planId, champs);
    return true;
  };

  if (!brouillon && !editionOuverte) {
    return (
      <section className="sp-carte" id="fp-scenario" aria-label="Scénario du plan">
        <header>
          <span className="eyebrow">Ce qui se passe</span>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditionOuverte(true)}>
            Modifier
          </button>
        </header>
        <p className={`sp-description${initial.description ? "" : " is-vide"}`}>{initial.description || "Pas encore de description."}</p>
        <dl className="sp-meta">
          <div>
            <dt>Durée au montage</dt>
            <dd className="num">{initial.dureeMontageSecondes} s</dd>
          </div>
          <div>
            <dt>Liaison avec le plan précédent</dt>
            <dd>{LIBELLE_LIAISON[initial.liaison]}</dd>
          </div>
        </dl>
      </section>
    );
  }

  return (
    <section className="panel" id="fp-scenario">
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
        <div className="field-group">
          <label>Liaison avec le plan précédent</label>
          <select className="field" value={champs.liaison} onChange={(e) => setChamps((c) => ({ ...c, liaison: e.target.value as Liaison }))}>
            {LIAISONS.map((l) => (
              <option key={l} value={l}>
                {LIBELLE_LIAISON[l]}
              </option>
            ))}
          </select>
        </div>
        <ScenarioNarratifFields valeurs={champs} onChange={majNarratif} />
        <div className="form-actions wide">
          {brouillon ? (
            <GenererFiche projectId={projectId} planUuid={planUuid} demandeEnCours={demandeEnCours} libelle="Développer en fiche de plan" className="btn btn-gold" avant={enregistrerAvant} />
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
