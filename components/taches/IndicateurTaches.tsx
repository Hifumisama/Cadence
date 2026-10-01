"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useTaches } from "@/components/taches/TachesProvider";
import { estActive, type GenreTache, type Tache } from "@/lib/taches";
import { urlMiniature } from "@/lib/miniatures";

/** Icône du header : ce qui se génère, ce qui est prêt, ce qui a échoué. Badge
 * or = nombre de tâches actives ; point écarlate = échecs non vus ; point or plein
 * = terminées non vues. Le panneau liste les tâches (voir lib/taches.ts) ; un clic
 * mène à l'asset (popup ouverte sur le résultat) ou au plan. */
export function IndicateurTaches() {
  const { taches, resume, panneauOuvert, setPanneauOuvert, marquerVuLocal, marquerToutVuLocal, annuler } = useTaches();
  const racine = useRef<HTMLDivElement>(null);

  // Échap ou clic hors du panneau le ferme.
  useEffect(() => {
    if (!panneauOuvert) return;
    const clavier = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPanneauOuvert(false);
    };
    const dehors = (e: MouseEvent) => {
      if (racine.current && !racine.current.contains(e.target as Node)) setPanneauOuvert(false);
    };
    document.addEventListener("keydown", clavier);
    document.addEventListener("mousedown", dehors);
    return () => {
      document.removeEventListener("keydown", clavier);
      document.removeEventListener("mousedown", dehors);
    };
  }, [panneauOuvert, setPanneauOuvert]);

  const actives = taches.filter(estActive);
  // Les annulations se rangent avec les échecs (même durée de vie : une journée),
  // mais sobrement : ce n'est pas une erreur.
  const echecs = taches.filter((x) => x.statut === "echoue" || x.statut === "annulee");
  const finies = taches.filter((x) => x.statut === "termine");
  const nonVus = resume.echecsNonVus + resume.terminesNonVus;

  const etat = [
    resume.actives > 0 ? `${resume.actives} génération${resume.actives > 1 ? "s" : ""} en cours ou en file` : null,
    resume.echecsNonVus > 0 ? `${resume.echecsNonVus} échec${resume.echecsNonVus > 1 ? "s" : ""} non vu${resume.echecsNonVus > 1 ? "s" : ""}` : null,
    resume.terminesNonVus > 0 ? `${resume.terminesNonVus} résultat${resume.terminesNonVus > 1 ? "s" : ""} prêt${resume.terminesNonVus > 1 ? "s" : ""}` : null,
  ].filter(Boolean);

  const ouvrir = (x: Tache) => {
    if (x.vuAt == null && x.statut !== "en_attente" && x.statut !== "en_cours") marquerVuLocal([x.cle]);
    setPanneauOuvert(false);
  };

  return (
    <div className="tq" ref={racine}>
      <button
        type="button"
        className="tq-btn"
        aria-expanded={panneauOuvert}
        aria-haspopup="dialog"
        aria-label={etat.length > 0 ? `Générations : ${etat.join(", ")}` : "Générations : rien en cours"}
        title="Générations"
        onClick={() => setPanneauOuvert(!panneauOuvert)}
      >
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="3" y="4" width="18" height="4" rx="1" />
          <rect x="3" y="10" width="18" height="4" rx="1" />
          <rect x="3" y="16" width="12" height="4" rx="1" />
        </svg>
        {resume.actives > 0 ? <span className="tq-badge num">{resume.actives}</span> : null}
        {resume.echecsNonVus > 0 ? <span className="tq-pt tq-pt-echec" aria-hidden="true" /> : resume.terminesNonVus > 0 ? <span className="tq-pt tq-pt-ok" aria-hidden="true" /> : null}
      </button>

      {panneauOuvert ? (
        <div className="tq-panneau" role="dialog" aria-label="Générations">
          <div className="tq-hd">
            <span className="tq-titre">Générations</span>
            {nonVus > 0 ? (
              <button type="button" className="tq-lien" onClick={marquerToutVuLocal}>
                Tout marquer comme vu
              </button>
            ) : null}
          </div>

          {taches.length === 0 ? <p className="tq-vide">Aucune génération pour l&rsquo;instant.</p> : null}

          {actives.length > 0 ? (
            <section aria-label="En cours et en file">
              <h3 className="tq-sec">En cours / en file</h3>
              <ul className="tq-liste">
                {actives.map((x) => (
                  <Entree key={x.cle} x={x} onOuvrir={() => ouvrir(x)} onAnnuler={() => annuler(x.cle)} />
                ))}
              </ul>
            </section>
          ) : null}

          {echecs.length > 0 ? (
            <section aria-label="Échecs et annulations">
              <h3 className="tq-sec">{echecs.some((x) => x.statut === "annulee") ? "Échecs et annulations" : "Échecs"}</h3>
              <ul className="tq-liste">
                {echecs.map((x) => (
                  <Entree key={x.cle} x={x} onOuvrir={() => ouvrir(x)} onIgnorer={x.vuAt == null ? () => marquerVuLocal([x.cle]) : undefined} />
                ))}
              </ul>
            </section>
          ) : null}
          {finies.length > 0 ? (
            <section aria-label="Terminées">
              <h3 className="tq-sec">Terminées</h3>
              <ul className="tq-liste">
                {finies.map((x) => (
                  <Entree key={x.cle} x={x} onOuvrir={() => ouvrir(x)} />
                ))}
              </ul>
            </section>
          ) : null}

        </div>
      ) : null}
    </div>
  );
}

