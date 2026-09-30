"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import type { EtatPhases } from "@/lib/voix";
import { PhasesVoix } from "./PhasesVoix";

// Une seule référence joue à la fois dans le catalogue.
let carteActive: { stop: () => void } | null = null;

const STATUT: Record<string, { t: string; cls: string }> = {
  valide: { t: "Figée", cls: "b-termine" },
  en_cours: { t: "En essais", cls: "b-rejoue" },
  a_produire: { t: "À concevoir", cls: "b-attente" },
};

/** Carte du catalogue : la voix se présente par sa description canonique.
 * ▶ écoute la voix de référence sans quitter le catalogue. */
export function VoixCard({
  href,
  code,
  statut,
  critique,
  description,
  personnageCode,
  referenceSrc,
  referenceFichier,
  phases,
  nbRepliques,
  nbRepliquesMesurees,
}: {
  href: string;
  code: string;
  statut: string;
  critique: boolean;
  description: string;
  personnageCode: string | null;
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
  const s = STATUT[statut] ?? STATUT.a_produire!;

  const basculer = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
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
    <Link href={href} className={`voix-card${statut === "valide" ? " is-figee" : ""}`}>
      <div className="voix-card-hd">
        <span className="asset-code num">{code}</span>
        {critique ? <span className="crit-tag">Critique</span> : null}
      </div>

      <p className={`voix-card-regle${description.trim() ? "" : " is-vide"}`}>
        {description.trim() || "Description du timbre à écrire."}
      </p>

      <div className="voix-card-ref">
        {referenceSrc ? (
          <>
            <button type="button" className="asset-card-play voix-card-play" onClick={basculer} aria-label={joue ? `Arrêter ${code}` : `Écouter la référence de ${code}`}>
              {joue ? "■" : "▶"}
            </button>
            <span className="tiny-note">référence</span>
            <audio ref={audioRef} src={referenceSrc} preload="none" onEnded={() => setJoue(false)} />
          </>
        ) : (
          <span className="tiny-note">{referenceFichier ? "référence introuvable" : "pas de référence"}</span>
        )}
        <span style={{ flex: 1 }} />
        {personnageCode ? <span className="type-tag">{personnageCode}</span> : null}
      </div>

      <PhasesVoix phases={phases} />

      <div className="voix-card-ft">
        <span className={`badge ${s.cls}`}>
          <i />
          {s.t}
        </span>
        <span className="subj-kids num">
          {nbRepliquesMesurees}/{nbRepliques} répl. mesurées
        </span>
      </div>
    </Link>
  );
}
