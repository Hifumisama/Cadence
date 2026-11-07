"use client";

import { useState, useTransition } from "react";
import { updatePlanScenario } from "@/app/plans/actions";
import { DUREE_GENERATION_MAX, DUREE_GENERATION_MIN } from "@/lib/plan-checks";
import { GenererFiche } from "@/components/plan/GenererFiche";
import { LIAISONS, LIBELLE_LIAISON, type Liaison } from "@/lib/plan-liaison";
import { ChampsReglagesCamera } from "@/components/h3ir/ChampsReglagesCamera";
import { LIBELLE_CREATIVITE, LIBELLE_NIVEAU, RESUME_STYLE_CAMERA, infobulleChoix, resoudreReglages, type ReglagesBruts } from "@/lib/h3ir/reglages";
import {
  ScenarioNarratifFields,
  type ChampsNarratifs,
} from "@/components/plan/ScenarioNarratifFields";

type Valeurs = ChampsNarratifs & {
  titre: string;
  dureeMontageSecondes: number;
  liaison: Liaison;
  /** Open H3 IR : vide = le plan hérite de sa scène, puis du projet (lib/h3ir/reglages.ts). Doivent faire partie de `initial`, sinon chaque enregistrement les remettrait à zéro. */
  creativite: string;
  styleCamera: string;
};

