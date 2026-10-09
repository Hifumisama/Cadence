"use client";

import "@/components/conception/conception.css";
import "./assistant.css";
import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Glissiere } from "@/components/conception/Glissiere";
import { RubanConception } from "@/components/conception/RubanConception";
import { enregistrerVoix } from "@/app/voix/actions";
import { ETAPES_VOIX, LIBELLE_ETAT_ETAPE, libelleEtapeVoix, type EtapeVoix, type EtatPhases, type SourceVoix } from "@/lib/voix";

type Navigation = {
  /** Aller à une scène (depuis l'intérieur d'une scène : « Créer la voix d'abord », « Revoir la source »…). */
  aller: (etape: EtapeVoix) => void;
  /** L'origine choisie à la scène 2 : la scène du timbre/de la source et celle de la référence s'y adaptent. */
  source: SourceVoix;
  choisirSource: (s: SourceVoix) => void;
  /** Teinte de la lumière d'ambiance (0 à 360) : les mots choisis pour orienter le timbre la déplacent. */
  teinte: number;
  setTeinte: (t: number) => void;
};

const Contexte = createContext<Navigation>({ aller: () => undefined, source: "design", choisirSource: () => undefined, teinte: 42, setTeinte: () => undefined });

/** Ce que les scènes ont besoin de l'assistant : naviguer, et l'origine de la voix. */
export const useAssistantVoix = () => useContext(Contexte);

/** Luminosité de l'ambiance par scène : plus vive au ressenti, plus discrète à l'identité. */
const LUMIERE: Record<EtapeVoix, number> = { identite: 0.4, origine: 0.5, voix: 0.55, reference: 0.6, ressenti: 0.8, repliques: 0.7 };

/** L'assistant d'une voix : un ruban de six scènes, UNE scène plein cadre à la fois, une barre du bas (retour, ce qu'il manque, la
 * glissière pour avancer). Aucun verrou : le ruban reste cliquable, la glissière ne se grise jamais — la barre dit seulement ce qui
 * manque. Les scènes (construites par la page serveur) restent TOUTES montées, masquées : une saisie en cours ne se perd pas en
 * changeant de scène. La scène courante s'écrit dans l'adresse (`?etape=`, sans recharger) ; une adresse rouverte sur une autre scène
 * (lien du bandeau de suivi) fait suivre l'assistant. Maquette : docs/maquettes/casting-assistant.html. */
export function AssistantVoix({
  projectId,
  assetId,
  nom,
  etapeInitiale,
  signal,
  sourceInitiale,
  teinteInitiale,
  phases,
  manques,
  scenes,
}: {
  projectId: number;
  assetId: number;
  nom: string;
  etapeInitiale: EtapeVoix;
  /** Change quand la page est rouverte sur une autre scène : l'assistant suit. */
  signal: string;
  sourceInitiale: SourceVoix;
  teinteInitiale: number;
  phases: EtatPhases;
  /** Ce qui manque pour que la scène soit faite (une phrase), par scène. */
  manques: Record<EtapeVoix, string | null>;
  scenes: Record<EtapeVoix, ReactNode>;
}) {
  const router = useRouter();
  const [courante, setCourante] = useState<EtapeVoix>(etapeInitiale);
  const [recule, setRecule] = useState(false);
  const [source, setSource] = useState<SourceVoix>(sourceInitiale);
  const [teinte, setTeinte] = useState(teinteInitiale);
  const courRef = useRef(courante);
  courRef.current = courante;

  const aller = useCallback((etape: EtapeVoix) => {
    const de = ETAPES_VOIX.findIndex((e) => e.cle === courRef.current);
    const vers = ETAPES_VOIX.findIndex((e) => e.cle === etape);
    if (vers < 0 || vers === de) return;
    setRecule(vers < de);
    setCourante(etape);
    try {
      const url = new URL(window.location.href);
      if (etape === "identite") url.searchParams.delete("etape");
      else url.searchParams.set("etape", etape);
      window.history.replaceState(window.history.state, "", url);
    } catch {
      // l'adresse n'est qu'un confort (lien partageable) : sans elle, la navigation marche quand même
    }
    window.scrollTo({ top: 0 });
  }, []);

  const dernierSignal = useRef(signal);
  useEffect(() => {
    if (dernierSignal.current === signal) return;
    dernierSignal.current = signal;
    aller(etapeInitiale);
  }, [signal, etapeInitiale, aller]);

  const choisirSource = useCallback(
    (s: SourceVoix) => {
      setSource(s);
      void enregistrerVoix(assetId, { source: s });
    },
    [assetId],
  );

  const index = ETAPES_VOIX.findIndex((e) => e.cle === courante);
  const suivante = ETAPES_VOIX[index + 1];
  const derniere = !suivante;
  const manque = manques[courante];
  const libelle = (cle: EtapeVoix) => libelleEtapeVoix(cle, source);

  const ambiance = useMemo(() => ({ "--cn-hue": teinte, "--cn-lum": LUMIERE[courante] }) as CSSProperties, [teinte, courante]);
  const contexte = useMemo<Navigation>(() => ({ aller, source, choisirSource, teinte, setTeinte }), [aller, source, choisirSource, teinte]);

  return (
    <Contexte.Provider value={contexte}>
      <div className="cn-salle" style={ambiance}>
        <div className="cn-ambiance" aria-hidden="true">
          <i />
          <i />
        </div>
        <RubanConception
          cadres={ETAPES_VOIX.map((e) => ({
            nom: libelle(e.cle),
            resume: e.cle === "identite" ? nom : LIBELLE_ETAT_ETAPE[phases[e.cle]],
            etat: e.cle === courante ? "courant" : phases[e.cle] === "on" ? "fait" : "actif",
            onClick: () => aller(e.cle),
          }))}
        />

        {ETAPES_VOIX.map((e) => (
          <section key={e.cle} id={`scene-${e.cle}`} className={`cn-scene${recule ? " is-recule" : ""}`} hidden={courante !== e.cle} aria-label={libelle(e.cle)}>
            {scenes[e.cle]}
          </section>
        ))}

        <div className="cn-barre" role="group" aria-label="Avancer dans la fiche de la voix">
          <button type="button" className="btn" disabled={index <= 0} onClick={() => aller(ETAPES_VOIX[index - 1]!.cle)}>
            ← Retour
          </button>
          <span className="cn-barre-texte" aria-live="polite">
            {manque ? manque : derniere ? <>Les répliques sont <b>au casting</b> : tu peux revenir à la salle d&rsquo;écoute.</> : <>Ensuite : <b>{libelle(suivante.cle)}</b></>}
          </span>
          <Glissiere
            libelle={derniere ? "Glisse : retour à la salle d'écoute" : "Glisse pour continuer"}
            action={derniere}
            onValider={derniere ? () => router.push(`/p/${projectId}/voix`) : () => aller(suivante.cle)}
          />
        </div>
      </div>
    </Contexte.Provider>
  );
}
