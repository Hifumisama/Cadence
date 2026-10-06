"use client";

import { useRef, useState, useTransition } from "react";
import { creerAsset } from "@/app/assets/actions";
import { PREFIXE_PAR_TYPE, TYPES_CREABLES, construireCode } from "@/lib/assetCode";
import { Icone } from "@/components/ui/Icone";

export function AjouterAssetForm({ projectId }: { projectId: number }) {
  const [ouvert, setOuvert] = useState(false);
  const [type, setType] = useState<string>("personnage");
  const [nom, setNom] = useState("");
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, startTransition] = useTransition();
  const [erreur, setErreur] = useState<string | null>(null);

  const prefixe = PREFIXE_PAR_TYPE[type as keyof typeof PREFIXE_PAR_TYPE] ?? "";
  const code = construireCode(type, nom);

  const fermer = () => {
    setOuvert(false);
    setType("personnage");
    setNom("");
    setErreur(null);
  };

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!code) return;
    const formData = new FormData(e.currentTarget);
    formData.set("code", code);
    setErreur(null);
    startTransition(async () => {
      try {
        await creerAsset(projectId, formData);
        formRef.current?.reset();
        fermer();
      } catch (err) {
        setErreur(err instanceof Error ? err.message : "Échec de la création.");
      }
    });
  };

  return (
    <>
      <button className="btn btn-gold" type="button" onClick={() => setOuvert(true)}>
        <Icone nom="ajouter" taille={15} /> Nouveau sujet
      </button>
      {ouvert ? (
        <div className="modal-overlay" onClick={() => setOuvert(false)}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="modal-hd">
              <h2>Nouveau sujet</h2>
              <button className="modal-close" type="button" onClick={() => setOuvert(false)} aria-label="Fermer">
                <Icone nom="fermer" />
              </button>
            </div>
            <form ref={formRef} onSubmit={onSubmit} className="modal-bd form-grid">
              <div className="field-group">
                <label>Type</label>
                <select className="field" name="type" value={type} onChange={(e) => setType(e.target.value)}>
                  {TYPES_CREABLES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field-group">
                <label>Nom</label>
                <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
                  {prefixe ? (
                    <span className="field-mono tiny-note" style={{ whiteSpace: "nowrap" }}>
                      {prefixe}
                    </span>
                  ) : null}
                  <input
                    className="field field-mono"
                    value={nom}
                    onChange={(e) => setNom(e.target.value)}
                    placeholder="maya"
                    autoComplete="off"
                    required
                  />
                </div>
                <span className="tiny-note">Code : {code || "—"}</span>
              </div>
              <div className="field-group wide">
                <label>Description</label>
                <textarea className="field" name="description" rows={2} />
              </div>
              <div className="field-group wide">
                <label>Fichier média (image, audio ou vidéo)</label>
                <input className="field" type="file" name="fichier" accept="image/*,audio/*,video/*" />
              </div>
              <div className="form-actions wide">
                <label className="chk">
                  <input type="checkbox" name="critique" />
                  Critique
                </label>
                <button className="btn btn-gold" type="submit" disabled={pending || !code}>
                  {pending ? "..." : "Créer"}
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
