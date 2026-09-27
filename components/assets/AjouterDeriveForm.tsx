"use client";

import { useRef, useState, useTransition } from "react";
import { creerAsset } from "@/app/assets/actions";

const TYPES = ["personnage", "decor", "voix", "prop", "fx", "keyframe", "autre"];

export function AjouterDeriveForm({
  parentId,
  parentCode,
  parentType,
}: {
  parentId: number;
  parentCode: string;
  parentType: string;
}) {
  const [ouvert, setOuvert] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, startTransition] = useTransition();
  const [erreur, setErreur] = useState<string | null>(null);

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    formData.set("deriveDeId", String(parentId));
    setErreur(null);
    startTransition(async () => {
      try {
        await creerAsset(formData);
        formRef.current?.reset();
        setOuvert(false);
      } catch (err) {
        setErreur(err instanceof Error ? err.message : "Échec de la création.");
      }
    });
  };

  return (
    <>
      <button className="btn btn-ghost btn-sm" type="button" onClick={() => setOuvert(true)} title={`Ajouter un dérivé de ${parentCode}`}>
        + dérivé
      </button>
      {ouvert ? (
        <div className="modal-overlay" onClick={() => setOuvert(false)}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="modal-hd">
              <h2>Nouveau dérivé de {parentCode}</h2>
              <button className="modal-close" type="button" onClick={() => setOuvert(false)} aria-label="Fermer">
                ×
              </button>
            </div>
            <form ref={formRef} onSubmit={onSubmit} className="modal-bd form-grid">
              <div className="field-group">
                <label>Code</label>
                <input className="field field-mono" name="code" placeholder={`${parentCode}_...`} required />
              </div>
              <div className="field-group">
                <label>Type</label>
                <select className="field" name="type" defaultValue={parentType}>
                  {TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
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
                <button className="btn btn-gold" type="submit" disabled={pending}>
                  {pending ? "..." : "Créer le dérivé"}
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
