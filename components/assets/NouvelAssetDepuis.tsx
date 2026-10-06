"use client";

import "./assets.css";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { creerAsset } from "@/app/assets/actions";
import { PREFIXE_PAR_TYPE, TYPES_CREABLES, construireCode } from "@/lib/assetCode";
import { Icone } from "@/components/ui/Icone";

/** « Nouvel asset à partir de celui-ci » : crée un asset ORDINAIRE dont l'image de départ proposée à la génération est
 * celle de l'asset courant (une retouche, un gros plan, une tenue…). Aucune hiérarchie : l'asset créé vit à plat dans le
 * registre, et la fenêtre de génération accepte jusqu'à 3 images sources si le départ doit en mêler plusieurs. */
export function NouvelAssetDepuis({
  projectId,
  departId,
  departCode,
  departType,
}: {
  projectId: number;
  departId: number;
  departCode: string;
  departType: string;
}) {
  const router = useRouter();
  const [ouvert, setOuvert] = useState(false);
  const [type, setType] = useState<string>(departType);
  // Le nom proposé reprend celui de l'asset de départ (sans son préfixe) : les assets d'une même famille se rangent côte à côte.
  const base = departCode.replace(/^[A-Z]+_/, "");
  const [nom, setNom] = useState(`${base}_`);
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, startTransition] = useTransition();
  const [erreur, setErreur] = useState<string | null>(null);

  const prefixe = PREFIXE_PAR_TYPE[type as keyof typeof PREFIXE_PAR_TYPE] ?? "";
  const code = construireCode(type, nom);
  const valide = code !== "" && nom.trim() !== "" && nom.trim() !== `${base}_`;

  const fermer = () => {
    setOuvert(false);
    setType(departType);
    setNom(`${base}_`);
    setErreur(null);
  };

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!code) return;
    const formData = new FormData(e.currentTarget);
    formData.set("code", code);
    formData.set("deriveDeId", String(departId));
    setErreur(null);
    startTransition(async () => {
      try {
        await creerAsset(projectId, formData);
        fermer();
        router.push(`/p/${projectId}/assets/${code}`);
      } catch (err) {
        setErreur(err instanceof Error ? err.message : "Échec de la création.");
      }
    });
  };

  return (
    <>
      <button className="btn btn-ghost btn-sm" type="button" onClick={() => setOuvert(true)} title={`Crée un asset dont l'image de départ est celle de ${departCode}`}>
        <Icone nom="ajouter" taille={14} /> Nouvel asset à partir de celui-ci
      </button>
      {ouvert ? (
        <div className="modal-overlay" onClick={() => setOuvert(false)}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="modal-hd">
              <h2>Nouvel asset à partir de {departCode}</h2>
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
                  <input className="field field-mono" value={nom} onChange={(e) => setNom(e.target.value)} autoComplete="off" required autoFocus />
                </div>
                <span className="tiny-note">Code : {code || "—"}</span>
              </div>
              {type !== "voix" ? (
                <div className="field-group wide">
                  <label>Méthode de fabrication</label>
                  <select className="field" name="methodeGeneration" defaultValue="edition">
                    <option value="edition">Édition à partir d&rsquo;images, dont celle de {departCode} (Qwen Image Edit)</option>
                    <option value="generation">Génération de zéro (Krea 2)</option>
                    <option value="">À décider plus tard</option>
                  </select>
                  <span className="tiny-note">
                    Édition : un autre cadrage, une tenue, un détail, ou un composite de plusieurs éléments (jusqu&rsquo;à 3 images, choisies à la génération).
                  </span>
                </div>
              ) : null}
              <div className="field-group wide">
                <label>Description</label>
                <textarea className="field" name="description" rows={2} />
              </div>
              <div className="form-actions wide">
                <label className="chk">
                  <input type="checkbox" name="critique" />
                  Critique
                </label>
                <button className="btn btn-gold" type="submit" disabled={pending || !valide}>
                  {pending ? "..." : "Créer l'asset"}
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
