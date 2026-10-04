"use client";

import { useState, useTransition } from "react";
import { creerScene } from "@/app/scenario/actions";
import { ChampsGenreScene } from "./ChampsGenreScene";

export function NouveauSceneForm({ episodeId }: { episodeId: number }) {
  const [ouvert, setOuvert] = useState(false);
  const [titre, setTitre] = useState("");
  const [fonction, setFonction] = useState("");
  const [genre, setGenre] = useState("");
  const [ambiance, setAmbiance] = useState("");
  const [pending, startTransition] = useTransition();

  const onCreer = () => {
    if (!titre.trim()) return;
    startTransition(async () => {
      await creerScene(episodeId, { titre, fonction, genre: genre || null, ambiance });
      setTitre("");
      setFonction("");
      setGenre("");
      setAmbiance("");
      setOuvert(false);
    });
  };

  return (
    <>
      <button className="btn btn-ghost" type="button" onClick={() => setOuvert((v) => !v)}>
        Nouvelle scène
      </button>
      {ouvert ? (
        <section className="plan-form is-new" style={{ margin: "var(--sp-3) 0 var(--sp-5)" }}>
          <div className="new-hd">
            <span className="eyebrow">Création d&rsquo;une nouvelle scène</span>
            <span className="t">Naîtra vide — les plans s&rsquo;y rattachent ensuite</span>
          </div>
          <div className="form-grid">
            <div className="field-group wide">
              <label>Titre</label>
              <input className="field" value={titre} onChange={(e) => setTitre(e.target.value)} placeholder="Ex. Le Labyrinthe" />
            </div>
            <div className="field-group wide">
              <label>Fonction</label>
              <textarea className="field" rows={2} value={fonction} onChange={(e) => setFonction(e.target.value)} />
            </div>
            <ChampsGenreScene genre={genre} ambiance={ambiance} onGenre={setGenre} onAmbiance={setAmbiance} />
            <div className="form-actions wide">
              <button className="btn btn-gold" onClick={onCreer} disabled={pending || !titre.trim()}>
                {pending ? "..." : "Créer la scène"}
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
