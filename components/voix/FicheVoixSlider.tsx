"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { ETAPES_VOIX, LIBELLE_ETAT_ETAPE, type EtapeVoix, type EtatEtape } from "@/lib/voix";

type Navigation = { aller: (etape: EtapeVoix, options?: { focus?: "panneau" | "action" }) => void };

const NavigationEtapes = createContext<Navigation>({ aller: () => undefined });

/** Aller à une étape de la fiche depuis l'intérieur d'une étape (« Changer la voix de référence », « Créer la voix d'abord »). */
export const useEtapesVoix = () => useContext(NavigationEtapes);

export type EtapeResume = { cle: EtapeVoix; etat: EtatEtape; detail?: string };

/** La fiche vocale en quatre étapes, UNE à la fois : un stepper cliquable en haut, un panneau, Précédent / Suivant en bas. Aucun verrou :
 * toute étape est accessible. La fiche s'ouvre sur l'étape 1 sauf `?etape=` explicite ; l'étape courante est ensuite écrite dans
 * l'adresse (sans recharger). Le glissement (72 px, 0,38 s) ne joue qu'à un changement d'étape voulu, jamais à une mise à jour des
 * données ; il est coupé par prefers-reduced-motion (globals.css). Tous les panneaux restent montés (masqués) : un formulaire en
 * cours de saisie ne se perd pas en changeant d'étape. */
export function FicheVoixSlider({
  etapes,
  initiale,
  signal,
  panneaux,
}: {
  etapes: EtapeResume[];
  initiale: EtapeVoix;
  /** Change quand la page est rouverte sur une autre étape (lien du bandeau de suivi) : le slider suit. */
  signal: string;
  panneaux: Record<EtapeVoix, ReactNode>;
}) {
  const [courante, setCourante] = useState<EtapeVoix>(initiale);
  const [anim, setAnim] = useState<"" | "r" | "l">("");
  const enTete = useRef<HTMLDivElement>(null);
  const courRef = useRef(courante);
  courRef.current = courante;

  const aller = useCallback((etape: EtapeVoix, options?: { focus?: "panneau" | "action" }) => {
    const de = ETAPES_VOIX.findIndex((e) => e.cle === courRef.current);
    const vers = ETAPES_VOIX.findIndex((e) => e.cle === etape);
    if (vers < 0 || vers === de) return;
    setAnim(vers > de ? "r" : "l");
    setCourante(etape);
    try {
      const url = new URL(window.location.href);
      if (etape === "fiche") url.searchParams.delete("etape");
      else url.searchParams.set("etape", etape);
      window.history.replaceState(window.history.state, "", url);
    } catch {
      // l'adresse n'est qu'un confort (lien partageable) : sans elle, la navigation marche quand même
    }
    if (options?.focus) {
      requestAnimationFrame(() => {
        const panneau = document.getElementById(`pan-${etape}`);
        panneau?.scrollIntoView({ block: "start", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
        const cible = options.focus === "action" ? panneau?.querySelector<HTMLElement>("[data-focus-etape]:not(:disabled)") : null;
        (cible ?? panneau)?.focus({ preventScroll: true });
      });
    }
  }, []);

  // Page rouverte sur une autre étape (lien du bandeau de suivi, ?etape=…) : on suit.
  const dernierSignal = useRef(signal);
  useEffect(() => {
    if (dernierSignal.current === signal) return;
    dernierSignal.current = signal;
    aller(initiale);
  }, [signal, initiale, aller]);

  const index = ETAPES_VOIX.findIndex((e) => e.cle === courante);
  const surClavier = (e: KeyboardEvent<HTMLDivElement>) => {
    const cibles: Record<string, number> = { ArrowRight: index + 1, ArrowLeft: index - 1, Home: 0, End: ETAPES_VOIX.length - 1 };
    const vers = cibles[e.key];
    if (vers == null) return;
    e.preventDefault();
    const cible = ETAPES_VOIX[Math.max(0, Math.min(ETAPES_VOIX.length - 1, vers))]!;
    aller(cible.cle);
    document.getElementById(`tab-${cible.cle}`)?.focus();
  };

  return (
    <NavigationEtapes.Provider value={{ aller }}>
      <div className="fiche-slider" ref={enTete}>
        <div className="stepper-voix" role="tablist" aria-label="Étapes de la fiche" onKeyDown={surClavier}>
          {ETAPES_VOIX.map((e, i) => {
            const r = etapes.find((x) => x.cle === e.cle);
            const etat = r?.etat ?? "vide";
            const actif = courante === e.cle;
            return (
              <button
                key={e.cle}
                type="button"
                role="tab"
                id={`tab-${e.cle}`}
                aria-selected={actif}
                aria-controls={`pan-${e.cle}`}
                tabIndex={actif ? 0 : -1}
                className={`stp-voix ph-${etat}${actif ? " is-actif" : ""}`}
                onClick={() => aller(e.cle)}
              >
                <span className="dot" aria-hidden="true">
                  {etat === "on" ? (
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M5 12.5l4.5 4.5L19 7" />
                    </svg>
                  ) : (
                    i + 1
                  )}
                </span>
                <span className="tt">{e.label}</span>
                <span className="etat">
                  {LIBELLE_ETAT_ETAPE[etat]}
                  {r?.detail ? ` · ${r.detail}` : ""}
                </span>
              </button>
            );
          })}
        </div>

        <div className="slides-voix">
          {ETAPES_VOIX.map((e, i) => {
            const actif = courante === e.cle;
            return (
              <section
                key={e.cle}
                id={`pan-${e.cle}`}
                role="tabpanel"
                aria-labelledby={`tab-${e.cle}`}
                tabIndex={-1}
                hidden={!actif}
                className={`slide-voix${actif && anim ? ` in-${anim}` : ""}`}
                onAnimationEnd={() => setAnim("")}
              >
                <h2 className="slide-voix-titre">
                  <span className="num">{i + 1}</span> · {e.label}
                </h2>
                {panneaux[e.cle]}
              </section>
            );
          })}
        </div>

        <div className="foot-voix">
          <button
            type="button"
            className="btn"
            disabled={index <= 0}
            onClick={() => aller(ETAPES_VOIX[index - 1]!.cle, { focus: "panneau" })}
          >
            ← Précédent{index > 0 ? ` · ${ETAPES_VOIX[index - 1]!.label}` : ""}
          </button>
          <button
            type="button"
            className="btn btn-gold"
            disabled={index >= ETAPES_VOIX.length - 1}
            onClick={() => aller(ETAPES_VOIX[index + 1]!.cle, { focus: "panneau" })}
          >
            {index < ETAPES_VOIX.length - 1 ? `Suivant · ${ETAPES_VOIX[index + 1]!.label} →` : "Dernière étape"}
          </button>
        </div>
      </div>
    </NavigationEtapes.Provider>
  );
}
