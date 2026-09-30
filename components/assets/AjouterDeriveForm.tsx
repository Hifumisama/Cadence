"use client";

import { useRef, useState, useTransition } from "react";
import { creerAsset } from "@/app/assets/actions";
import { PREFIXE_PAR_TYPE, TYPES_CREABLES, construireCode } from "@/lib/assetCode";

export function AjouterDeriveForm({
  projectId,
  parentId,
  parentCode,
  parentType,
}: {
  projectId: number;
  parentId: number;
  parentCode: string;
  parentType: string;
}) {
  const [ouvert, setOuvert] = useState(false);
  const [type, setType] = useState<string>(parentType);
  const [nom, setNom] = useState("");
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, startTransition] = useTransition();
  const [erreur, setErreur] = useState<string | null>(null);

  const prefixe = PREFIXE_PAR_TYPE[type as keyof typeof PREFIXE_PAR_TYPE] ?? "";
  const code = construireCode(type, nom);

  const fermer = () => {
    setOuvert(false);
    setType(parentType);
    setNom("");
    setErreur(null);
  };

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!code) return;
    const formData = new FormData(e.currentTarget);
    formData.set("code", code);
    formData.set("deriveDeId", String(parentId));
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
                    placeholder="maya_yeux"
                    autoComplete="off"
                    required
                  />
                </div>
                <span className="tiny-note">Code : {code || "—"}</span>
              </div>
              {type !== "voix" ? (
                <div className="field-group wide">
                  <label>Méthode de fabrication</label>
                  <select className="field" name="methodeGeneration" defaultValue="edition">
                    <option value="edition">Édition de l&rsquo;image de {parentCode} (Qwen Image Edit)</option>
                    <option value="generation">Génération de zéro (Krea 2) — rattaché à {parentCode}</option>
                    <option value="">À décider plus tard</option>
                  </select>
                  <span className="tiny-note">
                    Édition : un autre cadrage ou détail du même sujet. Génération : un élément distinct (effet visuel, accessoire) à la même famille.
                  </span>
                </div>
              ) : null}
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
