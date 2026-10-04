"use client";

import { useEffect, useMemo, useState } from "react";
import { genererScenarios } from "@/app/agents/actions";
import { estimerScenariosVue, listerEpisodesPourScenariosVue } from "@/app/agents/lecture";
import type { ContexteEtape } from "@/components/agents/contexte";
import { libelleChoixEpisodes, libelleEstimation, two } from "@/lib/agents-affichage";
import type { EpisodePourScenario, EstimationGeneration } from "@/lib/agents/types";

/** « Écrire les scénarios » : le sélecteur d'épisodes d'un LOT (une sous-tâche par épisode, l'une
 * après l'autre). Les épisodes VIDES (le squelette tout juste appliqué) sont cochés d'office ; on peut
 * en cocher d'autres, qui ont déjà du contenu : leurs modifications iront alors dans la section
 * « risque d'écrasement » de la revue, décochées. Sert à l'étape « Appliqué » d'une création de
 * projet (« Continuer ») et à l'étape « Consigne » d'une demande sur le projet ou une saison. */
export function ChoixEpisodes({ ctx, titre, saisonId }: { ctx: ContexteEtape; titre?: string; saisonId: number | null }) {
  const { conv, occupe } = ctx;
  const [episodes, setEpisodes] = useState<EpisodePourScenario[] | null>(null);
  const [choisis, setChoisis] = useState<Set<number>>(new Set());
  const [consigne, setConsigne] = useState("");
  const [estimation, setEstimation] = useState<EstimationGeneration | null>(null);
  const [erreurLecture, setErreurLecture] = useState<string | null>(null);

  useEffect(() => {
    let annule = false;
    listerEpisodesPourScenariosVue(conv.projectId, saisonId)
      .then((l) => {
        if (annule) return;
        setEpisodes(l);
        setChoisis(new Set(l.filter((e) => e.vide).map((e) => e.id)));
      })
      .catch((e) => {
        if (!annule) setErreurLecture(e instanceof Error ? e.message : "Lecture des épisodes impossible.");
      });
    return () => {
      annule = true;
    };
  }, [conv.projectId, saisonId]);

  const ids = useMemo(() => (episodes ?? []).filter((e) => choisis.has(e.id)).map((e) => e.id), [episodes, choisis]);
  useEffect(() => {
    if (ids.length === 0) {
      setEstimation(null);
      return;
    }
    let annule = false;
    estimerScenariosVue(ids)
      .then((e) => {
        if (!annule) setEstimation(e);
      })
      .catch(() => undefined);
    return () => {
      annule = true;
    };
  }, [ids]);

  const bascule = (id: number) =>
    setChoisis((cur) => {
      const suite = new Set(cur);
      if (suite.has(id)) suite.delete(id);
      else suite.add(id);
      return suite;
    });

  const vides = (episodes ?? []).filter((e) => e.vide).length;
  const avecContenuChoisis = (episodes ?? []).filter((e) => !e.vide && choisis.has(e.id));
  const lancer = () => void ctx.lancer(() => genererScenarios(conv.uuid, { episodeIds: ids, consigne: consigne.trim() || undefined }));

  return (
    <div className="ag-etape-corps ag-eps">
      <div>
        <h3 className="ag-eps-titre">{titre ?? "Écrire les scénarios des épisodes"}</h3>
        <p className="tiny-note">
          L&rsquo;agent écrit un épisode à la fois (scènes, plans, répliques), l&rsquo;un après l&rsquo;autre. Tu relis tout ensuite, épisode par épisode ; rien n&rsquo;est écrit dans le projet sans ton accord.
        </p>
      </div>

      {erreurLecture ? (
        <p className="ag-erreur" role="alert">
          {erreurLecture}
        </p>
      ) : null}
      {episodes == null && !erreurLecture ? <p className="ag-vide">Lecture des épisodes…</p> : null}
      {episodes != null && episodes.length === 0 ? <p className="ag-vide">Ce projet n&rsquo;a pas encore d&rsquo;épisode : applique d&rsquo;abord le squelette.</p> : null}

      {episodes != null && episodes.length > 0 ? (
        <>
          <ul className="ag-eps-liste" aria-label="Épisodes à écrire">
            {episodes.map((e) => (
              <li key={e.id} className={`ag-ep-ligne${choisis.has(e.id) ? " ag-ep-choisi" : ""}`}>
                <label className="ag-case">
                  <input type="checkbox" checked={choisis.has(e.id)} onChange={() => bascule(e.id)} disabled={occupe} />
                  <span className="ag-ep-nom">
                    {episodes.some((x) => x.saisonNumero !== e.saisonNumero) ? `S${two(e.saisonNumero)} · ` : ""}Épisode {two(e.numero)} · {e.titre}
                  </span>
                </label>
                <span className={`ag-ep-etat tiny-note${e.vide ? "" : " ag-ep-rempli"}`}>
                  {e.vide ? "vide" : `${e.nbPlans} plan${e.nbPlans > 1 ? "s" : ""}, ${e.nbScenes} scène${e.nbScenes > 1 ? "s" : ""}`}
                </span>
              </li>
            ))}
          </ul>
          <p className="tiny-note" role="status">
            {libelleChoixEpisodes(episodes.length, ids.length, vides)}
          </p>
          {avecContenuChoisis.length > 0 ? (
            <p className="ag-eps-alerte tiny-note" role="status">
              {avecContenuChoisis.length === 1 ? "Un épisode choisi contient" : `${avecContenuChoisis.length} épisodes choisis contiennent`} déjà du contenu : ses modifications iront dans la section « risque d&rsquo;écrasement », décochées. Les plans nouveaux s&rsquo;ajoutent à la fin ; rien n&rsquo;est supprimé.
            </p>
          ) : null}

          <div className="gd-grp">
            <label className="gd-lbl" htmlFor="ag-eps-consigne">
              Une consigne pour tous les épisodes (facultatif)
            </label>
            <textarea
              id="ag-eps-consigne"
              className="field"
              rows={2}
              value={consigne}
              onChange={(e) => setConsigne(e.target.value)}
              placeholder="Ex. Garde un rythme lent ; pas plus de deux répliques par plan."
              disabled={occupe}
            />
          </div>

          <div className="ag-lancer">
            <span className="tiny-note ag-estimation" role="status">
              {estimation ? libelleEstimation(estimation) : ids.length === 0 ? "Coche au moins un épisode." : "…"}
            </span>
            <button type="button" className="btn btn-gold" onClick={lancer} disabled={occupe || ids.length === 0}>
              {occupe ? "…" : `Écrire les scénarios (${ids.length})`}
            </button>
          </div>
        </>
      ) : null}
    </div>
  );
}
