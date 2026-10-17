"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useAgents } from "@/components/agents/AgentsProvider";
import { BasculeNotifications } from "@/components/taches/BasculeNotifications";
import { useTaches } from "@/components/taches/TachesProvider";
import type { GenreTache, Tache } from "@/lib/taches";
import { urlMiniature } from "@/lib/miniatures";
import { LIBELLE_SERVEUR, type ServeursInjoignables } from "@/lib/serveurs-injoignables-types";
import { Icone } from "@/components/ui/Icone";

const pluriel = (n: number, un: string, plusieurs: string) => (n > 1 ? plusieurs : un);

/** Pastille du bandeau : elle dit l'état en toutes lettres (« 2 en cours », « 1 prête », « 1 échec »,
 * « ComfyUI injoignable »). Barre = avancement de la tâche en tête ; point or = résultats non vus ; point
 * écarlate = échecs non vus. Le panneau liste les tâches (voir lib/taches.ts) ; un clic mène à l'asset
 * (popup ouverte sur le résultat) ou au plan. Sous 560 px, le panneau devient une feuille qui monte du bas. */
export function IndicateurTaches() {
  const { taches, resume, serveurs, panneauOuvert, setPanneauOuvert, marquerVuLocal, marquerToutVuLocal, annuler, viderFile, retirer, viderListe } = useTaches();
  const [confirmerVidage, setConfirmerVidage] = useState(false);
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

  const enCours = taches.filter((x) => x.statut === "en_cours");
  const enFile = taches.filter((x) => x.statut === "en_attente");
  // Les annulations se rangent avec les échecs (même durée de vie : une journée),
  // mais sobrement : ce n'est pas une erreur.
  const echecs = taches.filter((x) => x.statut === "echoue" || x.statut === "annulee");
  const finies = taches.filter((x) => x.statut === "termine");
  const nonVus = resume.echecsNonVus + resume.terminesNonVus;

  const injoignables = (Object.keys(LIBELLE_SERVEUR) as (keyof ServeursInjoignables)[]).filter((k) => serveurs[k] != null);
  const etat = [
    injoignables.length > 0 ? `${injoignables.map((k) => LIBELLE_SERVEUR[k]).join(" et ")} injoignable` : null,
    resume.actives > 0 ? `${resume.actives} génération${resume.actives > 1 ? "s" : ""} en cours ou en file` : null,
    resume.echecsNonVus > 0 ? `${resume.echecsNonVus} échec${resume.echecsNonVus > 1 ? "s" : ""} non vu${resume.echecsNonVus > 1 ? "s" : ""}` : null,
    resume.terminesNonVus > 0 ? `${resume.terminesNonVus} résultat${resume.terminesNonVus > 1 ? "s" : ""} prêt${resume.terminesNonVus > 1 ? "s" : ""}` : null,
  ].filter(Boolean);

  // Ce que dit la pastille, par ordre d'urgence : serveur coupé, travail en cours, échec, résultat prêt.
  const progressionTete = enCours.find((x) => x.progression && x.progression.max > 0)?.progression ?? null;
  let variante = "";
  let libelle = "File vide";
  let nombre: number | null = null;
  if (injoignables.length > 0) {
    variante = " is-down";
    libelle = `${LIBELLE_SERVEUR[injoignables[0]!]} injoignable`;
  } else if (resume.enCours > 0) {
    variante = " is-run";
    libelle = `${resume.enCours} en cours`;
    nombre = resume.actives;
  } else if (resume.enFile > 0) {
    variante = " is-run";
    libelle = `${resume.enFile} en file`;
    nombre = resume.enFile;
  } else if (resume.echecsNonVus > 0) {
    variante = " is-ko";
    libelle = `${resume.echecsNonVus} ${pluriel(resume.echecsNonVus, "échec", "échecs")}`;
    nombre = resume.echecsNonVus;
  } else if (resume.terminesNonVus > 0) {
    variante = " is-ok";
    libelle = `${resume.terminesNonVus} ${pluriel(resume.terminesNonVus, "prête", "prêtes")}`;
    nombre = resume.terminesNonVus;
  }
  // Pendant le travail, un échec ou un résultat non vu reste signalé par un point.
  const point = resume.actives > 0 && injoignables.length === 0 ? (resume.echecsNonVus > 0 ? "ko" : resume.terminesNonVus > 0 ? "ok" : null) : null;

  const ouvrir = (x: Tache) => {
    if (x.vuAt == null && x.statut !== "en_attente" && x.statut !== "en_cours") marquerVuLocal([x.cle]);
    setPanneauOuvert(false);
  };

  return (
    <div className="tq" ref={racine}>
      <button
        type="button"
        className={`tq-btn${variante}`}
        aria-expanded={panneauOuvert}
        aria-haspopup="dialog"
        aria-label={etat.length > 0 ? `Générations : ${etat.join(", ")}` : "Générations : rien en cours"}
        title="Générations"
        onClick={() => setPanneauOuvert(!panneauOuvert)}
      >
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="3" y="4" width="18" height="4" rx="1" />
          <rect x="3" y="10" width="18" height="4" rx="1" />
          <rect x="3" y="16" width="12" height="4" rx="1" />
        </svg>
        <span className="tq-btn-txt">{libelle}</span>
        {nombre != null ? <span className="tq-btn-n num">{nombre}</span> : null}
        {progressionTete && variante === " is-run" ? (
          <span className="tq-btn-barre" aria-hidden="true">
            <span style={{ width: `${Math.min(100, (progressionTete.valeur / progressionTete.max) * 100)}%` }} />
          </span>
        ) : null}
        {point ? <span className={`tq-btn-pt is-${point}`} aria-hidden="true" /> : null}
        {variante === " is-ok" || variante === " is-ko" ? <span className={`tq-btn-pt is-${variante === " is-ok" ? "ok" : "ko"}`} aria-hidden="true" /> : null}
      </button>

      {panneauOuvert ? (
        <>
          <div className="tq-voile" onClick={() => setPanneauOuvert(false)} aria-hidden="true" />
          <div className="tq-panneau" role="dialog" aria-label="Générations">
            <span className="tq-poignee" aria-hidden="true" />
            <div className="tq-hd">
              <div className="tq-hd-ligne">
                <h2 className="tq-titre">Générations</h2>
                {nonVus > 0 ? (
                  <button type="button" className="tq-lien" onClick={marquerToutVuLocal}>
                    Tout marquer comme vu
                  </button>
                ) : null}
              </div>
              <ul className="tq-resume" aria-label="Résumé">
                <li className={resume.enCours > 0 ? "is-run" : ""}>
                  <b className="num">{resume.enCours}</b> en cours
                </li>
                <li>
                  <b className="num">{resume.enFile}</b> en file
                </li>
                {resume.terminesNonVus > 0 ? (
                  <li className="is-ok">
                    <b className="num">{resume.terminesNonVus}</b> à voir
                  </li>
                ) : null}
                {resume.echecsNonVus > 0 ? (
                  <li className="is-ko">
                    <b className="num">{resume.echecsNonVus}</b> {pluriel(resume.echecsNonVus, "échec", "échecs")}
                  </li>
                ) : null}
              </ul>
            </div>

            {injoignables.map((k) => (
              <p key={k} className="tq-alerte" role="alert">
                <span className="tq-alerte-pt" aria-hidden="true" />
                <span>
                  {LIBELLE_SERVEUR[k]} injoignable depuis {new Date(serveurs[k]!).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })} : les tâches
                  restent en attente{k === "llm" ? " (elles échoueront au bout de quelques minutes, à relancer ensuite)" : ""}.
                </span>
              </p>
            ))}

            <div className="tq-defile">
              {taches.length === 0 ? <p className="tq-vide">Aucune génération pour l&rsquo;instant.</p> : null}

              {enCours.length > 0 ? (
                <section aria-label="En cours">
                  <div className="tq-sec-ligne">
                    <h3 className="tq-sec">En cours</h3>
                  </div>
                  <ul className="tq-liste">
                    {enCours.map((x, i) => (
                      <Entree key={x.cle} x={x} rang={i} onOuvrir={() => ouvrir(x)} onAnnuler={() => annuler(x.cle)} />
                    ))}
                  </ul>
                </section>
              ) : null}

              {enFile.length > 0 ? (
                <section aria-label="En file">
                  <div className="tq-sec-ligne">
                    <h3 className="tq-sec">En file</h3>
                    {confirmerVidage ? (
                      <span className="tq-confirm-ligne" role="group" aria-label="Confirmer le vidage de la file">
                        <button
                          type="button"
                          className="tq-btn-oui"
                          onClick={() => {
                            setConfirmerVidage(false);
                            viderFile();
                          }}
                        >
                          Oui, retirer {resume.enFile}
                        </button>
                        <button type="button" className="tq-btn-non" onClick={() => setConfirmerVidage(false)}>
                          Non
                        </button>
                      </span>
                    ) : (
                      <button type="button" className="tq-lien tq-lien-discret" onClick={() => setConfirmerVidage(true)} title="Retirer tout ce qui attend ; ce qui tourne continue">
                        Vider la file ({resume.enFile})
                      </button>
                    )}
                  </div>
                  <ul className="tq-liste">
                    {enFile.map((x, i) => (
                      <Entree key={x.cle} x={x} rang={enCours.length + i} onOuvrir={() => ouvrir(x)} onAnnuler={() => annuler(x.cle)} />
                    ))}
                  </ul>
                </section>
              ) : null}

              {echecs.length > 0 ? (
                <section aria-label="Échecs et annulations">
                  <div className="tq-sec-ligne">
                    <h3 className="tq-sec">{echecs.some((x) => x.statut === "annulee") ? "Échecs et annulations" : "Échecs"}</h3>
                    <button type="button" className="tq-lien tq-lien-discret" onClick={() => viderListe("echecs")} title="Retirer ces tâches de la liste (rien n'est supprimé)">
                      Vider la liste
                    </button>
                  </div>
                  <ul className="tq-liste">
                    {echecs.map((x, i) => (
                      <Entree key={x.cle} x={x} rang={i} onOuvrir={() => ouvrir(x)} onRetirer={() => retirer([x.cle])} />
                    ))}
                  </ul>
                </section>
              ) : null}

              {finies.length > 0 ? (
                <details className="tq-pli" open={resume.terminesNonVus > 0}>
                  <summary>Terminées ({finies.length})</summary>
                  <div className="tq-sec-ligne tq-sec-ligne-pli">
                    <span />
                    <button type="button" className="tq-lien tq-lien-discret" onClick={() => viderListe("terminees")} title="Retirer ces tâches de la liste (rien n'est supprimé)">
                      Vider la liste
                    </button>
                  </div>
                  <ul className="tq-liste">
                    {finies.map((x, i) => (
                      <Entree key={x.cle} x={x} rang={i} onOuvrir={() => ouvrir(x)} onRetirer={() => retirer([x.cle])} />
                    ))}
                  </ul>
                </details>
              ) : null}
            </div>

            <div className="tq-pied">
              <BasculeNotifications />
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}

const DERRIERE: Record<GenreTache, string> = { image: "une image", video: "une vidéo", llm: "un agent" };
const GENRE_LIBELLE: Record<GenreTache, string> = { image: "Image", video: "Vidéo", llm: "Agent" };
const GENRE_ICONE: Record<GenreTache, "image" | "lecture" | "agent"> = { image: "image", video: "lecture", llm: "agent" };

function heure(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const auj = new Date();
  const hm = d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  return d.toDateString() === auj.toDateString() ? hm : `${d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" })} ${hm}`;
}

/** Avancement d'une tâche en cours : barre qui se déroule à l'apparition, étape qui change avec un fondu
 * (la clé de l'étape remonte le libellé), compteur à droite. Un appel LLM seul n'a pas de maximum connu :
 * barre indéterminée et compteur de jetons ; un LOT (plusieurs appels) a une vraie barre, « 3/12 ». */
function Avancement({ x }: { x: Tache }) {
  const p = x.progression;
  const jetons = x.jetons != null && x.jetons > 0 ? `${x.jetons} jeton${x.jetons > 1 ? "s" : ""}` : null;
  const determine = p != null && p.max > 0;
  const pct = determine ? Math.min(100, Math.max(0, (p.valeur / p.max) * 100)) : 0;
  const gauche = p?.etape ? p.etape : x.genre === "llm" ? (jetons ?? "Démarrage…") : p ? "En cours" : "Démarrage…";
  return (
    <span className="tq-avance">
      <span
        className={`tq-barre${determine ? "" : " is-indet"}`}
        role="progressbar"
        aria-label={x.genre === "llm" ? "Génération en cours" : "Progression"}
        aria-valuemin={determine ? 0 : undefined}
        aria-valuemax={determine ? p.max : undefined}
        aria-valuenow={determine ? p.valeur : undefined}
      >
        <span className="tq-barre-v" style={determine ? { width: `${pct}%` } : undefined} />
      </span>
      <span className="tq-etape-ligne">
        <span key={gauche} className="tq-etape">
          {gauche}
          {x.genre === "llm" && p?.etape && jetons ? ` · ${jetons}` : ""}
        </span>
        {determine ? (
          <span className="tq-compte num">
            {p.valeur}/{p.max}
          </span>
        ) : null}
      </span>
    </span>
  );
}

function Entree({ x, rang, onOuvrir, onRetirer, onAnnuler }: { x: Tache; rang: number; onOuvrir: () => void; onRetirer?: () => void; onAnnuler?: () => void }) {
  // Une tâche en cours coûte du temps de GPU : on demande confirmation avant de la
  // couper. Une tâche en attente s'annule d'un clic (rien n'est perdu).
  const [confirmer, setConfirmer] = useState(false);
  const { ouvrirAgent } = useAgents();
  // L'aperçu en direct est déjà léger (écrasé à chaque étape) ; la vignette d'un
  // résultat passe par la miniature.
  const image = x.apercuSrc ?? (x.vignetteSrc ? urlMiniature(x.vignetteSrc, 192) : null);
  const nonVu = x.vuAt == null && (x.statut === "termine" || x.statut === "echoue");
  const attente = x.statut === "en_attente";
  const enCours = x.statut === "en_cours";
  const sousTitre = [attente ? GENRE_LIBELLE[x.genre] : null, x.detail, attente && x.derriere ? `derrière ${DERRIERE[x.derriere]}` : null].filter(Boolean).join(" · ");
  const demandeConfirmation = enCours || x.cle.startsWith("creation:");
  const titreAnnuler = x.cle.startsWith("creation:")
    ? "Arrêter la préparation du projet (ce qui est déjà écrit reste)"
    : x.cle.startsWith("demande:")
      ? "Annuler cette itération (ce qui est déjà écrit reste)"
      : enCours
        ? "Interrompre cette génération"
        : "Retirer de la file";
  return (
    <li className={`tq-carte s-${x.statut}${enCours ? " is-grande" : ""}${nonVu ? " non-vu" : ""}`} style={{ ["--i" as string]: rang }}>
      <Link
        href={x.href}
        className="tq-lien-entree"
        onClick={(e) => {
          // Une tâche d'agent rouvre la popup sur sa conversation (à la bonne étape : la
          // popup suit l'étape du serveur), sans changer de page.
          if (x.genre === "llm" && x.conversationUuid) {
            e.preventDefault();
            ouvrirAgent({ conversationUuid: x.conversationUuid, projectId: x.projectId || undefined });
          }
          onOuvrir();
        }}
      >
        {attente ? (
          <span className="tq-rang num" aria-label={`Position ${x.positionFile ?? "inconnue"} dans la file`}>
            {x.positionFile ?? "?"}
          </span>
        ) : (
          <span className={`tq-vignette g-${x.genre}`} aria-hidden="true">
            {image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={image} alt="" loading="lazy" decoding="async" />
            ) : (
              <span className="tq-genre">
                <Icone nom={GENRE_ICONE[x.genre]} taille={enCours ? 22 : 18} />
              </span>
            )}
            <span className="tq-genre-puce">
              <Icone nom={GENRE_ICONE[x.genre]} taille={12} />
            </span>
          </span>
        )}
        <span className="tq-corps">
          <span className="tq-ligne">
            <span className="tq-nom" title={x.libelle}>
              {x.libelle}
            </span>
            {!attente ? (
              <span className={`tq-badge-etat b-${x.statut}`}>
                {enCours ? GENRE_LIBELLE[x.genre] : x.statut === "termine" ? (x.genre === "llm" ? "Terminé" : "Prête") : x.statut === "annulee" ? "Annulée" : "Échec"}
              </span>
            ) : null}
          </span>
          {sousTitre ? <span className="tq-detail">{sousTitre}</span> : null}
          {enCours && x.annulationDemandee ? (
            <span className="tq-etat tq-annulation" role="status">
              Annulation demandée…
            </span>
          ) : null}
          {enCours && !x.annulationDemandee ? <Avancement x={x} /> : null}
          {x.statut === "termine" ? <span className="tq-etat">{heure(x.finishedAt)}</span> : null}
          {x.statut === "annulee" ? <span className="tq-etat">{heure(x.finishedAt)}</span> : null}
          {x.statut === "echoue" ? (
            <span className="tq-etat tq-erreur" title={x.erreur ?? undefined}>
              {x.erreur ? x.erreur.slice(0, 240) : "Échec"} · {heure(x.finishedAt)}
            </span>
          ) : null}
        </span>
      </Link>
      <span className="tq-actions">
        {onRetirer ? (
          <button type="button" className="tq-x" onClick={onRetirer} aria-label={`Retirer ${x.libelle} de la liste`} title="Retirer de la liste">
            <Icone nom="fermer" taille={14} />
          </button>
        ) : null}
        {onAnnuler && !x.annulationDemandee && !confirmer ? (
          <button
            type="button"
            className="tq-x"
            onClick={() => (demandeConfirmation ? setConfirmer(true) : onAnnuler())}
            aria-label={`${titreAnnuler} : ${x.libelle}`}
            title={titreAnnuler}
          >
            <Icone nom="fermer" taille={14} />
          </button>
        ) : null}
      </span>
      {onAnnuler && !x.annulationDemandee && confirmer ? (
        <span className="tq-confirm-ligne tq-confirm-carte" role="group" aria-label="Confirmer l'annulation">
          <span>{x.cle.startsWith("creation:") ? "Arrêter la préparation ?" : "Couper cette génération ?"}</span>
          <button
            type="button"
            className="tq-btn-oui"
            onClick={() => {
              setConfirmer(false);
              onAnnuler();
            }}
          >
            Oui
          </button>
          <button type="button" className="tq-btn-non" onClick={() => setConfirmer(false)}>
            Non
          </button>
        </span>
      ) : null}
    </li>
  );
}
