"use client";

import { useEffect, useState } from "react";
import { genererIteration } from "@/app/agents/actions";
import { estimerIterationVue, lireEtatIterationVue } from "@/app/agents/lecture";
import type { ContexteEtape } from "@/components/agents/contexte";
import { libelleEstimation } from "@/lib/agents-affichage";
import type { EstimationGeneration, EtatIterationPlan } from "@/lib/agents/types";

/** « Corriger après visionnage » (page d'un plan qui a un rendu) : ce que l'utilisateur a vu, en texte libre et
 * OBLIGATOIRE, puis une tâche `iteration-plan`. Le worker découpe le dernier rendu en vignettes (une par seconde)
 * et mesure sa durée réelle ; l'agent pose un diagnostic et propose le plus petit changement du prompt. Rien n'est
 * écrit avant la revue. Sans rendu : pas de correction (jamais à l'aveugle). */
export function ChoixIteration({ ctx }: { ctx: ContexteEtape }) {
  const { conv, occupe } = ctx;
  const planUuid = ctx.demande.planUuid ?? conv.cible?.uuid ?? null;
  const [etat, setEtat] = useState<EtatIterationPlan | null>(null);
  const [erreurLecture, setErreurLecture] = useState<string | null>(null);
  const [vu, setVu] = useState("");
  const [estimation, setEstimation] = useState<EstimationGeneration | null>(null);

  useEffect(() => {
    if (!planUuid) {
      setErreurLecture("Plan inconnu : ouvre la correction depuis la page du plan.");
      return;
    }
    let annule = false;
    Promise.all([lireEtatIterationVue(conv.projectId, planUuid), estimerIterationVue()])
      .then(([e, est]) => {
        if (annule) return;
        setEtat(e);
        setEstimation(est);
        if (!e) setErreurLecture("Plan introuvable.");
      })
      .catch((e) => {
        if (!annule) setErreurLecture(e instanceof Error ? e.message : "Lecture du plan impossible.");
      });
    return () => {
      annule = true;
    };
  }, [conv.projectId, planUuid]);

  const possible = !!etat?.rendu && etat.aUneFiche;
  const lancer = () => {
    const texte = vu.trim();
    if (!texte || !possible || occupe) return;
    void ctx.lancer(() => genererIteration(conv.uuid, { retour: texte }));
  };

  return (
    <div className="ag-etape-corps ag-eps">
      <div>
        <h3 className="ag-eps-titre">Corriger après visionnage</h3>
        <p className="tiny-note">
          L&rsquo;agent regarde le dernier rendu de ce plan (une vignette par seconde, durée réelle mesurée), le compare au prompt instant par instant et propose le plus petit
          changement de texte qui traite la cause. Seules les sections corrigées changent ; les références, les répliques et la durée ne bougent pas. Tu relis avant que rien ne soit écrit.
        </p>
      </div>

      {erreurLecture ? (
        <p className="ag-erreur" role="alert">
          {erreurLecture}
        </p>
      ) : null}
      {etat == null && !erreurLecture ? <p className="ag-vide">Lecture du plan…</p> : null}

      {etat ? (
        <>
          {etat.rendu ? (
            <p className="tiny-note">
              Rendu regardé : {etat.rendu.importe ? "importé" : "dernière génération"}
              {etat.rendu.termineLe ? ` du ${new Date(etat.rendu.termineLe).toLocaleString("fr-FR")}` : ""} · durée voulue {etat.rendu.dureeVoulueSecondes} s. Le prompt actuel est
              supposé être celui de ce rendu : si tu l&rsquo;as retouché depuis, dis-le.
            </p>
          ) : (
            <p className="ag-eps-alerte tiny-note" role="status">
              Ce plan n&rsquo;a pas encore de rendu terminé : on ne corrige pas un prompt à l&rsquo;aveugle. Génère (ou importe) le plan, regarde-le, puis reviens.
            </p>
          )}
          {!etat.aUneFiche ? (
            <p className="ag-eps-alerte tiny-note" role="status">
              Ce plan n&rsquo;a pas de fiche (prompt vide) : écris-la d&rsquo;abord.
            </p>
          ) : null}
          {etat.nbCorrections > 0 ? (
            <p className="tiny-note">
              {etat.nbCorrections} correction{etat.nbCorrections > 1 ? "s" : ""} déjà tentée{etat.nbCorrections > 1 ? "s" : ""} sur ce plan (dont {etat.nbCorrectionsAppliquees} appliquée
              {etat.nbCorrectionsAppliquees > 1 ? "s" : ""}) : l&rsquo;agent les lit pour ne pas tourner en rond.
            </p>
          ) : null}

          <div className="gd-grp">
            <label className="gd-lbl" htmlFor="ag-vu">
              Ce que tu as vu
            </label>
            <textarea
              id="ag-vu"
              className="field"
              rows={4}
              value={vu}
              onChange={(e) => setVu(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                  e.preventDefault();
                  lancer();
                }
              }}
              placeholder="Ex. À 4 s, l'épée apparaît alors qu'elle devrait rester cachée. Il court sur place pendant tout le deuxième shot."
              disabled={occupe || !possible}
              required
            />
            <p className="tiny-note">Obligatoire : c&rsquo;est le point de départ du diagnostic. Cite les instants si tu peux. Ctrl + Entrée pour lancer.</p>
          </div>

          <div className="ag-lancer">
            <span className="tiny-note ag-estimation" role="status">
              {estimation ? libelleEstimation(estimation) : "…"}
            </span>
            <button type="button" className="btn btn-gold" onClick={lancer} disabled={occupe || !possible || !vu.trim()} title={!vu.trim() ? "Dis d'abord ce que tu as vu" : undefined}>
              {occupe ? "…" : "Lancer le diagnostic"}
            </button>
          </div>
        </>
      ) : null}
    </div>
  );
}
