"use client";

import { useState, useTransition } from "react";
import { updatePlanParametres } from "@/app/plans/actions";

// Bornes imposées par H3 : pas de génération plus courte ni plus longue.
const DUREE_MIN = 5;
const DUREE_MAX = 15;

export function PlanParamsEditor({
  planId,
  fpsInitial,
  dureeInitiale,
  timecodeMusique,
  seed,
}: {
  planId: number;
  fpsInitial: number;
  dureeInitiale: number;
  timecodeMusique: string | null;
  seed: string | null;
}) {
  const [fps, setFps] = useState(fpsInitial);
  const dureeBornee = Math.min(DUREE_MAX, Math.max(DUREE_MIN, dureeInitiale));
  const [duree, setDuree] = useState(dureeBornee);
  // Dernières valeurs écrites en base : « Prévisualiser » et « Rendu final » ne lisent que la base.
  const [enregistre, setEnregistre] = useState({ fps: fpsInitial, duree: dureeBornee });
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const modifie = fps !== enregistre.fps || duree !== enregistre.duree;

  const onSave = () => {
    const valeurs = { fps, duree };
    startTransition(async () => {
      await updatePlanParametres(planId, { fps: valeurs.fps, dureeGenerationSecondes: valeurs.duree });
      setEnregistre(valeurs);
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    });
  };
  // Lâcher le curseur ou sortir du champ enregistre : changer la durée puis lancer un rendu doit utiliser la nouvelle durée.
  const enregistrerSiModifie = () => {
    if (modifie && !pending) onSave();
  };

  return (
    <section className="panel">
      <div className="panel-hd">
        <h2>Paramètres globaux</h2>
        <button className="btn btn-ghost btn-sm" type="button" onClick={onSave} disabled={pending || !modifie}>
          {pending ? "..." : modifie ? "Enregistrer" : "Enregistré"}
        </button>
      </div>
      <div className="panel-bd">
        <div className="params-row">
          <div className="field-group params-duree">
            <label htmlFor={`duree-${planId}`}>
              Durée de génération <span className="num params-valeur">{duree} s</span>
            </label>
            <input
              id={`duree-${planId}`}
              type="range"
              className="slider"
              min={DUREE_MIN}
              max={DUREE_MAX}
              step={1}
              value={duree}
              onChange={(e) => setDuree(Number(e.target.value))}
              onPointerUp={enregistrerSiModifie}
              onKeyUp={enregistrerSiModifie}
              onBlur={enregistrerSiModifie}
            />
            <div className="slider-bornes num" aria-hidden="true">
              <span>{DUREE_MIN} s</span>
              <span>{DUREE_MAX} s</span>
            </div>
          </div>
          <div className="field-group params-fps">
            <label htmlFor={`fps-${planId}`}>FPS</label>
            <input
              id={`fps-${planId}`}
              type="number"
              className="field field-mono"
              min={1}
              value={fps}
              onChange={(e) => setFps(Number(e.target.value))}
              onBlur={enregistrerSiModifie}
            />
          </div>
        </div>
        {timecodeMusique || seed ? (
          <p className="params-meta">
            {timecodeMusique ? (
              <span>
                Musique <span className="num">{timecodeMusique}</span>
              </span>
            ) : null}
            {seed ? (
              <span>
                Seed <span className="num">{seed}</span>
              </span>
            ) : null}
          </p>
        ) : null}
      </div>
    </section>
  );
}