const DERRIERE: Record<GenreTache, string> = { image: "une image", video: "une vidéo", llm: "un agent" };

function heure(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const auj = new Date();
  const hm = d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  return d.toDateString() === auj.toDateString() ? hm : `${d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" })} ${hm}`;
}

function Entree({ x, onOuvrir, onIgnorer, onAnnuler }: { x: Tache; onOuvrir: () => void; onIgnorer?: () => void; onAnnuler?: () => void }) {
  // Une tâche en cours coûte du temps de GPU : on demande confirmation avant de la
  // couper. Une tâche en attente s'annule d'un clic (rien n'est perdu).
  const [confirmer, setConfirmer] = useState(false);
  // L'aperçu en direct est déjà léger (écrasé à chaque étape) ; la vignette d'un
  // résultat passe par la miniature.
  const image = x.apercuSrc ?? (x.vignetteSrc ? urlMiniature(x.vignetteSrc, 96) : null);
  const nonVu = x.vuAt == null && (x.statut === "termine" || x.statut === "echoue");
  return (
    <li className={`tq-entree s-${x.statut}${nonVu ? " non-vu" : ""}`}>
      <Link href={x.href} className="tq-lien-entree" onClick={onOuvrir}>
        <span className="tq-vignette" aria-hidden="true">
          {image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={image} alt="" loading="lazy" decoding="async" />
          ) : (
            <span className="tq-genre">{x.genre === "video" ? "▶" : x.genre === "llm" ? "✦" : "▣"}</span>
          )}
        </span>
        <span className="tq-corps">
          <span className="tq-ligne">
            <span className="tq-nom num" title={x.libelle}>
              {x.libelle}
            </span>
            {nonVu ? <span className="tq-nonvu" title="Pas encore vu" /> : null}
          </span>
          {x.detail ? <span className="tq-detail">{x.detail}</span> : null}
          {x.statut === "en_cours" && x.annulationDemandee ? (
            <span className="tq-etat tq-annulation" role="status">
              Annulation demandée…
            </span>
          ) : null}
          {x.statut === "en_cours" && !x.annulationDemandee ? (
            x.genre === "llm" ? (
              // Un appel LLM n'a pas de maximum connu : un compteur de jetons, pas de pourcentage.
              <span className="tq-prog">
                <progress aria-label="Génération en cours" />
                <span className="num">{x.jetons != null && x.jetons > 0 ? `${x.jetons} jeton${x.jetons > 1 ? "s" : ""}` : "Démarrage…"}</span>
              </span>
            ) : x.progression ? (
              <span className="tq-prog">
                <progress value={x.progression.valeur} max={x.progression.max} aria-label="Progression" />
                <span className="num">
                  {x.progression.etape ? `${x.progression.etape} · ` : ""}
                  {x.progression.valeur}/{x.progression.max}
                </span>
              </span>
            ) : (
              <span className="tq-prog">
                <progress aria-label="En cours" />
                <span>Démarrage…</span>
              </span>
            )
          ) : null}
          {x.statut === "en_attente" ? (
            <span className="tq-etat">
              En file · n°{x.positionFile ?? "?"}
              {x.derriere ? ` · derrière ${DERRIERE[x.derriere]}` : ""}
            </span>
          ) : null}
          {x.statut === "termine" ? <span className="tq-etat">{x.genre === "llm" ? "Terminé" : "Prête"} · {heure(x.finishedAt)}</span> : null}
          {x.statut === "annulee" ? <span className="tq-etat">Annulée · {heure(x.finishedAt)}</span> : null}
          {x.statut === "echoue" ? (
            <span className="tq-etat tq-erreur" title={x.erreur ?? undefined}>
              {x.erreur ? x.erreur.slice(0, 90) : "Échec"} · {heure(x.finishedAt)}
            </span>
          ) : null}
        </span>
      </Link>
      {onIgnorer ? (
        <button type="button" className="tq-ignorer" onClick={onIgnorer}>
          Ignorer
        </button>
      ) : null}
      {onAnnuler && !x.annulationDemandee ? (
        confirmer ? (
          <span className="tq-confirm" role="group" aria-label="Confirmer l'annulation">
            <button type="button" className="tq-ignorer tq-annuler" onClick={() => { setConfirmer(false); onAnnuler(); }}>
              Oui, annuler
            </button>
            <button type="button" className="tq-ignorer" onClick={() => setConfirmer(false)}>
              Non
            </button>
          </span>
        ) : (
          <button
            type="button"
            className="tq-ignorer tq-annuler"
            onClick={() => (x.statut === "en_cours" ? setConfirmer(true) : onAnnuler())}
            title={x.statut === "en_cours" ? "Interrompre cette génération" : "Retirer de la file"}
          >
            Annuler
          </button>
        )
      ) : null}
    </li>
  );
}
