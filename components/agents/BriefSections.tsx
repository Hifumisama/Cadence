"use client";

import { useState } from "react";
import {
  ETAT_CHAMP,
  decompterStatuts,
  depuisSaisie,
  groupesBrief,
  typeEdition,
  valeurEnTexte,
  versSaisie,
} from "@/lib/agents-affichage";
import { STATUTS_CHAMP, type SectionBrief, type StatutChamp, type VueBrief } from "@/lib/agents/types";

/** Le brief en sections repliables par groupe, avec TROIS états explicites (jamais la
 * couleur seule : un symbole et un libellé) : ● fourni (or), ○ déduit (blanc),
 * ◇ à valider (blanc, souligné en pointillés). Chaque section est éditable (✎) : la
 * corriger la passe à « fourni ». Partagé par la popup (étape Brief) et la page du brief. */
export function BriefSections({
  brief,
  onModifier,
  desactive = false,
}: {
  brief: VueBrief;
  /** Renvoie un message d'erreur, ou null si la section a été enregistrée. Absent : lecture seule. */
  onModifier?: (cle: string, valeur: unknown) => Promise<string | null>;
  desactive?: boolean;
}) {
  const nombres = decompterStatuts(brief.sections);
  return (
    <div className="ag-brief">
      <Legende nombres={nombres} />
      {groupesBrief(brief.sections).map((g) => (
        <section key={g.groupe} className="ag-brief-groupe" aria-label={g.groupe}>
          <h3 className="ag-brief-titre">{g.groupe}</h3>
          {g.sections.map((s) => (
            <Section key={s.cle} s={s} onModifier={onModifier} desactive={desactive} />
          ))}
        </section>
      ))}
    </div>
  );
}

function Legende({ nombres }: { nombres: Record<StatutChamp, number> }) {
  return (
    <ul className="ag-legende" aria-label="Légende des états">
      {STATUTS_CHAMP.map((st) => (
        <li key={st} className={`ag-etat-${st}`} title={ETAT_CHAMP[st].description}>
          <span className="ag-symbole" aria-hidden="true">
            {ETAT_CHAMP[st].symbole}
          </span>
          <span>
            {ETAT_CHAMP[st].libelle} <span className="num">({nombres[st]})</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

function Section({
  s,
  onModifier,
  desactive,
}: {
  s: SectionBrief;
  onModifier?: (cle: string, valeur: unknown) => Promise<string | null>;
  desactive: boolean;
}) {
  const [edition, setEdition] = useState(false);
  const [saisie, setSaisie] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const etat = ETAT_CHAMP[s.statut];
  const type = typeEdition(s.cle);

  const ouvrir = () => {
    setSaisie(versSaisie(s.cle, s.valeur));
    setErreur(null);
    setEdition(true);
  };

  const enregistrer = async () => {
    const lu = depuisSaisie(s.cle, saisie);
    if (!lu.ok) {
      setErreur(lu.erreur);
      return;
    }
    setEnvoi(true);
    const message = await onModifier?.(s.cle, lu.valeur);
    setEnvoi(false);
    if (message) setErreur(message);
    else setEdition(false);
  };

  return (
    <details className={`ag-section ag-etat-${s.statut}`} open={s.statut === "a_valider" || edition || undefined}>
      <summary>
        <span className="ag-symbole" aria-hidden="true">
          {etat.symbole}
        </span>
        <span className="ag-section-nom">{s.libelle}</span>
        <span className="ag-section-etat">{etat.libelle}</span>
      </summary>
      <div className="ag-section-corps">
        {edition ? (
          <>
            <textarea
              className="field"
              rows={type === "texte" || type === "nombre" ? 2 : 8}
              value={saisie}
              onChange={(e) => setSaisie(e.target.value)}
              aria-label={`Modifier : ${s.libelle}`}
              spellCheck={type !== "json"}
            />
            <p className="tiny-note">
              {type === "lignes"
                ? "Un élément par ligne."
                : type === "json"
                  ? "Format structuré (JSON) : le serveur le vérifie avant de l'enregistrer."
                  : null}
            </p>
            {erreur ? (
              <p className="tiny-note ag-erreur" role="alert">
                {erreur}
              </p>
            ) : null}
            <div className="gd-row">
              <button type="button" className="btn btn-primary btn-mini" onClick={enregistrer} disabled={envoi || desactive}>
                {envoi ? "…" : "Enregistrer"}
              </button>
              <button type="button" className="btn btn-ghost btn-mini" onClick={() => setEdition(false)} disabled={envoi}>
                Annuler
              </button>
              <span className="tiny-note">Enregistrer passe cette section à « fourni ».</span>
            </div>
          </>
        ) : (
          <>
            <p className="ag-valeur">{valeurEnTexte(s.valeur)}</p>
            {onModifier ? (
              <button type="button" className="ag-modifier" onClick={ouvrir} disabled={desactive} aria-label={`Modifier : ${s.libelle}`}>
                ✎ Modifier
              </button>
            ) : null}
          </>
        )}
      </div>
    </details>
  );
}
