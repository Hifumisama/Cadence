"use client";

import { useEffect, useMemo, useState } from "react";
import { genererRegistre } from "@/app/agents/actions";
import { estimerRegistreVue, listerCandidatsRegistreVue } from "@/app/agents/lecture";
import type { ContexteEtape } from "@/components/agents/contexte";
import { libelleEstimation } from "@/lib/agents-affichage";
import { resumeCandidats, type CandidatRegistre } from "@/lib/agents/registre";
import type { EstimationGeneration } from "@/lib/agents/types";

/** « Créer le registre d'assets » (étape 2) : le sélecteur des MASTERS que décrit le brief
 * (personnages, lieux), un appel par asset, l'un après l'autre. Ce qui manque est créé (description du
 * brief + prompt de génération) ; un asset qui existe sans prompt reçoit son prompt ; un asset qui a
 * déjà un prompt n'est pas coché d'office (le réécrire passe par la section « risque d'écrasement »,
 * décochée). Les voix (casting vocal), accessoires, effets et sons ne sont pas créés ici : ils se
 * déduisent des plans, à l'étape suivante. */
export function ChoixAssets({ ctx, titre }: { ctx: ContexteEtape; titre?: string }) {
  const { conv, occupe } = ctx;
  const [candidats, setCandidats] = useState<CandidatRegistre[] | null>(null);
  const [choisis, setChoisis] = useState<Set<string>>(new Set());
  const [consigne, setConsigne] = useState("");
  const [estimation, setEstimation] = useState<EstimationGeneration | null>(null);
  const [erreurLecture, setErreurLecture] = useState<string | null>(null);

  useEffect(() => {
    let annule = false;
    listerCandidatsRegistreVue(conv.projectId)
      .then((l) => {
        if (annule) return;
        setCandidats(l);
        setChoisis(new Set(l.filter((c) => c.aTraiter).map((c) => c.code)));
      })
      .catch((e) => {
        if (!annule) setErreurLecture(e instanceof Error ? e.message : "Lecture du brief impossible.");
      });
    return () => {
      annule = true;
    };
  }, [conv.projectId]);

  const codes = useMemo(() => (candidats ?? []).filter((c) => choisis.has(c.code)).map((c) => c.code), [candidats, choisis]);
  useEffect(() => {
    if (codes.length === 0) {
      setEstimation(null);
      return;
    }
    let annule = false;
    estimerRegistreVue(codes.length)
      .then((e) => {
        if (!annule) setEstimation(e);
      })
      .catch(() => undefined);
    return () => {
      annule = true;
    };
  }, [codes]);

  const bascule = (code: string) =>
    setChoisis((cur) => {
      const suite = new Set(cur);
      if (suite.has(code)) suite.delete(code);
      else suite.add(code);
      return suite;
    });

  const resume = candidats ? resumeCandidats(candidats, choisis) : null;
  const lancer = () => void ctx.lancer(() => genererRegistre(conv.uuid, { codes, consigne: consigne.trim() || undefined }));

  return (
    <div className="ag-etape-corps ag-eps">
      <div>
        <h3 className="ag-eps-titre">{titre ?? "Créer le registre d'assets"}</h3>
        <p className="tiny-note">
          L&rsquo;agent écrit le prompt de chaque personnage et lieu du brief, un asset à la fois. Les assets qui manquent seront créés ; tu relis tout ensuite, rien n&rsquo;est écrit dans le registre sans ton accord. Les voix se font au casting, les accessoires et effets viendront des plans.
        </p>
      </div>

      {erreurLecture ? (
        <p className="ag-erreur" role="alert">
          {erreurLecture}
        </p>
      ) : null}
      {candidats == null && !erreurLecture ? <p className="ag-vide">Lecture du brief…</p> : null}
      {candidats != null && candidats.length === 0 ? (
        <p className="ag-vide">Le brief ne décrit aucun personnage ni lieu (ou le projet n&rsquo;a pas encore de brief rédigé) : rien à créer.</p>
      ) : null}

      {candidats != null && candidats.length > 0 ? (
        <>
          <ul className="ag-eps-liste" aria-label="Assets à écrire">
            {candidats.map((c) => (
              <li key={c.code} className={`ag-ep-ligne${choisis.has(c.code) ? " ag-ep-choisi" : ""}`}>
                <label className="ag-case">
                  <input type="checkbox" checked={choisis.has(c.code)} onChange={() => bascule(c.code)} disabled={occupe} />
                  <span className="ag-ep-nom">
                    <span className="num">{c.code}</span> · {c.nom}
                  </span>
                </label>
                <span className={`ag-ep-etat tiny-note${c.existantId != null && c.aPrompt ? " ag-ep-rempli" : ""}`}>
                  {c.existantId == null ? "à créer" : c.aPrompt ? "a déjà un prompt" : "existe, sans prompt"}
                </span>
              </li>
            ))}
          </ul>
          {resume ? (
            <p className="tiny-note" role="status">
              {resume.choisis} asset{resume.choisis > 1 ? "s" : ""} sur {resume.total} sélectionné{resume.choisis > 1 ? "s" : ""}
              {resume.nouveaux > 0 ? ` · ${resume.nouveaux} à créer` : ""}
              {resume.existants > 0 ? ` · ${resume.existants} existant${resume.existants > 1 ? "s" : ""}` : ""}
            </p>
          ) : null}
          {resume && resume.ecrases > 0 ? (
            <p className="ag-eps-alerte tiny-note" role="status">
              {resume.ecrases === 1 ? "Un asset choisi a" : `${resume.ecrases} assets choisis ont`} déjà un prompt : le nouveau remplacera l&rsquo;ancien (section « risque d&rsquo;écrasement », décoché par défaut).
            </p>
          ) : null}

          <div className="gd-grp">
            <label className="gd-lbl" htmlFor="ag-reg-consigne">
              Une consigne pour tous les assets (facultatif)
            </label>
            <textarea
              id="ag-reg-consigne"
              className="field"
              rows={2}
              value={consigne}
              onChange={(e) => setConsigne(e.target.value)}
              placeholder="Ex. Personnages en pied sur fond neutre ; décors sans personnage."
              disabled={occupe}
            />
          </div>

          <div className="ag-lancer">
            <span className="tiny-note ag-estimation" role="status">
              {estimation ? libelleEstimation(estimation) : codes.length === 0 ? "Coche au moins un asset." : "…"}
            </span>
            <button type="button" className="btn btn-gold" onClick={lancer} disabled={occupe || codes.length === 0}>
              {occupe ? "…" : `Créer le registre (${codes.length})`}
            </button>
          </div>
        </>
      ) : null}
    </div>
  );
}
