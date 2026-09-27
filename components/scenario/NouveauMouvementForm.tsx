"use client";

import { useState, useTransition } from "react";
import { creerMouvement } from "@/app/scenario/actions";

export function NouveauMouvementForm() {
  const [ouvert, setOuvert] = useState(false);
  const [titre, setTitre] = useState("");
  const [debut, setDebut] = useState("");
  const [fin, setFin] = useState("");
  const [duree, setDuree] = useState("");
  const [fonction, setFonction] = useState("");
  const [pending, startTransition] = useTransition();

  const onCreer = () => {
    if (!titre.trim() || !debut || !fin) return;
    startTransition(async () => {
      await creerMouvement({
        titre,
        planNumeroDebut: Number(debut),
        planNumeroFin: Number(fin),
        fonction,
        dureeApproxSecondes: duree ? Number(duree) : null,
      });
      setTitre("");
      setDebut("");
      setFin("");
      setDuree("");
      setFonction("");
      setOuvert(false);
    });
  };

  return (
    <>
      <button className="btn btn-ghost" type="button" onClick={() => setOuvert((v) => !v)}>
        Nouveau mouvement
      </button>
      {ouvert ? (
        <section className="plan-form is-new" style={{ margin: "var(--sp-3) 0 var(--sp-5)" }}>
          <div className="new-hd">
            <span className="eyebrow">Création d&rsquo;un nouveau mouvement</span>
          </div>
          <div className="form-grid">
            <div className="field-group wide">
              <label>Titre</label>
              <input className="field" value={titre} onChange={(e) => setTitre(e.target.value)} placeholder="Ex. Le Labyrinthe" />
            </div>
            <div className="field-group">
              <label>Plan de début</label>
              <input className="field field-mono" value={debut} onChange={(e) => setDebut(e.target.value)} />
            </div>
            <div className="field-group">
              <label>Plan de fin</label>
              <input className="field field-mono" value={fin} onChange={(e) => setFin(e.target.value)} />
            </div>
            <div className="field-group">
              <label>Durée approx. (s)</label>
              <input className="field field-mono" value={duree} onChange={(e) => setDuree(e.target.value)} />
            </div>
            <div className="field-group wide">
              <label>Fonction</label>
              <textarea className="field" rows={2} value={fonction} onChange={(e) => setFonction(e.target.value)} />
            </div>
            <div className="form-actions wide">
              <button className="btn btn-gold" onClick={onCreer} disabled={pending || !titre.trim()}>
                {pending ? "..." : "Créer le mouvement"}
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
