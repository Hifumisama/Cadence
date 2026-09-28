"use client";

import { useState, useTransition } from "react";
import { creerPlanScenario } from "@/app/scenario/actions";

type MouvementOption = { id: number; titre: string; planNumeroDebut: number; planNumeroFin: number };

const VIDE = {
  titre: "",
  valeur: "",
  sujet: "",
  decor: "",
  lumiere: "",
  mouvementCamera: "",
  son: "",
  intention: "",
  assetsRequis: "",
  dureeMontageSecondes: "5",
};

export function NouveauPlanForm({
  projectId,
  episodeId,
  prochainNumeroLibre,
  mouvementsOptions,
}: {
  projectId: number;
  episodeId: number;
  prochainNumeroLibre: number;
  mouvementsOptions: MouvementOption[];
}) {
  const [ouvert, setOuvert] = useState(false);
  const [numero, setNumero] = useState(String(prochainNumeroLibre));
  const [mouvementId, setMouvementId] = useState<string>(mouvementsOptions[mouvementsOptions.length - 1]?.id.toString() ?? "");
  const [champs, setChamps] = useState(VIDE);
  const [pending, startTransition] = useTransition();

  const majChamp = (cle: keyof typeof VIDE) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setChamps((c) => ({ ...c, [cle]: e.target.value }));

  const onCreer = () => {
    if (!champs.titre.trim() || !numero) return;
    startTransition(async () => {
      await creerPlanScenario(projectId, episodeId, {
        numero: Number(numero),
        titre: champs.titre,
        mouvementId: mouvementId ? Number(mouvementId) : null,
        dureeMontageSecondes: Number(champs.dureeMontageSecondes) || 5,
        valeur: champs.valeur,
        sujet: champs.sujet,
        decor: champs.decor,
        lumiere: champs.lumiere,
        mouvementCamera: champs.mouvementCamera,
        son: champs.son,
        intention: champs.intention,
        assetsRequis: champs.assetsRequis,
      });
      setChamps(VIDE);
      setNumero(String(prochainNumeroLibre + 10));
      setOuvert(false);
    });
  };

  return (
    <>
      <button className="btn btn-primary" type="button" onClick={() => setOuvert((v) => !v)}>
        Nouveau plan <span className="k">prochain libre : {prochainNumeroLibre}</span>
      </button>
      {ouvert ? (
        <section className="plan-form is-new" style={{ margin: "var(--sp-3) 0 var(--sp-5)" }}>
          <div className="new-hd">
            <span className="eyebrow">Création d&rsquo;un nouveau plan</span>
            <span className="t">Naîtra en brouillon</span>
          </div>
          <div className="form-grid">
            <div className="field-group">
              <label>Numéro</label>
              <input className="field field-mono" value={numero} onChange={(e) => setNumero(e.target.value)} />
            </div>
            <div className="field-group">
              <label>Mouvement narratif</label>
              <select className="field" value={mouvementId} onChange={(e) => setMouvementId(e.target.value)}>
                <option value="">Sans mouvement</option>
                {mouvementsOptions.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.titre} ({String(m.planNumeroDebut).padStart(3, "0")}→{String(m.planNumeroFin).padStart(3, "0")})
                  </option>
                ))}
              </select>
            </div>
            <div className="field-group wide">
              <label>Titre</label>
              <input className="field" value={champs.titre} onChange={majChamp("titre")} placeholder="Ex. Le seuil du labyrinthe" />
            </div>
            <div className="field-group">
              <label>Durée montage (s)</label>
              <input className="field field-mono" value={champs.dureeMontageSecondes} onChange={majChamp("dureeMontageSecondes")} />
            </div>
            <div className="field-group">
              <label>Valeur de plan</label>
              <input className="field" value={champs.valeur} onChange={majChamp("valeur")} placeholder="Très gros plan" />
            </div>
            <div className="field-group wide">
              <label>Sujet</label>
              <textarea className="field" rows={2} value={champs.sujet} onChange={majChamp("sujet")} placeholder="Ce qu'on voit, en une phrase" />
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
              <input className="field" value={champs.assetsRequis} onChange={majChamp("assetsRequis")} placeholder="Ex. Maya visage, clair de lune, mur de pierre" />
            </div>
            <div className="form-actions wide">
              <button className="btn btn-gold" onClick={onCreer} disabled={pending || !champs.titre.trim()}>
                {pending ? "..." : "Créer le brouillon"}
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
