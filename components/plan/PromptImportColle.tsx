"use client";

import { useState, useTransition } from "react";
import { analyserPromptColle, importerPromptColle } from "@/app/plans/actions";

type Analyse = Awaited<ReturnType<typeof analyserPromptColle>>;

export function PromptImportColle({ planId, onImporte }: { planId: number; onImporte?: () => void }) {
  const [ouvert, setOuvert] = useState(false);
  const [brut, setBrut] = useState("");
  const [analyse, setAnalyse] = useState<Analyse | null>(null);
  const [pending, startTransition] = useTransition();
  const [importe, setImporte] = useState(false);

  const onAnalyser = () => {
    startTransition(async () => {
      setAnalyse(await analyserPromptColle(planId, brut));
      setImporte(false);
    });
  };

  const onConfirmer = () => {
    startTransition(async () => {
      const resultat = await importerPromptColle(planId, brut);
      if (resultat.ok) {
        setImporte(true);
        onImporte?.();
        setAnalyse(null);
        setBrut("");
      } else {
        setAnalyse(resultat);
      }
    });
  };

  return (
    <details className="sec" open={ouvert} onToggle={(e) => setOuvert(e.currentTarget.open)}>
      <summary className="sec-hd" style={{ cursor: "pointer" }}>
        <span className="sec-key">Coller un prompt complet</span>
        <span className="eyebrow" style={{ marginLeft: "auto" }}>
          remplace les 6 sections ci-dessous
        </span>
      </summary>
      <div style={{ padding: "var(--sp-3) 0" }}>
        <textarea
          rows={8}
          placeholder="Coller ici le prompt H3 à 6 sections (subject_definitions:, summary:, ...)"
          value={brut}
          onChange={(e) => {
            setBrut(e.target.value);
            setAnalyse(null);
            setImporte(false);
          }}
        />
        <div className="sec-actions" style={{ marginTop: "var(--sp-2)" }}>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={onAnalyser}
            disabled={pending || brut.trim().length === 0}
          >
            {pending ? "..." : "Analyser"}
          </button>
          {analyse?.ok ? (
            <button type="button" className="btn" onClick={onConfirmer} disabled={pending}>
              {pending ? "..." : "Remplacer les 6 sections"}
            </button>
          ) : null}
          {importe ? <span className="tiny-note">Importé.</span> : null}
        </div>

        {analyse && !analyse.ok ? (
          <ul className="tiny-note" style={{ color: "#c94b4b", marginTop: "var(--sp-2)" }}>
            {analyse.erreurs.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        ) : null}

        {analyse?.ok ? (
          <div style={{ marginTop: "var(--sp-2)" }}>
            <ul className="tiny-note">
              {Object.entries(analyse.sections).map(([section, contenu]) => (
                <li key={section}>
                  {section} · <span className="num">{contenu.split(/\s+/).filter(Boolean).length}</span> mots
                </li>
              ))}
            </ul>
            {analyse.avertissements.labelsOrphelins.length > 0 ||
            analyse.avertissements.refsNonCitees.length > 0 ||
            analyse.avertissements.repliquesNonTrouvees.length > 0 ? (
              <ul className="tiny-note" style={{ color: "#c9a24b" }}>
                {analyse.avertissements.labelsOrphelins.map((l) => (
                  <li key={`orph-${l}`}>Label {l} cité mais absent des références du plan</li>
                ))}
                {analyse.avertissements.refsNonCitees.map((l) => (
                  <li key={`noncite-${l}`}>Référence {l} du plan jamais citée dans le prompt</li>
                ))}
                {analyse.avertissements.repliquesNonTrouvees.map((r) => (
                  <li key={`verb-${r}`}>Réplique non trouvée au mot près : « {r} »</li>
                ))}
              </ul>
            ) : (
              <p className="tiny-note">Contrôles automatiques OK.</p>
            )}
          </div>
        ) : null}
      </div>
    </details>
  );
}
