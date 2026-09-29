"use client";

import { useState, useTransition } from "react";
import { creerPlanScenario } from "@/app/scenario/actions";
import {
  ScenarioNarratifFields,
  type ChampsNarratifs,
} from "@/components/plan/ScenarioNarratifFields";

type SceneOption = { id: number; titre: string };

const VIDE = {
  titre: "",
  description: "",
  dureeMontageSecondes: "5",
};

export function NouveauPlanForm({
  projectId,
  episodeId,
  scenesOptions,
}: {
  projectId: number;
  episodeId: number;
  scenesOptions: SceneOption[];
}) {
  const [ouvert, setOuvert] = useState(false);
  const [sceneId, setSceneId] = useState<string>(scenesOptions[scenesOptions.length - 1]?.id.toString() ?? "");
  const [champs, setChamps] = useState(VIDE);
  const [pending, startTransition] = useTransition();

  const majChamp = (cle: keyof typeof VIDE) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setChamps((c) => ({ ...c, [cle]: e.target.value }));
  const majNarratif = (cle: keyof ChampsNarratifs, valeur: string) =>
    setChamps((c) => ({ ...c, [cle]: valeur }));

  const onCreer = () => {
    if (!champs.titre.trim()) return;
    startTransition(async () => {
      await creerPlanScenario(projectId, episodeId, {
        titre: champs.titre,
        sceneId: sceneId ? Number(sceneId) : null,
        dureeMontageSecondes: Number(champs.dureeMontageSecondes) || 5,
        description: champs.description,
      });
      setChamps(VIDE);
      setOuvert(false);
    });
  };

  return (
    <>
      <button className="btn btn-primary" type="button" onClick={() => setOuvert((v) => !v)}>
        Nouveau plan
      </button>
      {ouvert ? (
        <section className="plan-form is-new" style={{ margin: "var(--sp-3) 0 var(--sp-5)" }}>
          <div className="new-hd">
            <span className="eyebrow">Création d&rsquo;un nouveau plan</span>
            <span className="t">Naîtra en brouillon</span>
          </div>
          <div className="form-grid">
            <div className="field-group">
              <label>Scène</label>
              <select className="field" value={sceneId} onChange={(e) => setSceneId(e.target.value)}>
                <option value="">Sans scène</option>
                {scenesOptions.map((sc) => (
                  <option key={sc.id} value={sc.id}>
                    {sc.titre}
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
            <ScenarioNarratifFields valeurs={champs} onChange={majNarratif} />
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
