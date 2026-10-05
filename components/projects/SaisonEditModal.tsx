"use client";

import { useState, useTransition } from "react";
import { modifierTitreSaison, uploaderPosterSaison } from "@/app/projects/actions";
import { Poster } from "@/components/ui/Poster";
import { Icone } from "@/components/ui/Icone";

export function SaisonEditModal({
  saisonId,
  titre,
  posterSrc,
}: {
  saisonId: number;
  titre: string;
  posterSrc: string | null;
}) {
  const [ouvert, setOuvert] = useState(false);
  const [valeurTitre, setValeurTitre] = useState(titre);
  const [pending, startTransition] = useTransition();
  const [uploadPending, startUpload] = useTransition();
  const [posterLocal, setPosterLocal] = useState<string | null>(posterSrc);

  const fermer = () => {
    setOuvert(false);
    setValeurTitre(titre);
  };

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!valeurTitre.trim()) return;
    startTransition(async () => {
      await modifierTitreSaison(saisonId, valeurTitre.trim());
      fermer();
    });
  };

  const onChoisirFichier = (e: React.ChangeEvent<HTMLInputElement>) => {
    const fichier = e.target.files?.[0];
    if (!fichier) return;
    setPosterLocal(URL.createObjectURL(fichier));
    const formData = new FormData();
    formData.set("fichier", fichier);
    startUpload(async () => {
      await uploaderPosterSaison(saisonId, formData);
    });
  };

  return (
    <>
      <button
        className="btn btn-ghost"
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOuvert(true);
        }}
      >
        Modifier
      </button>
      {ouvert ? (
        <div className="modal-overlay" onClick={fermer}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="modal-hd">
              <h2>Modifier la saison</h2>
              <button className="modal-close" type="button" onClick={fermer} aria-label="Fermer">
                <Icone nom="fermer" />
              </button>
            </div>
            <form onSubmit={onSubmit} className="modal-bd form-grid">
              <div className="field-group wide">
                <Poster src={posterLocal} titre={valeurTitre || "Sans titre"} cleRepli={`saison:${saisonId}`} taille="wide" />
                <label className="btn btn-ghost btn-sm" style={{ marginTop: "var(--sp-2)", cursor: "pointer", alignSelf: "flex-start" }}>
                  {uploadPending ? "Envoi..." : "Changer l'image de présentation"}
                  <input type="file" accept="image/*" style={{ display: "none" }} onChange={onChoisirFichier} />
                </label>
              </div>
              <div className="field-group wide">
                <label htmlFor="se-titre">Titre de la saison</label>
                <input
                  className="field"
                  id="se-titre"
                  value={valeurTitre}
                  onChange={(e) => setValeurTitre(e.target.value)}
                  autoComplete="off"
                />
              </div>
              <div className="form-actions wide">
                <button className="btn btn-gold" type="submit" disabled={pending || !valeurTitre.trim()}>
                  {pending ? "..." : "Enregistrer"}
                </button>
                <button className="btn btn-ghost" type="button" onClick={fermer}>
                  Annuler
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
