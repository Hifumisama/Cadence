"use client";

import "../conception/conception.css";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { creerProjetConcu } from "@/app/nouveau/actions";
import {
  CLE_SESSION,
  DERNIERE_ETAPE,
  ETAPES_CONCEPTION,
  etapeMax,
  etapeValide,
  etatInitial,
  lireEtatSauvegarde,
  resumeEtape,
  suivreRecommandation,
  teinteAmbiance,
  versCharge,
  type EtatAssistant,
} from "@/lib/projects/design-ui";
import { SceneAccueil, SceneDuree, SceneGenreTon, SceneLangue } from "./Scenes";
import { Glissiere } from "./Slider";
import { SceneStyle } from "./SceneStyle";
import { SceneMiseEnScene } from "./StagingScene";
import type { DemoDispo } from "@/lib/h3ir/demos";
import type { MajEtat, StyleVue } from "./types";

/** Ce qu'il manque pour avancer, par étape (affiché dans la barre d'action tant que « Continuer » est grisé). */
const INVITES = ["", "Choisis au moins un genre (deux au plus).", "Règle la durée pour continuer.", "Choisis la langue des dialogues.", "Choisis un style, ou écris le tien.", ""];

/** La page de conception d'un projet : six scènes (format, genre et ton, durée, langue, style, mise en scène), un ruban de pellicule des neuf étapes pour naviguer,
 * une lumière d'ambiance qui suit les choix. L'état vit ici et dans la session du navigateur (rien n'est créé tant qu'on n'a pas
 * rencontré le scénariste : abandonner ne laisse aucun projet). Au dernier pas, le projet est créé côté serveur (app/nouveau/actions.ts)
 * avec sa fiche d'entretien préremplie, puis l'entretien s'ouvre. Plan : docs/PLAN_CONCEPTION_PROJET.md. */
