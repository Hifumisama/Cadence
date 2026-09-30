"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

export type MediaKind = "image" | "video" | "audio";
export type FichierEtat = "aucun" | "manquant" | "ok";

// Un seul média joue à la fois dans la grille : lancer une carte coupe la
// précédente (retour utilisateur 2026-09-29 : ▶ sur la carte, lecteur complet
// sur la page de détail).
let mediaActif: { stop: () => void } | null = null;

function formatDuree(secondes: number): string {
  const m = Math.floor(secondes / 60);
  const s = Math.round(secondes % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function AssetCard({
  href,
  code,
  type,
  description,
  critique,
  nbDerives,
  statut,
  fichier,
  kind,
  etat,
  src,
  actif = false,
  voix,
}: {
  href: string;
  code: string;
  type: string;
  description: string | null;
  critique: boolean;
  nbDerives: number;
  statut: string;
  fichier: string | null;
  kind: MediaKind;
  etat: FichierEtat;
  src: string | null;
  actif?: boolean;
  /** Personnage uniquement : sa voix au casting (calculée, lecture seule) —
   * `undefined` pour tout autre type, `null` = personnage sans voix. */
  voix?: { code: string } | null;
}) {
  const zoneRef = useRef<HTMLDivElement>(null);
  const mediaRef = useRef<HTMLVideoElement & HTMLAudioElement>(null);
  const [visible, setVisible] = useState(false);
  const [joue, setJoue] = useState(false);
  const [duree, setDuree] = useState<number | null>(null);

  const handle = useRef<{ stop: () => void }>({
    stop: () => {
      const m = mediaRef.current;
      if (!m) return;
      m.pause();
      m.currentTime = 0;
      setJoue(false);
    },
  });

  // Chargement paresseux : on ne demande le fichier (métadonnées vidéo) que
  // quand la carte entre dans le viewport.
  useEffect(() => {
    const el = zoneRef.current;
    if (!el || kind === "image") return;
    const obs = new IntersectionObserver(
      ([entree]) => {
        if (entree?.isIntersecting) {
          setVisible(true);
          obs.disconnect();
        }
      },
      { rootMargin: "200px" },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [kind]);

  useEffect(() => {
    const h = handle.current;
    return () => {
      if (mediaActif === h) mediaActif = null;
    };
  }, []);

  const fin = () => {
    setJoue(false);
    if (mediaActif === handle.current) mediaActif = null;
  };

  const basculer = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const m = mediaRef.current;
    if (!m) return;
    if (joue) {
      handle.current.stop();
      mediaActif = null;
      return;
    }
    if (mediaActif && mediaActif !== handle.current) mediaActif.stop();
    mediaActif = handle.current;
    void m.play().then(() => setJoue(true)).catch(() => setJoue(false));
  };

  const jouable = etat === "ok" && (kind === "video" || kind === "audio");

  return (
    <Link href={href} className={`asset-card${actif ? " is-actif" : ""}`}>
      <div ref={zoneRef} className={`asset-card-media${etat !== "ok" ? " is-vide" : ""}`}>
        {etat === "aucun" ? <span className="tiny-note">pas de fichier</span> : null}
        {etat === "manquant" ? (
          <span className="tiny-note" title={fichier ?? undefined}>
            introuvable
          </span>
        ) : null}

        {etat === "ok" && kind === "image" && src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt={fichier ?? code} loading="lazy" />
        ) : null}

        {etat === "ok" && kind === "video" ? (
          <video
            ref={mediaRef}
            src={src && visible ? `${src}#t=0.001` : undefined}
            preload="metadata"
            playsInline
            onLoadedMetadata={(e) => setDuree(e.currentTarget.duration)}
            onEnded={fin}
          />
        ) : null}

        {etat === "ok" && kind === "audio" ? (
          <>
            <span className="asset-card-note" aria-hidden="true">
              ♪
            </span>
            <audio
              ref={mediaRef}
              src={src && visible ? src : undefined}
              preload="metadata"
              onLoadedMetadata={(e) => setDuree(e.currentTarget.duration)}
              onEnded={fin}
            />
          </>
        ) : null}

        {critique ? <span className="asset-card-crit">◆ Critique</span> : null}

        {jouable ? (
          <button
            type="button"
            className="asset-card-play"
            onClick={basculer}
            aria-label={joue ? `Arrêter ${code}` : `Lire ${code}`}
          >
            {joue ? "■" : "▶"}
          </button>
        ) : null}
        {jouable && duree != null && Number.isFinite(duree) ? (
          <span className="asset-card-duree">{formatDuree(duree)}</span>
        ) : null}
      </div>

      <div className="asset-card-body">
        <span className="asset-code" title={description ?? undefined}>
          {code}
        </span>
        <div className="asset-card-meta">
          <span className="type-tag">{type}</span>
          <span className="subj-kids">
            {nbDerives > 0 ? `${nbDerives} dérivé${nbDerives > 1 ? "s" : ""}` : "aucun dér."}
          </span>
        </div>
        {voix !== undefined ? (
          <span className={`voix-chip${voix ? "" : " is-none"}`} title={voix ? "Voix au casting" : "Aucune voix au casting pour l'instant"}>
            <span aria-hidden="true">♪</span> {voix ? voix.code : "sans voix"}
          </span>
        ) : null}
        <span className={`badge ${statut === "valide" ? "b-termine" : statut === "en_cours" ? "b-rejoue" : "b-attente"}`}>
          <i />
          {statut === "valide" ? "Validé" : statut === "en_cours" ? "En cours" : "À produire"}
        </span>
      </div>
    </Link>
  );
}
