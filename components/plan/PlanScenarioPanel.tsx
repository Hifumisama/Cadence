"use client";

import { useState, useTransition } from "react";
import { updatePlanScenario } from "@/app/plans/actions";
import { DUREE_GENERATION_MAX, DUREE_GENERATION_MIN } from "@/lib/plan-checks";
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
  dureeGeneration,
  musique = null,
}: {
  planId: number;
  projectId: number;
  planUuid: string;
  brouillon: boolean;
  initial: Valeurs;
  /** La demande « Générer la fiche » déjà en cours sur ce plan, s'il y en a une. */
  demandeEnCours?: number | null;
  /** La durée de génération du plan (fixée par la fiche et par « Itérer », pas retouchée ici) : montrée à côté de la durée au montage. */
  dureeGeneration?: number;
  /** Le timecode de musique du plan, s'il y en a un. */
  musique?: string | null;
}) {
  const [champs, setChamps] = useState(initial);
  const [editionOuverte, setEditionOuverte] = useState(brouillon);
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const [lu, setLu] = useState(false);

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
    const horsBornes = dureeGeneration != null && (dureeGeneration < DUREE_GENERATION_MIN || dureeGeneration > DUREE_GENERATION_MAX);
    return (
      <section className="sp-entete" id="fp-scenario" aria-label="Scénario du plan">
        <p className={`sp-description${initial.description ? "" : " is-vide"}${lu ? " is-lu" : ""}`}>{initial.description || "Pas encore de description."}</p>
        <div className="sp-ligne">
          <ul className="sp-puces">
            <li>
              <span>Montage</span> <b className="num">{initial.dureeMontageSecondes} s</b>
            </li>
            {dureeGeneration != null ? (
              <li className={horsBornes ? "is-alerte" : undefined} title={horsBornes ? `H3 génère de ${DUREE_GENERATION_MIN} à ${DUREE_GENERATION_MAX} s : demande à l'agent de raccourcir ou d'allonger le plan dans ta consigne.` : "La durée change avec le contenu du plan : demande-la dans ta consigne."}>
                <span>Génération</span> <b className="num">{dureeGeneration} s</b>
                {horsBornes ? <em> hors bornes</em> : null}
              </li>
            ) : null}
            <li>
              <span>Liaison</span> <b>{LIBELLE_LIAISON[initial.liaison]}</b>
            </li>
            {musique ? (
              <li>
                <span>Musique</span> <b className="num">{musique}</b>
              </li>
            ) : null}
          </ul>
          <span className="sp-gestes">
            {initial.description.length > 220 ? (
              <button type="button" className="tm-lien" onClick={() => setLu((v) => !v)}>
                {lu ? "Réduire" : "Tout lire"}
              </button>
            ) : null}
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditionOuverte(true)}>
              Modifier
            </button>
          </span>
        </div>
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
