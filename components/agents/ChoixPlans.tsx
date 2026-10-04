"use client";

import { useEffect, useMemo, useState } from "react";
import { genererFiches } from "@/app/agents/actions";
import { estimerFichesVue, listerPlansPourFichesVue } from "@/app/agents/lecture";
import type { ContexteEtape } from "@/components/agents/contexte";
import { libelleEstimation, two } from "@/lib/agents-affichage";
import type { EstimationGeneration, PlanPourFiche, Portee } from "@/lib/agents/types";

/** « Écrire les fiches de plan » (étape 3) : le sélecteur des plans d'un LOT (une sous-tâche `plan-h3` par
 * plan, l'une après l'autre), ou la fiche d'UN plan (portée `plan`). Les plans sans fiche sont cochés
 * d'office ; cocher un plan qui en a déjà une, c'est le remettre à zéro : ses six sections ET ses références
 * seront remplacées (section « risque d'écrasement » de la revue, décochée par défaut). Les répliques liées ne
 * bougent pas. Les assets manquants seront proposés à la création ; leurs prompts s'écrivent ensuite. */
export function ChoixPlans({ ctx, titre }: { ctx: ContexteEtape; titre?: string }) {
  const { conv, occupe } = ctx;
  const unSeul = conv.portee === "plan";
  const [plans, setPlans] = useState<PlanPourFiche[] | null>(null);
  const [choisis, setChoisis] = useState<Set<string>>(new Set());
  const [consigne, setConsigne] = useState("");
  const [estimation, setEstimation] = useState<EstimationGeneration | null>(null);
  const [erreurLecture, setErreurLecture] = useState<string | null>(null);

  useEffect(() => {
    let annule = false;
    listerPlansPourFichesVue(conv.projectId, conv.portee as Portee, conv.cibleId)
      .then((l) => {
        if (annule) return;
        setPlans(l);
        setChoisis(new Set((unSeul ? l : l.filter((p) => !p.aDesSections)).map((p) => p.uuid)));
      })
      .catch((e) => {
        if (!annule) setErreurLecture(e instanceof Error ? e.message : "Lecture des plans impossible.");
      });
    return () => {
      annule = true;
    };
  }, [conv.projectId, conv.portee, conv.cibleId, unSeul]);

  const uuids = useMemo(() => (plans ?? []).filter((p) => choisis.has(p.uuid)).map((p) => p.uuid), [plans, choisis]);
  useEffect(() => {
    if (uuids.length === 0) {
      setEstimation(null);
      return;
    }
    let annule = false;
    estimerFichesVue(uuids.length)
      .then((e) => {
        if (!annule) setEstimation(e);
      })
      .catch(() => undefined);
    return () => {
      annule = true;
    };
  }, [uuids]);

  const bascule = (uuid: string) =>
    setChoisis((cur) => {
      const suite = new Set(cur);
      if (suite.has(uuid)) suite.delete(uuid);
      else suite.add(uuid);
      return suite;
    });

  const choisisL = (plans ?? []).filter((p) => choisis.has(p.uuid));
  const reecritures = choisisL.filter((p) => p.aDesSections || p.nbRefs > 0).length;
  const rendus = choisisL.filter((p) => p.aUnRendu).length;
  const parEpisode = useMemo(() => {
    const m = new Map<string, PlanPourFiche[]>();
    for (const p of plans ?? []) m.set(p.episodeLibelle, [...(m.get(p.episodeLibelle) ?? []), p]);
    return [...m.entries()];
  }, [plans]);

  const lancer = () => void ctx.lancer(() => genererFiches(conv.uuid, { planUuids: uuids, consigne: consigne.trim() || undefined }));

  const etat = (p: PlanPourFiche) =>
    [p.aDesSections ? "a déjà une fiche" : p.nbRefs > 0 ? "a des références" : "à écrire", p.aUnRendu ? "rendu vidéo" : null, p.nbRepliques ? `${p.nbRepliques} réplique${p.nbRepliques > 1 ? "s" : ""}` : null, p.sansIntention ? "sans intention" : null]
      .filter(Boolean)
      .join(" · ");

  return (
    <div className="ag-etape-corps ag-eps">
      <div>
        <h3 className="ag-eps-titre">{titre ?? (unSeul ? "Écrire la fiche de ce plan" : "Écrire les fiches de plan")}</h3>
        <p className="tiny-note">
          L&rsquo;agent écrit le prompt vidéo (MiniMax H3) {unSeul ? "de ce plan" : "de chaque plan, un plan à la fois"} : six sections, références d&rsquo;images et de sons, durée. Écrire une fiche remplace
          tout (sections et références) ; les répliques liées restent celles du plan. Les assets qui manquent seront proposés à la création. Tu relis tout avant que rien ne soit écrit.
        </p>
      </div>

      {erreurLecture ? (
        <p className="ag-erreur" role="alert">
          {erreurLecture}
        </p>
      ) : null}
      {plans == null && !erreurLecture ? <p className="ag-vide">Lecture des plans…</p> : null}
      {plans != null && plans.length === 0 ? <p className="ag-vide">Aucun plan ici : écris d&rsquo;abord le scénario.</p> : null}

      {plans != null && plans.length > 0 ? (
        <>
          {unSeul && plans[0]?.aUnRendu ? (
            <p className="ag-eps-alerte tiny-note" role="status">
              Ce plan a un rendu : préfère « Corriger après visionnage » (bouton de la page du plan), qui ne retouche que ce qui ne va pas. Réécrire la fiche remplace tout, sections et
              références (case décochée par défaut dans la revue : la cocher, c&rsquo;est remettre le plan à zéro).
            </p>
          ) : null}
          {parEpisode.map(([episode, liste]) => (
            <div key={episode}>
              {parEpisode.length > 1 || !unSeul ? <p className="tiny-note">{episode}</p> : null}
              <ul className="ag-eps-liste" aria-label={`Plans · ${episode}`}>
                {liste.map((p) => (
                  <li key={p.uuid} className={`ag-ep-ligne${choisis.has(p.uuid) ? " ag-ep-choisi" : ""}`}>
                    <label className="ag-case">
                      <input type="checkbox" checked={choisis.has(p.uuid)} onChange={() => bascule(p.uuid)} disabled={occupe} />
                      <span className="ag-ep-nom">
                        <span className="num">Plan {two(p.rang)}</span> · {p.titre}
                        {p.sceneTitre ? <span className="tiny-note"> — {p.sceneTitre}</span> : null}
                      </span>
                    </label>
                    <span className={`ag-ep-etat tiny-note${p.aDesSections || p.aUnRendu ? " ag-ep-rempli" : ""}`}>{etat(p)}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          <p className="tiny-note" role="status">
            {uuids.length} plan{uuids.length > 1 ? "s" : ""} sur {plans.length} sélectionné{uuids.length > 1 ? "s" : ""}
          </p>
          {reecritures > 0 ? (
            <p className="ag-eps-alerte tiny-note" role="status">
              {reecritures === 1 ? "Un plan choisi a" : `${reecritures} plans choisis ont`} déjà une fiche ou des références : la nouvelle fiche remplacera tout (section « risque d&rsquo;écrasement », décochée par défaut ; la cocher, c&rsquo;est remettre le plan à zéro).
              {rendus > 0 ? ` ${rendus === 1 ? "Un a" : `${rendus} ont`} déjà un rendu vidéo, qui ne correspondra plus.` : ""}
            </p>
          ) : null}

          <div className="gd-grp">
            <label className="gd-lbl" htmlFor="ag-fiches-consigne">
              Une consigne {unSeul ? "" : "pour tous les plans "}(facultatif)
            </label>
            <textarea
              id="ag-fiches-consigne"
              className="field"
              rows={2}
              value={consigne}
              onChange={(e) => setConsigne(e.target.value)}
              placeholder="Ex. Caméra plus mobile ; garde le décor désert."
              disabled={occupe}
            />
          </div>

          <div className="ag-lancer">
            <span className="tiny-note ag-estimation" role="status">
              {estimation ? libelleEstimation(estimation) : uuids.length === 0 ? "Coche au moins un plan." : "…"}
            </span>
            <button type="button" className="btn btn-gold" onClick={lancer} disabled={occupe || uuids.length === 0}>
              {occupe ? "…" : unSeul ? "Écrire la fiche" : `Écrire les fiches (${uuids.length})`}
            </button>
          </div>
        </>
      ) : null}
    </div>
  );
}
