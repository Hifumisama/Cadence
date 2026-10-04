"use client";

import { useMemo, useState, useTransition } from "react";
import { lancerGenerationsLot } from "@/app/assets/generation-actions";
import type { EcarteLot } from "@/lib/generation-lot";

export type LigneLot = {
  id: number;
  code: string;
  type: string;
  /** Pourquoi cet asset ne peut pas partir maintenant, ou null. */
  raison: string | null;
  aUneImage: boolean;
  estDerive: boolean;
  /** Coché d'office : pas encore d'image, et peut partir. */
  parDefaut: boolean;
};

/** « Générer plusieurs images d'un coup » (registre d'assets) : on coche des assets, chacun part dans la file avec son
 * propre prompt. Utile surtout au début d'un projet, pour remplir le registre. Un dérivé en édition part de l'image de
 * son master : il attend que le master ait la sienne (deux vagues), la raison est dite. Rien d'autre n'est ignoré en silence. */
export function GenererEnLot({ projectId, lignes }: { projectId: number; lignes: LigneLot[] }) {
  const [choisis, setChoisis] = useState<Set<number>>(() => new Set(lignes.filter((l) => l.parDefaut).map((l) => l.id)));
  const [pending, startTransition] = useTransition();
  const [bilan, setBilan] = useState<{ lancees: number; ecartes: EcarteLot[] } | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  const partants = useMemo(() => lignes.filter((l) => choisis.has(l.id) && l.raison == null), [lignes, choisis]);
  const bascule = (id: number) =>
    setChoisis((cur) => {
      const suite = new Set(cur);
      if (suite.has(id)) suite.delete(id);
      else suite.add(id);
      return suite;
    });
  const toutCocher = (v: boolean) => setChoisis(v ? new Set(lignes.filter((l) => l.raison == null).map((l) => l.id)) : new Set());

  const lancer = () =>
    startTransition(async () => {
      setErreur(null);
      setBilan(null);
      const r = await lancerGenerationsLot(projectId, [...choisis]);
      if (!r.ok) setErreur(r.erreur);
      else setBilan({ lancees: r.lancees, ecartes: r.ecartes });
    });

  if (lignes.length === 0) return null;

  return (
    <details className="panel">
      <summary className="panel-hd" style={{ cursor: "pointer" }}>
        <h2>Générer plusieurs images d&rsquo;un coup</h2>
        <span className="eyebrow">{partants.length} coché{partants.length > 1 ? "s" : ""}</span>
      </summary>
      <div className="panel-bd" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <p className="tiny-note">
          Chaque asset coché part dans la file avec son prompt, au format de son type. Un dérivé en édition attend l&rsquo;image de son master : génère et adopte d&rsquo;abord les masters, puis relance.
        </p>
        <div className="gd-row">
          <button type="button" className="btn btn-ghost btn-mini" onClick={() => toutCocher(true)} disabled={pending}>
            Tout cocher
          </button>
          <button type="button" className="btn btn-ghost btn-mini" onClick={() => toutCocher(false)} disabled={pending}>
            Tout décocher
          </button>
        </div>
        <ul className="ag-eps-liste" aria-label="Assets à générer">
          {lignes.map((l) => (
            <li key={l.id} className={`ag-ep-ligne${choisis.has(l.id) && l.raison == null ? " ag-ep-choisi" : ""}`}>
              <label className="ag-case">
                <input type="checkbox" checked={choisis.has(l.id)} onChange={() => bascule(l.id)} disabled={pending || l.raison != null} />
                <span className="ag-ep-nom">
                  <span className="num">{l.code}</span>
                  {l.estDerive ? " · dérivé" : ""}
                </span>
              </label>
              <span className="ag-ep-etat tiny-note">{l.raison ?? (l.aUneImage ? "a déjà une image (une nouvelle s'ajoutera aux candidats)" : "prêt")}</span>
            </li>
          ))}
        </ul>
        <div className="ag-lancer">
          <span className="tiny-note" role="status">
            {erreur ? (
              <span style={{ color: "var(--ecarlate-glow)" }}>{erreur}</span>
            ) : bilan ? (
              `${bilan.lancees} génération${bilan.lancees > 1 ? "s" : ""} en file${bilan.ecartes.length ? ` · ${bilan.ecartes.length} écartée${bilan.ecartes.length > 1 ? "s" : ""} : ${bilan.ecartes.map((e) => `${e.code} (${e.raison})`).join(" ; ")}` : ""}`
            ) : (
              "Le panneau des générations (en-tête) montre l'avancement."
            )}
          </span>
          <button type="button" className="btn btn-gold" onClick={lancer} disabled={pending || partants.length === 0}>
            {pending ? "…" : `Générer ${partants.length} image${partants.length > 1 ? "s" : ""}`}
          </button>
        </div>
      </div>
    </details>
  );
}
