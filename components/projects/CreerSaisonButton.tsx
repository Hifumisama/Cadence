"use client";

import { useRef, useState, useTransition } from "react";
import { creerSaison, uploaderPosterSaison } from "@/app/projects/actions";
import { Poster } from "@/components/ui/Poster";
import { Icone } from "@/components/ui/Icone";

export function CreerSaisonButton({ projectId }: { projectId: number }) {
  const [ouvert, setOuvert] = useState(false);
  const [titre, setTitre] = useState("");
  const [pending, startTransition] = useTransition();
  const [erreur, setErreur] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [apercu, setApercu] = useState<string | null>(null);

  const fermer = () => {
    setOuvert(false);
    setTitre("");
    setApercu(null);
    setErreur(null);
  };

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setErreur(null);
    startTransition(async () => {
      try {
        const { id } = await creerSaison(projectId, titre);
        const fichier = fileRef.current?.files?.[0];
        if (fichier) {
          const formData = new FormData();
          formData.set("fichier", fichier);
          await uploaderPosterSaison(id, formData);
        }
        fermer();
      } catch (err) {
        setErreur(err instanceof Error ? err.message : "Échec de la création.");
      }
    });
  };

  return (
    <>
      <button className="btn btn-gold" type="button" onClick={() => setOuvert(true)}>
        + Saison
      </button>
      {ouvert ? (
        <div className="modal-overlay" onClick={fermer}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="modal-hd">
              <h2>Nouvelle saison</h2>
              <button className="modal-close" type="button" onClick={fermer} aria-label="Fermer">
                <Icone nom="fermer" />
              </button>
            </div>
            <form onSubmit={onSubmit} className="modal-bd form-grid">
              <div className="field-group wide">
                <Poster src={apercu} titre={titre || "Nouvelle saison"} cleRepli="nouvelle-saison" taille="wide" />
                <label className="btn btn-ghost btn-sm" style={{ marginTop: "var(--sp-2)", cursor: "pointer", alignSelf: "flex-start" }}>
                  Choisir une image de présentation
                  <input
                    ref={fileRef}
                    type="file"
                    name="fichier"
                    accept="image/*"
                    style={{ display: "none" }}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      setApercu(f ? URL.createObjectURL(f) : null);
                    }}
                  />
                </label>
              </div>
              <div className="field-group wide">
                <label htmlFor="ns-titre">Titre de la saison</label>
                <input
                  className="field"
                  id="ns-titre"
                  placeholder="Ex. Saison 1"
                  value={titre}
                  onChange={(e) => setTitre(e.target.value)}
                  autoComplete="off"
                />
              </div>
              <div className="form-actions wide">
                <button className="btn btn-gold" type="submit" disabled={pending}>
                  {pending ? "..." : "Créer la saison"}
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
