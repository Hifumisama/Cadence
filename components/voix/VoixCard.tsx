"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { LIBELLE_ETAT_FICHE, type EtatFiche, type EtatPhases } from "@/lib/voix";
import { PhasesVoix } from "./PhasesVoix";
import { Icone } from "@/components/ui/Icone";

// Une seule référence joue à la fois dans la liste.
let carteActive: { stop: () => void } | null = null;

const CLASSE_ETAT: Record<EtatFiche, string> = { a_creer: "b-attente", a_valider: "b-rejoue", validee: "b-termine" };

/** Carte d'une fiche vocale : son nom, sa pastille d'état (libellé texte en plus de la couleur), sa langue, le personnage assigné
 * (lecture seule), le nombre de répliques, et en citation la réplique d'écoute — la « signature vocale ». ▶ écoute la voix de
 * référence sans quitter la liste. Le code de la voix n'apparaît pas. */
export function VoixCard({
  href,
  nom,
  etat,
  critique,
  langue,
  personnageNom,
  refText,
  referenceSrc,
  referenceFichier,
  phases,
  nbRepliques,
  nbRepliquesMesurees,
}: {
  href: string;
  nom: string;
  etat: EtatFiche;
  critique: boolean;
  /** Libellé français de la langue (« Français »). */
  langue: string;
  personnageNom: string | null;
  refText: string;
  referenceSrc: string | null;
  referenceFichier: string | null;
  phases: EtatPhases;
  nbRepliques: number;
  nbRepliquesMesurees: number;
}) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [joue, setJoue] = useState(false);
  const handle = useRef({
    stop: () => {
      const a = audioRef.current;
      if (a) {
        a.pause();
        a.currentTime = 0;
      }
      setJoue(false);
    },
  });

  const basculer = () => {
    const a = audioRef.current;
    if (!a) return;
    if (joue) {
      handle.current.stop();
      carteActive = null;
      return;
    }
    if (carteActive && carteActive !== handle.current) carteActive.stop();
    carteActive = handle.current;
    void a.play().then(() => setJoue(true)).catch(() => setJoue(false));
  };

  return (
    <article className={`voix-card${etat === "validee" ? " is-figee" : ""}`}>
      <div className="voix-card-hd">
        <h2 className="voix-card-nom">{nom}</h2>
        <span className={`badge ${CLASSE_ETAT[etat]}`}>
          <i />
          {LIBELLE_ETAT_FICHE[etat]}
        </span>
      </div>

      <p className="voix-card-meta tiny-note">
        <span>{langue}</span>
        <span aria-hidden="true">·</span>
        <span>{personnageNom ? `Personnage : ${personnageNom}` : "Voix directe, sans personnage"}</span>
        <span aria-hidden="true">·</span>
        <span className="num">
          {nbRepliques} réplique{nbRepliques > 1 ? "s" : ""}
          {nbRepliques > 0 ? `, ${nbRepliquesMesurees} mesurée${nbRepliquesMesurees > 1 ? "s" : ""}` : ""}
        </span>
        {critique ? <span className="crit-tag">Critique</span> : null}
      </p>

      <blockquote className={`voix-card-regle${refText.trim() ? "" : " is-vide"}`}>
        {refText.trim() ? `« ${refText.trim()} »` : "Réplique d'écoute à écrire."}
      </blockquote>

      <PhasesVoix phases={phases} />

      <div className="voix-card-ref">
        {referenceSrc ? (
          <>
            <button type="button" className="asset-card-play voix-card-play" onClick={basculer} aria-pressed={joue} aria-label={joue ? `Arrêter la voix de ${nom}` : `Écouter la voix de référence de ${nom}`}>
              {joue ? <Icone nom="arret" taille={16} /> : <Icone nom="lecture" taille={16} />}
            </button>
            <audio ref={audioRef} src={referenceSrc} preload="none" onEnded={() => setJoue(false)} />
          </>
        ) : (
          <span className="tiny-note">{referenceFichier ? "Référence introuvable" : "Pas de voix de référence"}</span>
        )}
        <span style={{ flex: 1 }} />
        <Link href={href} className="btn voix-card-ouvrir">
          Ouvrir la fiche
        </Link>
      </div>
    </article>
  );
}