export function ConceptionAssistant({ styles, demos = {} }: { styles: StyleVue[]; /** Les vidéos de démo de la mise en scène présentes sur le stockage (lib/media.ts, `demosMiseEnScene`). */ demos?: Record<string, DemoDispo> }) {
  const router = useRouter();
  const [etat, setEtat] = useState<EtatAssistant>(etatInitial);
  const [etape, setEtape] = useState(0);
  const [recule, setRecule] = useState(false);
  const [restaure, setRestaure] = useState(false);
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [confirmer, setConfirmer] = useState(false);
  const scene = useRef<HTMLDivElement>(null);

  const utilisable = useCallback((id: string) => styles.some((s) => s.id === id), [styles]);
  const nomStyle = useCallback((id: string) => styles.find((s) => s.id === id)?.nom ?? null, [styles]);
  const maxAtteignable = etapeMax(etat, utilisable);
  const peutContinuer = etapeValide(etape, etat, utilisable);

  // Reprise de la session : revenir sur la page (ou la recharger) retrouve les choix.
  useEffect(() => {
    try {
      const sauve = lireEtatSauvegarde(window.sessionStorage.getItem(CLE_SESSION));
      if (sauve) setEtat(sauve);
    } catch {
      /* stockage indisponible (navigation privée…) : on part de zéro */
    }
    setRestaure(true);
  }, []);
  useEffect(() => {
    if (!restaure) return;
    try {
      window.sessionStorage.setItem(CLE_SESSION, JSON.stringify(etat));
    } catch {
      /* idem */
    }
  }, [etat, restaure]);

  // Après chaque changement : tant que la mise en scène n'a pas été choisie à la main, elle suit la recommandation du style (lib/projects/design-ui.ts, `suivreRecommandation`).
  const maj: MajEtat = useCallback((f) => setEtat((e) => suivreRecommandation(f(e))), []);

  const aller = useCallback(
    (i: number) => {
      if (i < 0 || i > DERNIERE_ETAPE || i === etape || i > maxAtteignable) return;
      setRecule(i < etape);
      setEtape(i);
      setErreur(null);
    },
    [etape, maxAtteignable],
  );

  // Flèches : changent d'étape, sauf dans un champ de saisie ou sur un curseur (qui s'en sert pour changer sa valeur).
  useEffect(() => {
    const touche = (e: KeyboardEvent) => {
      const cible = e.target as HTMLElement | null;
      if (cible && (cible.closest("input, textarea, select, [role='slider'], [role='dialog']") || cible.isContentEditable)) return;
      if (e.key === "ArrowRight" && etape < DERNIERE_ETAPE) aller(etape + 1);
      else if (e.key === "ArrowLeft") aller(etape - 1);
    };
    document.addEventListener("keydown", touche);
    return () => document.removeEventListener("keydown", touche);
  }, [aller, etape]);

  useEffect(() => {
    scene.current?.scrollIntoView({ block: "nearest" });
  }, [etape]);

  const rencontrer = async () => {
    setConfirmer(false);
    setEnvoi(true);
    setErreur(null);
    try {
      const r = await creerProjetConcu(versCharge(etat));
      if (!r.ok) {
        setErreur(r.erreur);
        return;
      }
      try {
        window.sessionStorage.removeItem(CLE_SESSION);
      } catch {
        /* sans importance */
      }
      router.push(`/p/${r.projectId}/demarrage`);
    } catch {
      setErreur("La création du projet a échoué. Réessaie.");
    } finally {
      setEnvoi(false);
    }
  };

  const style = useMemo(
    () =>
      ({
        "--cn-hue": teinteAmbiance(etat.genres),
        "--cn-lum": (1 - etat.ton / 100).toFixed(2),
      }) as CSSProperties,
    [etat.genres, etat.ton],
  );

  return (
    <div className="cn-salle" style={style}>
      <div className="cn-ambiance" aria-hidden="true"><i /><i /></div>
      <nav className="cn-ruban" aria-label="Étapes de la conception">
        {ETAPES_CONCEPTION.map((nom, i) => {
          // Les trois dernières étapes (scénario, clap, avancée) viennent après la création du projet : visibles, pas encore rejoignables.
          const resume = i <= DERNIERE_ETAPE ? resumeEtape(i, etat, nomStyle) : "";
          return (
            <button
              key={nom}
              type="button"
              className={`cn-cadre${resume && i !== etape ? " is-fait" : ""}${i > DERNIERE_ETAPE ? " is-futur" : ""}`}
              aria-current={i === etape ? "step" : undefined}
              disabled={i > DERNIERE_ETAPE || i > maxAtteignable}
              title={resume ? `${nom} : ${resume}` : nom}
              onClick={() => aller(i)}
            >
              <b>{String(i + 1).padStart(2, "0")} · {nom}</b>
              <span>{resume || "—"}</span>
            </button>
          );
        })}
      </nav>

      <div className={`cn-scene${recule ? " is-recule" : ""}`} data-scene={etape === 4 ? "style" : undefined} key={etape} ref={scene}>
        {etape === 0 ? (
          <>
            <SceneAccueil />
            <Glissiere geant libelle="Glisse pour commencer" onValider={() => aller(1)} />
          </>
        ) : null}
        {etape === 1 ? <SceneGenreTon etat={etat} maj={maj} /> : null}
        {etape === 2 ? <SceneDuree etat={etat} maj={maj} /> : null}
        {etape === 3 ? <SceneLangue etat={etat} maj={maj} /> : null}
        {etape === 4 ? <SceneStyle etat={etat} maj={maj} styles={styles} /> : null}
        {etape === 5 ? <SceneMiseEnScene etat={etat} maj={maj} demos={demos} /> : null}
      </div>

      <div className="cn-barre" role="group" aria-label="Avancer dans la conception">
        <button type="button" className="btn" disabled={etape === 0 || envoi} onClick={() => aller(etape - 1)}>← Retour</button>
        <span className="cn-barre-texte" aria-live="polite">
          {!peutContinuer ? INVITES[etape] : etape < DERNIERE_ETAPE ? <>Ensuite : <b>{ETAPES_CONCEPTION[etape + 1]}</b></> : <>Les choix sont faits : <b>le scénariste t’attend</b>.</>}
        </span>
        {erreur ? <span className="cn-erreur" role="alert">{erreur}</span> : null}
        {etape === 0 ? null : <Glissiere
          libelle={etape < DERNIERE_ETAPE ? "Glisse pour continuer" : "Glisse : rencontrer le scénariste"}
          action={etape === DERNIERE_ETAPE}
          desactive={!peutContinuer}
          occupe={envoi}
          onValider={etape < DERNIERE_ETAPE ? () => aller(etape + 1) : () => setConfirmer(true)}
        />}
      </div>

      {confirmer ? (
        <div className="cn-lightbox" role="dialog" aria-modal="true" aria-label="Avant de rencontrer le scénariste" onClick={() => setConfirmer(false)} onKeyDown={(e) => e.key === "Escape" && setConfirmer(false)}>
          <div className="cn-confirmation" onClick={(e) => e.stopPropagation()}>
            <b>Avant de rencontrer le scénariste</b>
            <p>Une fois l’entretien commencé, <b className="cn-fige">ces choix sont figés</b> : genre, ton, durée, langue et style ne se modifient plus. Relis-les si tu as un doute. La mise en scène, elle, se règle encore plus tard (Brief, scène ou plan).</p>
            <div className="cn-confirmation-actions">
              <button type="button" className="btn" autoFocus onClick={() => setConfirmer(false)}>Revenir aux choix</button>
              <button type="button" className="btn btn-gold" onClick={() => void rencontrer()}>Rencontrer le scénariste</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
