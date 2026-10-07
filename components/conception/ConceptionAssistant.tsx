"use client";

import "./conception.css";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { creerProjetConcu } from "@/app/nouveau/actions";
import {
  CLE_SESSION,
  DERNIERE_ETAPE,
  ETAPES_ASSISTANT,
  etapeMax,
  etapeValide,
  etatInitial,
  lireEtatSauvegarde,
  resumeEtape,
  teinteAmbiance,
  versCharge,
  type EtatAssistant,
} from "@/lib/conception-ui";
import { SceneDuree, SceneFormat, SceneGenreTon, SceneLangue } from "./Scenes";
import { SceneStyle } from "./SceneStyle";
import type { MajEtat, StyleVue } from "./types";

/** La page de conception d'un projet : cinq scènes (format, genre et ton, durée, langue, style), un ruban de pellicule pour naviguer,
 * une lumière d'ambiance qui suit les choix. L'état vit ici et dans la session du navigateur (rien n'est créé tant qu'on n'a pas
 * rencontré le scénariste : abandonner ne laisse aucun projet). Au dernier pas, le projet est créé côté serveur (app/nouveau/actions.ts)
 * avec sa fiche d'entretien préremplie, puis l'entretien s'ouvre. Plan : docs/PLAN_CONCEPTION_PROJET.md. */
export function ConceptionAssistant({ styles }: { styles: StyleVue[] }) {
  const router = useRouter();
  const [etat, setEtat] = useState<EtatAssistant>(etatInitial);
  const [etape, setEtape] = useState(0);
  const [recule, setRecule] = useState(false);
  const [restaure, setRestaure] = useState(false);
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
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
        {ETAPES_ASSISTANT.map((nom, i) => {
          const resume = resumeEtape(i, etat, nomStyle);
          return (
            <button
              key={nom}
              type="button"
              className={`cn-cadre${resume && i !== etape ? " is-fait" : ""}`}
              aria-current={i === etape ? "step" : undefined}
              disabled={i > maxAtteignable}
              title={resume ? `${nom} : ${resume}` : nom}
              onClick={() => aller(i)}
            >
              <b>{String(i + 1).padStart(2, "0")} · {nom}</b>
              <span>{resume || "—"}</span>
            </button>
          );
        })}
      </nav>

      <div className={`cn-scene${recule ? " is-recule" : ""}`} key={etape} ref={scene}>
        {etape === 0 ? <SceneFormat etat={etat} maj={maj} /> : null}
        {etape === 1 ? <SceneGenreTon etat={etat} maj={maj} /> : null}
        {etape === 2 ? <SceneDuree etat={etat} maj={maj} /> : null}
        {etape === 3 ? <SceneLangue etat={etat} maj={maj} /> : null}
        {etape === 4 ? <SceneStyle etat={etat} maj={maj} styles={styles} /> : null}
      </div>

      <div className="cn-nav">
        <button type="button" className="btn" disabled={etape === 0 || envoi} onClick={() => aller(etape - 1)}>Retour</button>
        {etape < DERNIERE_ETAPE ? (
          <button type="button" className="btn btn-gold" disabled={!peutContinuer} onClick={() => aller(etape + 1)}>Continuer</button>
        ) : (
          <button type="button" className="btn btn-gold" disabled={!peutContinuer || envoi} onClick={() => void rencontrer()}>
            {envoi ? "Création…" : "Rencontrer le scénariste"}
          </button>
        )}
        {erreur ? <p className="cn-erreur" role="alert">{erreur}</p> : null}
        <span className="cn-astuce">← → pour naviguer</span>
      </div>
    </div>
  );
}
