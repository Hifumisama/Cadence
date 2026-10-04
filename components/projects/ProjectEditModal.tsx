"use client";

import { useRef, useState, useTransition } from "react";
import { modifierNomProjet, uploaderPosterProjet } from "@/app/projects/actions";
import { Poster } from "@/components/ui/Poster";

export function ProjectEditModal({
  projectId,
  nom,
  posterSrc,
}: {
  projectId: number;
  nom: string;
  posterSrc: string | null;
}) {
  const [ouvert, setOuvert] = useState(false);
  const [valeurNom, setValeurNom] = useState(nom);
  const [pending, startTransition] = useTransition();
  const [uploadPending, startUpload] = useTransition();
  const [erreur, setErreur] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [posterLocal, setPosterLocal] = useState<string | null>(posterSrc);

  const fermer = () => {
    setOuvert(false);
    setValeurNom(nom);
    setErreur(null);
  };

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!valeurNom.trim()) return;
    setErreur(null);
    startTransition(async () => {
      try {
        await modifierNomProjet(projectId, valeurNom.trim());
        fermer();
      } catch (err) {
        setErreur(err instanceof Error ? err.message : "Échec de l'enregistrement.");
      }
    });
  };

  const onChoisirFichier = (e: React.ChangeEvent<HTMLInputElement>) => {
    const fichier = e.target.files?.[0];
    if (!fichier) return;
    setPosterLocal(URL.createObjectURL(fichier));
    const formData = new FormData();
    formData.set("fichier", fichier);
    startUpload(async () => {
      await uploaderPosterProjet(projectId, formData);
    });
  };

  return (
    <>
      <button className="btn btn-ghost" type="button" onClick={() => setOuvert(true)}>
        Modifier le projet
      </button>
      {ouvert ? (
        <div className="modal-overlay" onClick={fermer}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="modal-hd">
              <h2>Modifier le projet</h2>
              <button className="modal-close" type="button" onClick={fermer} aria-label="Fermer">
                ×
              </button>
            </div>
            <form onSubmit={onSubmit} className="modal-bd form-grid">
              <div className="field-group wide">
                <Poster src={posterLocal} titre={valeurNom || "Sans titre"} cleRepli={`projet:${projectId}`} taille="wide" />
                <label className="btn btn-ghost btn-sm" style={{ marginTop: "var(--sp-2)", cursor: "pointer", alignSelf: "flex-start" }}>
                  {uploadPending ? "Envoi..." : "Changer l'image de présentation"}
                  <input
                    ref={fileRef}
                    type="file"
                    name="fichier"
                    accept="image/*"
                    style={{ display: "none" }}
                    onChange={onChoisirFichier}
                  />
                </label>
              </div>
              <div className="field-group wide">
                <label htmlFor="pe-nom">Nom du projet</label>
                <input
                  className="field"
                  id="pe-nom"
                  value={valeurNom}
                  onChange={(e) => setValeurNom(e.target.value)}
                  autoComplete="off"
                />
              </div>
              <div className="form-actions wide">
                <button className="btn btn-gold" type="submit" disabled={pending || !valeurNom.trim()}>
                  {pending ? "..." : "Enregistrer"}
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
