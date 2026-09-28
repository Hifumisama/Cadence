"use client";

import { useState, useTransition } from "react";
import { creerProjet } from "@/app/projects/actions";

export function NouveauProjetModal() {
  const [ouvert, setOuvert] = useState(false);
  const [type, setType] = useState<"oneshot" | "serie" | null>(null);
  const [nom, setNom] = useState("");
  const [avecPremierEpisode, setAvecPremierEpisode] = useState(true);
  const [pending, startTransition] = useTransition();
  const [erreur, setErreur] = useState<string | null>(null);

  const fermer = () => {
    setOuvert(false);
    setType(null);
    setNom("");
    setErreur(null);
  };

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!type || !nom.trim()) return;
    setErreur(null);
    startTransition(async () => {
      try {
        await creerProjet({ nom: nom.trim(), type, avecPremierEpisode });
        // Succès : creerProjet redirige côté serveur, pas de retour ici.
      } catch (err) {
        setErreur(err instanceof Error ? err.message : "Échec de la création.");
      }
    });
  };

  return (
    <>
      <button className="btn btn-primary" type="button" onClick={() => setOuvert(true)}>
        + Nouveau projet
      </button>
      {ouvert ? (
        <div className="modal-overlay" onClick={fermer}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="modal-hd">
              <h2>Nouveau projet</h2>
              <button className="modal-close" type="button" onClick={fermer} aria-label="Fermer">
                ×
              </button>
            </div>
            <form onSubmit={onSubmit} className="modal-bd form-grid">
              <div className="field-group wide">
                <span className="lbl">Forme du projet</span>
                <div className="choices" role="radiogroup">
                  <label className="choice">
                    <input type="radio" name="type" checked={type === "oneshot"} onChange={() => setType("oneshot")} />
                    <span className="t">OneShot</span>
                    <span className="d">Un seul film. Pas de saisons ni d&rsquo;épisodes : le projet s&rsquo;ouvre directement sur son Scénario.</span>
                    <span className="shape">Projet → Scénario · Assets · Shots</span>
                  </label>
                  <label className="choice">
                    <input type="radio" name="type" checked={type === "serie"} onChange={() => setType("serie")} />
                    <span className="t">Série</span>
                    <span className="d">Des saisons et des épisodes. Chaque épisode numérote ses plans à partir de 010.</span>
                    <span className="shape">Projet → Saison → Épisode → …</span>
                  </label>
                </div>
              </div>
              <div className="field-group wide">
                <label htmlFor="np-nom">Nom du projet</label>
                <input
                  className="field"
                  id="np-nom"
                  name="nom"
                  placeholder="Ex. Nuit de Tanger"
                  value={nom}
                  onChange={(e) => setNom(e.target.value)}
                  autoComplete="off"
                />
              </div>
              {type === "serie" ? (
                <div className="field-group wide">
                  <label className="chk">
                    <input type="checkbox" checked={avecPremierEpisode} onChange={(e) => setAvecPremierEpisode(e.target.checked)} />
                    Créer tout de suite S01 · E01 (vides)
                  </label>
                </div>
              ) : type === "oneshot" ? (
                <p className="tiny-note wide">Une saison et un épisode techniques sont créés en arrière-plan. Ils n&rsquo;apparaîtront jamais dans la navigation.</p>
              ) : (
                <p className="tiny-note wide">Choisir la forme du projet. Elle ne pourra pas être changée ensuite.</p>
              )}
              <div className="form-actions wide">
                <button className="btn btn-gold" type="submit" disabled={pending || !type || !nom.trim()}>
                  {pending ? "..." : type === "oneshot" ? "Créer et ouvrir le Scénario" : "Créer la série"}
                </button>
                <button className="btn btn-ghost" type="button" onClick={fermer}>
                  Annuler
                </button>
                {erreur ? <span className="tiny-note" style={{ color: "var(--ecarlate-glow)" }}>{erreur}</span> : null}
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
