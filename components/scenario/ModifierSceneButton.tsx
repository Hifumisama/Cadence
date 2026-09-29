"use client";

import { useState, useTransition } from "react";
import { modifierScene } from "@/app/scenario/actions";

/** Bouton « Modifier » d'une scène : titre et fonction (description). Le
 * formulaire s'ouvre sous l'en-tête, sur toute la largeur. */
export function ModifierSceneButton({
  sceneId,
  titre,
  fonction,
}: {
  sceneId: number;
  titre: string;
  fonction: string;
}) {
  const [ouvert, setOuvert] = useState(false);
  const [t, setT] = useState(titre);
  const [f, setF] = useState(fonction);
  const [pending, startTransition] = useTransition();

  const ouvrir = () => {
    setT(titre);
    setF(fonction);
    setOuvert(true);
  };
  const enregistrer = () => {
    if (!t.trim()) return;
    startTransition(async () => {
      await modifierScene(sceneId, { titre: t, fonction: f });
      setOuvert(false);
    });
  };

  return (
    <>
      <button className="btn btn-ghost btn-sm" type="button" onClick={() => (ouvert ? setOuvert(false) : ouvrir())}>
        Modifier
      </button>
      {ouvert ? (
        <section className="plan-form is-new" style={{ flexBasis: "100%", margin: "var(--sp-2) 0" }}>
          <div className="form-grid">
            <div className="field-group wide">
              <label>Titre</label>
              <input className="field" value={t} onChange={(e) => setT(e.target.value)} />
            </div>
            <div className="field-group wide">
              <label>Description</label>
              <textarea className="field" rows={3} value={f} onChange={(e) => setF(e.target.value)} />
            </div>
            <div className="form-actions wide">
              <button className="btn btn-gold" type="button" onClick={enregistrer} disabled={pending || !t.trim()}>
                {pending ? "..." : "Enregistrer"}
              </button>
              <button className="btn btn-ghost" type="button" onClick={() => setOuvert(false)}>
                Annuler
              </button>
            </div>
          </div>
        </section>
      ) : null}
    </>
  );
}
