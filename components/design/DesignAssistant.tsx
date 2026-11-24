"use client";

import "../conception/conception.css";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { creerProjetConcu } from "@/app/nouveau/actions";
import {
  CLE_SESSION,
  DERNIERE_ETAPE,
  ETAPE,
  ETAPES_CONCEPTION,
  etapeMax,
  etapeValide,
  etatInitial,
  lireEtatSauvegarde,
  resumeEtape,
  teinteAmbiance,
  versCharge,
  type EtatAssistant,
} from "@/lib/projects/design-ui";
import { luminositeAmbiance } from "@/lib/projects/design";
import { SceneAccueil, SceneDuree, SceneLangue, SceneMusique } from "./Scenes";
import { Glissiere } from "./Slider";
import { SceneStyle } from "./SceneStyle";
import type { MajEtat, StyleVue } from "./types";

/** What is missing to move forward, per step (shown in the action bar while « Continuer » is greyed out). */
const INVITES: Record<number, string> = { [ETAPE.style]: "Choisis un style, ou écris le tien." };

/** A project's design page: five scenes (welcome, duration, language, style, music: the FRAME only, the genre is decided in the interview), a filmstrip ribbon of the eight steps for navigation,
 * an ambient light that follows the choices. The state lives here and in the browser session (nothing is created until the screenwriter has been met:
 * abandoning leaves no project). At the last step, the project is created server-side (app/nouveau/actions.ts) with its pre-filled interview
 * sheet, then the interview opens. Plan: docs/PLAN_CONCEPTION_PROJET.md. */
export function ConceptionAssistant({ styles }: { styles: StyleVue[] }) {
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

  // Session resume: going back to the page (or reloading it) finds the choices again.
  useEffect(() => {
    try {
      const sauve = lireEtatSauvegarde(window.sessionStorage.getItem(CLE_SESSION));
      if (sauve) setEtat(sauve);
    } catch {
      /* storage unavailable (private browsing…): we start from zero */
    }
    setRestaure(true);
  }, []);
  useEffect(() => {
    if (!restaure) return;
    try {
      window.sessionStorage.setItem(CLE_SESSION, JSON.stringify(etat));
    } catch {
      /* same */
    }
  }, [etat, restaure]);

  const maj: MajEtat = useCallback((f) => setEtat((e) => f(e)), []);

  const aller = useCallback(
    (i: number) => {
      if (i < 0 || i > DERNIERE_ETAPE || i === etape || i > maxAtteignable) return;
      setRecule(i < etape);
      setEtape(i);
      setErreur(null);
    },
    [etape, maxAtteignable],
  );

  // Arrows: change the step, except in an input field or on a slider (which uses them to change its value).
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
        /* not important */
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
        "--cn-hue": teinteAmbiance([]),
        "--cn-lum": luminositeAmbiance([]),
      }) as CSSProperties,
    [],
  );

  return (
    <div className="cn-salle" style={style}>
      <div className="cn-ambiance" aria-hidden="true"><i /><i /></div>
      <nav className="cn-ruban" aria-label="Étapes de la conception">
        {ETAPES_CONCEPTION.map((nom, i) => {
          // The last three steps (screenplay, clap, progress) come after the project is created: visible, not yet reachable.
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

      <div className={`cn-scene${recule ? " is-recule" : ""}`} data-scene={etape === ETAPE.style ? "style" : undefined} data-ajuste={([ETAPE.accueil, ETAPE.duree, ETAPE.langue, ETAPE.musique] as number[]).includes(etape) ? "" : undefined} key={etape} ref={scene}>
        {etape === ETAPE.accueil ? (
          <SceneAccueil apercus={styles.filter((s) => s.apercu).map((s) => s.id)} action={<Glissiere geant libelle="Clique pour commencer" onValider={() => aller(ETAPE.duree)} />} />
        ) : null}
        {etape === ETAPE.duree ? <SceneDuree etat={etat} maj={maj} /> : null}
        {etape === ETAPE.langue ? <SceneLangue etat={etat} maj={maj} /> : null}
        {etape === ETAPE.style ? <SceneStyle etat={etat} maj={maj} styles={styles} /> : null}
        {etape === ETAPE.musique ? <SceneMusique etat={etat} maj={maj} /> : null}
      </div>

      <div className="cn-barre" role="group" aria-label="Avancer dans la conception">
        <button type="button" className="btn" disabled={etape === 0 || envoi} onClick={() => aller(etape - 1)}>← Retour</button>
        <span className="cn-barre-texte" aria-live="polite">
          {!peutContinuer ? (INVITES[etape] ?? "") : etape < DERNIERE_ETAPE ? <>Ensuite : <b>{ETAPES_CONCEPTION[etape + 1]}</b></> : <>Les choix sont faits : <b>le scénariste t’attend</b>.</>}
        </span>
        {erreur ? <span className="cn-erreur" role="alert">{erreur}</span> : null}
        {etape === 0 ? null : <Glissiere
          libelle={etape < DERNIERE_ETAPE ? "Clique pour continuer" : "Clique : rencontrer le scénariste"}
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
            <p>Une fois l’entretien commencé, <b className="cn-fige">ce cadre est posé</b> : durée, langue, style et musique ne changent plus que si tu le demandes au scénariste, qui te le fera confirmer.</p>
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
