"use client";

import { useEffect, useMemo, useState } from "react";
import { genererVoix } from "@/app/agents/actions";
import { estimerVoixVue, listerCandidatsVoixVue } from "@/app/agents/lecture";
import type { ContexteEtape } from "@/components/agents/contexte";
import { libelleEstimation } from "@/lib/agents-affichage";
import { resumeCandidatsVoix, type CandidatVoix } from "@/lib/agents/voix-casting";
import type { EstimationGeneration } from "@/lib/agents/types";

/** « Casting des voix » : le sélecteur des voix MANQUANTES, c'est-à-dire un personnage qui parle (au moins
 * une réplique écrite par les scénarios) sans voix, et la voix off si des répliques la réclament. Un appel
 * par voix, l'un après l'autre. L'agent écrit l'instruction de timbre ; la voix (asset et fiche de casting)
 * n'est créée qu'après ta relecture. Le son se génère ensuite à part, depuis le casting vocal. */
export function ChoixVoix({ ctx, titre }: { ctx: ContexteEtape; titre?: string }) {
  const { conv, occupe } = ctx;
  const [candidats, setCandidats] = useState<CandidatVoix[] | null>(null);
  const [choisis, setChoisis] = useState<Set<string>>(new Set());
  const [consigne, setConsigne] = useState("");
  const [estimation, setEstimation] = useState<EstimationGeneration | null>(null);
  const [erreurLecture, setErreurLecture] = useState<string | null>(null);

  useEffect(() => {
    let annule = false;
    listerCandidatsVoixVue(conv.projectId)
      .then((l) => {
        if (annule) return;
        setCandidats(l);
        setChoisis(new Set(l.filter((c) => c.aTraiter).map((c) => c.cle)));
      })
      .catch((e) => {
        if (!annule) setErreurLecture(e instanceof Error ? e.message : "Lecture des répliques impossible.");
      });
    return () => {
      annule = true;
    };
  }, [conv.projectId]);

  const cles = useMemo(() => (candidats ?? []).filter((c) => choisis.has(c.cle)).map((c) => c.cle), [candidats, choisis]);
  useEffect(() => {
    if (cles.length === 0) {
      setEstimation(null);
      return;
    }
    let annule = false;
    estimerVoixVue(cles.length)
      .then((e) => {
        if (!annule) setEstimation(e);
      })
      .catch(() => undefined);
    return () => {
      annule = true;
    };
  }, [cles]);

  const bascule = (cle: string) =>
    setChoisis((cur) => {
      const suite = new Set(cur);
      if (suite.has(cle)) suite.delete(cle);
      else suite.add(cle);
      return suite;
    });

  const resume = candidats ? resumeCandidatsVoix(candidats, choisis) : null;
  const lancer = () => void ctx.lancer(() => genererVoix(conv.uuid, { cles, consigne: consigne.trim() || undefined }));

  return (
    <div className="ag-etape-corps ag-eps">
      <div>
        <h3 className="ag-eps-titre">{titre ?? "Créer les voix manquantes"}</h3>
        <p className="tiny-note">
          L&rsquo;agent décrit le timbre de chaque personnage qui parle et n&rsquo;a pas de voix, une voix à la fois. Tu relis tout ensuite : rien n&rsquo;est créé sans ton accord. Le son se génère à part, depuis le casting vocal.
        </p>
      </div>

      {erreurLecture ? (
        <p className="ag-erreur" role="alert">
          {erreurLecture}
        </p>
      ) : null}
      {candidats == null && !erreurLecture ? <p className="ag-vide">Lecture des répliques…</p> : null}
      {candidats != null && candidats.length === 0 ? (
        <p className="ag-vide">Aucune voix à créer : chaque personnage qui parle a déjà la sienne, ou aucune réplique n&rsquo;est encore écrite.</p>
      ) : null}

      {candidats != null && candidats.length > 0 ? (
        <>
          <ul className="ag-eps-liste" aria-label="Voix à créer">
            {candidats.map((c) => (
              <li key={c.cle} className={`ag-ep-ligne${choisis.has(c.cle) ? " ag-ep-choisi" : ""}`}>
                <label className="ag-case">
                  <input type="checkbox" checked={choisis.has(c.cle)} onChange={() => bascule(c.cle)} disabled={occupe || c.bloque != null} />
                  <span className="ag-ep-nom">
                    <span className="num">{c.codeVoix}</span> · {c.nom}
                  </span>
                </label>
                <span className="ag-ep-etat tiny-note">
                  {c.bloque ?? `${c.nbRepliques} réplique${c.nbRepliques > 1 ? "s" : ""}`}
                </span>
              </li>
            ))}
          </ul>
          {resume ? (
            <p className="tiny-note" role="status">
              {resume.choisis} voix sur {resume.total} sélectionnée{resume.choisis > 1 ? "s" : ""} · {resume.repliques} réplique{resume.repliques > 1 ? "s" : ""} concernée{resume.repliques > 1 ? "s" : ""}
            </p>
          ) : null}

          <div className="gd-grp">
            <label className="gd-lbl" htmlFor="ag-voix-consigne">
              Une consigne pour toutes les voix (facultatif)
            </label>
            <textarea
              id="ag-voix-consigne"
              className="field"
              rows={2}
              value={consigne}
              onChange={(e) => setConsigne(e.target.value)}
              placeholder="Ex. Des voix bien distinctes à l'oreille ; pas d'accent étranger."
              disabled={occupe}
            />
          </div>

          <div className="ag-lancer">
            <span className="tiny-note ag-estimation" role="status">
              {estimation ? libelleEstimation(estimation) : cles.length === 0 ? "Coche au moins une voix." : "…"}
            </span>
            <button type="button" className="btn btn-gold" onClick={lancer} disabled={occupe || cles.length === 0}>
              {occupe ? "…" : `Créer les voix (${cles.length})`}
            </button>
          </div>
        </>
      ) : null}
    </div>
  );
}
