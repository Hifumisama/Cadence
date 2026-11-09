"use client";

import { useState, useTransition } from "react";
import { updatePlanScenario } from "@/app/plans/actions";
import { DUREE_GENERATION_MAX, DUREE_GENERATION_MIN } from "@/lib/plan-checks";
import { GenererFiche } from "@/components/plan/GenererFiche";
import type { Liaison } from "@/lib/plan-liaison";
import { intentAffichee } from "@/lib/intent";
import { ChampsReglagesCamera } from "@/components/h3ir/ChampsReglagesCamera";
import { RoueDuree } from "@/components/plan/RoueDuree";
import type { DemoDispo } from "@/lib/h3ir/demos";
import "./atelier.css";
import { LIBELLE_CREATIVITE, LIBELLE_NIVEAU, RESUME_STYLE_CAMERA, infobulleChoix, resoudreReglages, type ReglagesBruts } from "@/lib/h3ir/reglages";
import {
  ScenarioNarratifFields,
  type ChampsNarratifs,
} from "@/components/plan/ScenarioNarratifFields";

type Valeurs = ChampsNarratifs & {
  titre: string;
  /** La durée de RENDU du plan (`plans.duree_generation_secondes`, que la durée de montage suit) ; null : hors des bornes actuelles (plan d'avant), on n'y touche pas tant qu'on ne choisit pas. */
  dureeSecondes: number | null;
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
  premierPlan = false,
  demos,
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
  /** La durée de rendu actuelle du plan, même hors bornes (plan d'avant) : la puce la signale. */
  dureeGeneration?: number;
  /** Premier plan de l'épisode : rien avant lui, la liaison ne se règle pas. */
  premierPlan?: boolean;
  /** Vidéos de démo de la mise en scène (lib/media.ts), pour la fenêtre de choix du style. */
  demos?: Record<string, DemoDispo>;
  /** Le timecode de musique du plan, s'il y en a un. */
  musique?: string | null;
}) {
  const [champs, setChamps] = useState(initial);
  const [editionOuverte, setEditionOuverte] = useState(brouillon);
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const [lu, setLu] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  const majNarratifTitre = (titre: string) => setChamps((c) => ({ ...c, titre }));
  const majNarratif = (cle: keyof ChampsNarratifs, valeur: string) =>
    setChamps((c) => ({ ...c, [cle]: valeur }));

  // La durée ne part que si elle a été choisie (une durée hors bornes d'avant reste telle quelle tant qu'on n'y touche pas).
  const aEnvoyer = () => {
    const { dureeSecondes, ...reste } = champs;
    return dureeSecondes != null ? { ...reste, dureeSecondes } : reste;
  };
  const onSave = () => {
    startTransition(async () => {
      const r = await updatePlanScenario(planId, aEnvoyer());
      if (!r.ok) {
        setErreur(r.erreur);
        return;
      }
      setErreur(null);
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
      if (!brouillon) setEditionOuverte(false);
    });
  };

  // « Développer » écrit réellement la fiche : le scénario du plan est enregistré, puis l'agent l'écrit en arrière-plan (même demande que « Générer la fiche »).
  const enregistrerAvant = async () => {
    const r = await updatePlanScenario(planId, aEnvoyer());
    if (!r.ok) setErreur(r.erreur);
    return r.ok;
  };
  const lie = champs.liaison === "suite";

  const heritage = resoudreReglages({ projet: reglagesProjet, scene: reglagesScene });

  if (!brouillon && !editionOuverte) {
    const reglages = resoudreReglages({ projet: reglagesProjet, scene: reglagesScene, plan: { creativite: initial.creativite, styleCamera: initial.styleCamera } });
    // L'intent affiché : sans la « Consigne de l'auteur » (elle double le récit quand il la respecte ; plan-h3 la lit toujours en base) ni l'ancien « État en fin de plan ».
    const intent = intentAffichee(initial.description);
    const horsBornes = dureeGeneration != null && (dureeGeneration < DUREE_GENERATION_MIN || dureeGeneration > DUREE_GENERATION_MAX);
    return (
      <section className="sp-entete" id="fp-scenario" aria-label="Scénario du plan">
        <p className={`sp-description${intent ? "" : " is-vide"}${lu ? " is-lu" : ""}`}>{intent || "Pas encore de description."}</p>
        <div className="sp-ligne">
          <ul className="sp-puces">
            {dureeGeneration != null ? (
              <li
                className={horsBornes ? "is-alerte" : undefined}
                title={horsBornes ? `H3 rend de ${DUREE_GENERATION_MIN} à ${DUREE_GENERATION_MAX} s : choisis une durée dans « Modifier ».` : "La durée du rendu (le montage la suit) : se change dans « Modifier », ou dans ta consigne."}
              >
                <span>Durée de rendu</span> <b className="num">{dureeGeneration} s</b>
                {horsBornes ? <em> hors bornes</em> : null}
              </li>
            ) : null}
            <li title={premierPlan ? "Premier plan de l'épisode : rien avant lui." : undefined}>
              <span>Lié au plan précédent</span> <b>{premierPlan ? "—" : initial.liaison === "suite" ? "Oui" : "Non"}</b>
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
            {intent.length > 220 ? (
              <button type="button" className="tm-lien" onClick={() => setLu((v) => !v)}>
                {lu ? "Réduire" : "Tout lire"}
              </button>
            ) : null}
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditionOuverte(true)} title="Titre, durée de rendu, liaison, mise en scène">
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
        <h2>{brouillon ? "Découpage scénario" : "Titre, durée de rendu et liaison"}</h2>
        {brouillon ? <span className="eyebrow">Pas encore de fiche de plan</span> : null}
      </div>
      <div className="panel-bd form-grid">
        <div className="field-group wide">
          <label>Titre</label>
          <input className="field" value={champs.titre} onChange={(e) => majNarratifTitre(e.target.value)} />
        </div>
        <div className="field-group">
          <span className="pl-etiquette" id={`duree-rendu-${planId}`}>
            Durée de rendu
          </span>
          <RoueDuree valeur={champs.dureeSecondes} min={DUREE_GENERATION_MIN} max={DUREE_GENERATION_MAX} onChange={(v) => setChamps((c) => ({ ...c, dureeSecondes: v }))} idEtiquette={`duree-rendu-${planId}`} />
          <span className="tiny-note">
            {champs.dureeSecondes == null && dureeGeneration != null
              ? `Actuellement ${dureeGeneration} s, hors des bornes : choisis de ${DUREE_GENERATION_MIN} à ${DUREE_GENERATION_MAX} s.`
              : `De ${DUREE_GENERATION_MIN} à ${DUREE_GENERATION_MAX} s entières ; le montage suit. Les repères de temps des shots du prompt ne sont pas recalés : vérifie les contrôles avant de relancer.`}
          </span>
        </div>
        <div className="field-group">
          <span className="pl-etiquette" id={`liaison-${planId}`}>
            Lié au plan précédent ?
          </span>
          <button
            type="button"
            role="switch"
            className="pl-interrupteur"
            aria-checked={!premierPlan && lie}
            aria-labelledby={`liaison-${planId}`}
            disabled={premierPlan}
            onClick={() => setChamps((c) => ({ ...c, liaison: c.liaison === "suite" ? "coupe" : "suite" }))}
          >
            <span className="pl-interrupteur-piste" aria-hidden="true">
              <i />
            </span>
            <span>{premierPlan ? "Premier plan" : lie ? "Oui" : "Non"}</span>
          </button>
          <span className="tiny-note">
            {premierPlan
              ? "Premier plan de l'épisode : rien avant lui."
              : lie
                ? "Il reprend là où le précédent finit : sa dernière image sert de raccord au prochain rendu."
                : "Coupe franche : il s'ouvre librement, sans raccord."}
          </span>
        </div>
        <ChampsReglagesCamera
          creativite={champs.creativite}
          styleCamera={champs.styleCamera}
          onCreativite={(creativite) => setChamps((c) => ({ ...c, creativite }))}
          onStyleCamera={(styleCamera) => setChamps((c) => ({ ...c, styleCamera }))}
          heritage={heritage}
          idPrefixe="plan"
          demos={demos}
        />
        {brouillon ? (
          <ScenarioNarratifFields valeurs={champs} onChange={majNarratif} />
        ) : (
          <p className="tiny-note wide">
            Le titre, la durée de rendu (que le montage suit) et la liaison (comment il s&rsquo;enchaîne au plan précédent, au prochain rendu) se retouchent ici. Pour changer ce
            qui se passe dans le plan, écris une consigne : l&rsquo;agent réécrit alors la description et le prompt ensemble.
          </p>
        )}
        {erreur ? (
          <p className="tiny-note wide" role="alert" style={{ color: "var(--ecarlate-glow)" }}>
            {erreur}
          </p>
        ) : null}
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
