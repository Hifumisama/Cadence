"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { creerVoix } from "@/app/voix/actions";
import { construireCode } from "@/lib/assetCode";
import { Icone } from "@/components/ui/Icone";

/** Nouvelle voix au catalogue — crée l'asset VOICE_* (registre) et sa fiche
 * de casting, puis ouvre la fiche. */
export function NouvelleVoixForm({ projectId, personnages }: { projectId: number; personnages: { id: number; code: string }[] }) {
  const router = useRouter();
  const [ouvert, setOuvert] = useState(false);
  const [nom, setNom] = useState("");
  const [pending, startTransition] = useTransition();
  const [erreur, setErreur] = useState<string | null>(null);
  const code = construireCode("voix", nom);

  return (
    <>
      <button className="btn btn-primary" type="button" onClick={() => setOuvert(true)}>
        Nouvelle voix
      </button>
      {ouvert ? (
        <div className="modal-overlay" onClick={() => setOuvert(false)}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="modal-hd">
              <h2>Nouvelle voix</h2>
              <button className="modal-close" type="button" onClick={() => setOuvert(false)} aria-label="Fermer">
                <Icone nom="fermer" />
              </button>
            </div>
            <form
              className="modal-bd form-grid"
              action={(fd) => {
                setErreur(null);
                startTransition(async () => {
                  const r = await creerVoix(projectId, fd);
                  if (r.ok) {
                    setOuvert(false);
                    router.push(`/p/${projectId}/voix/${r.code}`);
                  } else setErreur(r.erreur);
                });
              }}
            >
              <div className="field-group">
                <label>Nom</label>
                <input className="field field-mono" name="nom" value={nom} onChange={(e) => setNom(e.target.value)} placeholder="tenanciere" autoComplete="off" required />
                <span className="tiny-note num">{code !== "VOICE_" ? code : "VOICE_…"}</span>
              </div>
              <div className="field-group">
                <label>Personnage</label>
                <select className="field" name="personnageId" defaultValue="">
                  <option value="">— aucun</option>
                  {personnages.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.code}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field-group wide">
                <label>Description canonique du timbre</label>
                <textarea className="field" name="description" rows={2} />
              </div>
              <div className="form-actions wide">
                <label className="chk">
                  <input type="checkbox" name="critique" />
                  Critique
                </label>
                <span style={{ flex: 1 }} />
                {erreur ? <span className="tiny-note" style={{ color: "var(--ecarlate-glow)" }}>{erreur}</span> : null}
                <button className="btn btn-primary" type="submit" disabled={pending || code === "VOICE_"}>
                  {pending ? "…" : "Créer"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