export function PlanScenarioPanel({
  planId,
  projectId,
  planUuid,
  brouillon,
  initial,
  demandeEnCours = null,
  dureeGeneration,
  musique = null,
  reglagesProjet,
  reglagesScene = null,
}: {
  planId: number;
  projectId: number;
  planUuid: string;
  brouillon: boolean;
  initial: Valeurs;
  /** Créativité et style de mise en scène du projet et de la scène du plan : ce que le plan hérite quand il ne règle rien. */
  reglagesProjet: ReglagesBruts;
  reglagesScene?: ReglagesBruts | null;
  /** La demande « Générer la fiche » déjà en cours sur ce plan, s'il y en a une. */
  demandeEnCours?: number | null;
  /** La durée de génération du plan (fixée par la fiche et par « Itérer », pas retouchée ici) : montrée à côté de la durée au montage. */
  dureeGeneration?: number;
  /** Le timecode de musique du plan, s'il y en a un. */
  musique?: string | null;
}) {
  const [champs, setChamps] = useState(initial);
  const [editionOuverte, setEditionOuverte] = useState(brouillon);
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const [lu, setLu] = useState(false);

  const majNarratifTitre = (titre: string) => setChamps((c) => ({ ...c, titre }));
  const majNarratif = (cle: keyof ChampsNarratifs, valeur: string) =>
    setChamps((c) => ({ ...c, [cle]: valeur }));

  const onSave = () => {
    startTransition(async () => {
      await updatePlanScenario(planId, champs);
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
      if (!brouillon) setEditionOuverte(false);
    });
  };

  // « Développer » écrit réellement la fiche : le scénario du plan est enregistré, puis l'agent l'écrit en arrière-plan (même demande que « Générer la fiche »).
  const enregistrerAvant = async () => {
    await updatePlanScenario(planId, champs);
    return true;
  };

  const heritage = resoudreReglages({ projet: reglagesProjet, scene: reglagesScene });

  if (!brouillon && !editionOuverte) {
    const reglages = resoudreReglages({ projet: reglagesProjet, scene: reglagesScene, plan: { creativite: initial.creativite, styleCamera: initial.styleCamera } });
    const horsBornes = dureeGeneration != null && (dureeGeneration < DUREE_GENERATION_MIN || dureeGeneration > DUREE_GENERATION_MAX);
    return (
      <section className="sp-entete" id="fp-scenario" aria-label="Scénario du plan">
        <p className={`sp-description${initial.description ? "" : " is-vide"}${lu ? " is-lu" : ""}`}>{initial.description || "Pas encore de description."}</p>
        <div className="sp-ligne">
          <ul className="sp-puces">
            <li>
              <span>Montage</span> <b className="num">{initial.dureeMontageSecondes} s</b>
            </li>
            {dureeGeneration != null ? (
              <li className={horsBornes ? "is-alerte" : undefined} title={horsBornes ? `H3 génère de ${DUREE_GENERATION_MIN} à ${DUREE_GENERATION_MAX} s : demande à l'agent de raccourcir ou d'allonger le plan dans ta consigne.` : "La durée change avec le contenu du plan : demande-la dans ta consigne."}>
                <span>Génération</span> <b className="num">{dureeGeneration} s</b>
                {horsBornes ? <em> hors bornes</em> : null}
              </li>
            ) : null}
            <li>
              <span>Liaison</span> <b>{LIBELLE_LIAISON[initial.liaison]}</b>
            </li>
            {reglages.origine.styleCamera !== "defaut" ? (
              <li title="Style de mise en scène d'Open H3 IR pour ce plan. Se règle ici (Modifier), sur la scène ou sur le projet.">
                <span>Mise en scène</span> <b title={reglages.styleCamera ? infobulleChoix(reglages.styleCamera) : undefined}>{reglages.styleCamera ? RESUME_STYLE_CAMERA[reglages.styleCamera] : "aucun style"}</b>
                {reglages.origine.styleCamera !== "plan" ? <em> · {LIBELLE_NIVEAU[reglages.origine.styleCamera]}</em> : null}
              </li>
            ) : null}
            {reglages.origine.creativite !== "defaut" ? (
              <li title="Créativité d'Open H3 IR pour ce plan. Se règle ici (Modifier), sur la scène ou sur le projet.">
                <span>Créativité</span> <b>{LIBELLE_CREATIVITE[reglages.creativite]}</b>
                {reglages.origine.creativite !== "plan" ? <em> · {LIBELLE_NIVEAU[reglages.origine.creativite]}</em> : null}
              </li>
            ) : null}
            {musique ? (
              <li>
                <span>Musique</span> <b className="num">{musique}</b>
              </li>
            ) : null}
          </ul>
          <span className="sp-gestes">
            {initial.description.length > 220 ? (
              <button type="button" className="tm-lien" onClick={() => setLu((v) => !v)}>
                {lu ? "Réduire" : "Tout lire"}
              </button>
            ) : null}
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditionOuverte(true)} title="Titre, durée de montage, liaison">
              Modifier
            </button>
          </span>
        </div>
      </section>
    );
  }

  return (
    <section className="panel" id="fp-scenario">
      <div className="panel-hd">
        <h2>{brouillon ? "Découpage scénario" : "Titre, montage et liaison"}</h2>
        {brouillon ? <span className="eyebrow">Pas encore de fiche de plan</span> : null}
      </div>
      <div className="panel-bd form-grid">
        <div className="field-group wide">
          <label>Titre</label>
          <input className="field" value={champs.titre} onChange={(e) => majNarratifTitre(e.target.value)} />
        </div>
        <div className="field-group">
          <label>Durée montage (s)</label>
          <input
            className="field field-mono"
            value={champs.dureeMontageSecondes}
            onChange={(e) =>
              setChamps((c) => ({ ...c, dureeMontageSecondes: Number(e.target.value) || 0 }))
            }
          />
        </div>
        <div className="field-group">
          <label>Liaison avec le plan précédent</label>
          <select className="field" value={champs.liaison} onChange={(e) => setChamps((c) => ({ ...c, liaison: e.target.value as Liaison }))}>
            {LIAISONS.map((l) => (
              <option key={l} value={l}>
                {LIBELLE_LIAISON[l]}
              </option>
            ))}
          </select>
        </div>
        <ChampsReglagesCamera
          creativite={champs.creativite}
          styleCamera={champs.styleCamera}
          onCreativite={(creativite) => setChamps((c) => ({ ...c, creativite }))}
          onStyleCamera={(styleCamera) => setChamps((c) => ({ ...c, styleCamera }))}
          heritage={heritage}
          idPrefixe="plan"
        />
        {brouillon ? (
          <ScenarioNarratifFields valeurs={champs} onChange={majNarratif} />
        ) : (
          <p className="tiny-note wide">
            Le titre, la durée de montage (la place du plan dans le minutage du film) et la liaison (comment il s&rsquo;enchaîne au plan précédent, au prochain rendu) se retouchent ici. Pour changer ce
            qui se passe dans le plan, écris une consigne : l&rsquo;agent réécrit alors la description et le prompt ensemble.
          </p>
        )}
        <div className="form-actions wide">
          {brouillon ? (
            <GenererFiche projectId={projectId} planUuid={planUuid} demandeEnCours={demandeEnCours} libelle="Développer en fiche de plan" className="btn btn-gold" avant={enregistrerAvant} />
          ) : null}
          <button className="btn btn-ghost" onClick={onSave} disabled={pending}>
            {pending ? "..." : saved ? "Enregistré" : "Enregistrer"}
          </button>
          {!brouillon ? (
            <button className="btn btn-ghost" type="button" onClick={() => setEditionOuverte(false)}>
              Fermer
            </button>
          ) : null}
        </div>
      </div>
    </section>
  );
}
