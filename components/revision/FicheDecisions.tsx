"use client";

import { useState } from "react";
import { fmtDuree } from "@/lib/agents/revision/format";
import type { EtatRevision, VueDecisionRevision } from "@/lib/agents/revision/revision-db";
import { ScenesBrouillon } from "./ScenesBrouillon";

const ETAT: Record<string, string> = { discussion: "en discussion", attention: "à surveiller", conflit: "en conflit" };

const gain = (s: number): string | null => (s === 0 ? null : s > 0 ? `−${s} s` : `+${-s} s`);

/** La fiche des décisions (même gabarit que la fiche de notes du scénariste) : une ligne par décision, le détail derrière « Détails ». Elle
 * n'apparaît qu'à la première décision. Fermée (révision appliquée), elle devient un récapitulatif en lecture seule. */
export function FicheDecisions({
  etat,
  occupe,
  onRetirer,
  onRelu,
  onAnnulerRendu,
}: {
  etat: EtatRevision;
  occupe: boolean;
  onRetirer: (decisionUuid: string) => void;
  onRelu: (decisionUuid: string) => void;
  onAnnulerRendu: (planUuid: string) => void;
}) {
  const [ouvertes, setOuvertes] = useState<Record<string, boolean>>({});
  const [scenario, setScenario] = useState(false);
  const { duree } = etat;
  const ech = Math.max(duree.actuelle, duree.objectif ?? 0) * 1.05 || 1;

  if (!etat.ouverte) {
    return (
      <aside className="cn-fiche" aria-label="Chantier appliqué">
        <h2>Appliqué</h2>
        <ol className="cn-notes">
          {etat.appliquees.map((a) => (
            <li key={a.id} className="is-fait">
              <div className="rv-ligne">
                <b>{a.titre}</b>
                {gain(a.gainSecondes) ? <span className="rv-gain">{gain(a.gainSecondes)}</span> : null}
              </div>
            </li>
          ))}
        </ol>
        <p className="cn-fiche-pied">Cette révision est terminée. Les plans, les durées et les répliques sont à jour ; les rendus périmés sont signalés dans la frise des plans.</p>
      </aside>
    );
  }

  return (
    <aside className="cn-fiche" aria-label="Décisions retenues">
      <h2>Décisions</h2>
      <p className="rv-duree">
        <span>
          {duree.avecBrouillon !== duree.actuelle ? <del>{fmtDuree(duree.actuelle)}</del> : null} <strong>{fmtDuree(duree.avecBrouillon)}</strong>
        </span>
        {duree.objectif != null ? <span>visé {fmtDuree(duree.objectif)}</span> : null}
      </p>
      <div className="rv-mini" aria-hidden="true">
        <i className={duree.objectif != null && duree.avecBrouillon <= duree.objectif ? "ok" : ""} style={{ width: `${(duree.avecBrouillon / ech) * 100}%` }} />
        {duree.objectif != null ? <b style={{ left: `${(duree.objectif / ech) * 100}%` }} /> : null}
      </div>

      <ol className="cn-notes">
        {etat.decisions.map((d) => (
          <Decision
            key={d.uuid}
            d={d}
            ouvert={!!ouvertes[d.uuid] || d.statut === "conflit" || d.aReverifier}
            occupe={occupe}
            bascule={() => setOuvertes((o) => ({ ...o, [d.uuid]: !o[d.uuid] }))}
            onRetirer={() => onRetirer(d.uuid)}
            onRelu={() => onRelu(d.uuid)}
            onAnnulerRendu={onAnnulerRendu}
          />
        ))}
      </ol>

      {etat.scenes.length > 0 ? (
        <>
          <p className="cn-fiche-pied">
            <button type="button" className="cn-lien" aria-expanded={scenario} onClick={() => setScenario((v) => !v)}>
              {scenario ? "Masquer le scénario" : "Voir le scénario avec le brouillon"}
            </button>
          </p>
          {scenario ? <ScenesBrouillon scenes={etat.scenes} /> : null}
        </>
      ) : null}
      {etat.appliquees.length > 0 ? <p className="cn-fiche-pied">Déjà appliqué : {etat.appliquees.length} décision{etat.appliquees.length > 1 ? "s" : ""}.</p> : null}
    </aside>
  );
}

function Decision({
  d,
  ouvert,
  occupe,
  bascule,
  onRetirer,
  onRelu,
  onAnnulerRendu,
}: {
  d: VueDecisionRevision;
  ouvert: boolean;
  occupe: boolean;
  bascule: () => void;
  onRetirer: () => void;
  onRelu: () => void;
  onAnnulerRendu: (planUuid: string) => void;
}) {
  const classe = d.statut === "conflit" ? "is-conflit" : d.statut === "attention" ? "is-attention" : "is-fait";
  const g = gain(d.gainSecondes);
  return (
    <li className={classe}>
      <div className="rv-ligne">
        <b>{d.titre}</b>
        {g ? <span className="rv-gain">{g}</span> : null}
      </div>
      {ETAT[d.statut] ? <span className="rv-etat">{ETAT[d.statut]}</span> : null}
      {d.aReverifier ? <span className="rv-etat">à revérifier</span> : null}
      <div className="rv-actions">
        <button type="button" className="cn-lien" aria-expanded={ouvert} onClick={bascule}>
          {ouvert ? "Réduire" : "Détails"}
        </button>
        {d.aReverifier ? (
          <button type="button" className="cn-lien" disabled={occupe} onClick={onRelu}>
            J’ai relu
          </button>
        ) : null}
        <button type="button" className="cn-lien is-sobre" disabled={occupe} onClick={onRetirer}>
          Retirer
        </button>
      </div>
      {ouvert ? (
        <div className="rv-det">
          {d.raison ? <p className="rv-raison">{d.raison}</p> : null}
          <ul className="rv-changements">
            {d.changements.map((c, i) => (
              <li key={`${c.libelle}-${i}`} className={c.refuseRaison ? "is-refuse" : ""}>
                <span>{c.libelle}</span>
                {c.ecrase ? <span className="rv-ecrase">{c.ecrase}</span> : null}
              </li>
            ))}
          </ul>
          {d.rendusActifs.map((r) => (
            <p key={r.planUuid} className="rv-raison">
              <button type="button" className="cn-lien" disabled={occupe} onClick={() => onAnnulerRendu(r.planUuid)}>
                Annuler le rendu de {r.handle}
              </button>{" "}
              pour débloquer la suppression.
            </p>
          ))}
          {d.constats.length > 0 ? (
            <ul className="rv-constats">
              {d.constats.map((c, i) => (
                <li key={`${c.texte}-${i}`} className={`is-${c.niveau}`}>
                  <span>{c.texte}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}
