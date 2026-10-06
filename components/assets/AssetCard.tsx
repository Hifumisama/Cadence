"use client";

import "./assets.css";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { urlMiniature } from "@/lib/miniatures";
import { Icone } from "@/components/ui/Icone";
import { LIBELLE_STATUT, LIBELLE_TYPE_ASSET, type LigneRegistre } from "@/lib/registre-types";

export type { FichierEtat, MediaKind } from "@/lib/registre-types";

// Un seul média joue à la fois dans la grille : lancer une carte coupe la précédente.
let mediaActif: { stop: () => void } | null = null;

function formatDuree(secondes: number): string {
  const m = Math.floor(secondes / 60);
  const s = Math.round(secondes % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

const libellePlans = (n: number) => `${n} plan${n > 1 ? "s" : ""}`;

type PropsCommunes = {
  ligne: LigneRegistre;
  href: string;
  /** Un asset est coché. */
  choisi: boolean;
  /** Arrivée dans la sélection à l'instant : l'onde se dissipe et la coche claque. */
  vient: boolean;
  onActiver: (e: React.MouseEvent<HTMLAnchorElement>, code: string) => void;
};

/** Carte du registre : une vignette 16:9 (l'image entière, jamais recadrée), le statut en pastille sur l'image, le
 * code en dessous. Reste un lien (un clic ouvre la fiche) ; le clic long, géré par le registre, la sélectionne. */
export function AssetCard({ ligne, href, choisi, vient, onActiver }: PropsCommunes) {
  const { code, type, statut, critique, description, nbPlans, voix, kind, etat, src, fichier } = ligne;
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

  // Chargement paresseux : on ne demande le fichier (métadonnées vidéo ou audio) que quand la carte entre dans l'écran.
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
    <Link
      href={href}
      data-code={code}
      draggable={false}
      className={`as-carte${choisi ? " is-choisi" : ""}${vient ? " is-vient" : ""}`}
      aria-label={`${code}, ${LIBELLE_TYPE_ASSET[type] ?? type}, ${LIBELLE_STATUT[statut]}${choisi ? ", sélectionné" : ""}`}
      onClick={(e) => onActiver(e, code)}
    >
      <div ref={zoneRef} className={`as-vis${etat !== "ok" ? " is-vide" : ""}`}>
        {etat === "aucun" ? (
          <span className="as-vide-ico">
            <Icone nom={kind === "audio" ? "musique" : "image"} taille={24} />
            {kind === "audio" ? "Pas de son" : "Pas d'image"}
          </span>
        ) : null}
        {etat === "manquant" ? (
          <span className="as-vide-ico" title={fichier ?? undefined}>
            <Icone nom="alerte" taille={24} />
            Fichier introuvable
          </span>
        ) : null}

        {etat === "ok" && kind === "image" && src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={urlMiniature(src, 384)} alt="" loading="lazy" decoding="async" draggable={false} />
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
            <span className="as-note-audio" aria-hidden="true">
              <Icone nom="musique" taille={32} />
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

        <span className={`as-st is-${statut}`}>
          <i />
          {LIBELLE_STATUT[statut]}
        </span>
        {voix !== undefined ? (
          <span className={`as-voix-pastille${voix ? "" : " is-sans"}`} title={voix ? `Voix : ${voix.code}` : "Sans voix au casting"}>
            <Icone nom="musique" taille={14} />
          </span>
        ) : null}
        <span className="as-coche" aria-hidden="true">
          <Icone nom="valide" taille={15} strokeWidth={3} />
        </span>
        {critique ? <span className="as-crit">Critique</span> : null}
        {jouable ? (
          <button type="button" className="as-jouer" onClick={basculer} aria-label={joue ? `Arrêter ${code}` : `Lire ${code}`}>
            <Icone nom={joue ? "arret" : "lecture"} taille={13} />
          </button>
        ) : null}
        {jouable && duree != null && Number.isFinite(duree) ? <span className="as-duree">{formatDuree(duree)}</span> : null}
      </div>

      <div className="as-meta">
        <span className="as-code" title={description ?? undefined}>
          {code}
        </span>
        <span className="as-sous">
          {LIBELLE_TYPE_ASSET[type] ?? type} · {libellePlans(nbPlans)}
        </span>
      </div>
      <span className="as-onde" aria-hidden="true" />
    </Link>
  );
}

/** Une ligne de la vue liste : mêmes informations, plus denses, et la même sélection. */
export function LigneAsset({ ligne, href, choisi, vient, onActiver, modeSelection }: PropsCommunes & { modeSelection: boolean }) {
  const { code, type, statut, critique, description, nbPlans, voix, etat, src, kind } = ligne;
  return (
    <Link
      href={href}
      data-code={code}
      draggable={false}
      className={`as-ligne${choisi ? " is-choisi" : ""}${vient ? " is-vient" : ""}`}
      onClick={(e) => onActiver(e, code)}
    >
      {modeSelection ? (
        <span className="as-coche" aria-hidden="true">
          <Icone nom="valide" taille={15} strokeWidth={3} />
        </span>
      ) : null}
      <span className={`as-mini${etat === "ok" && kind === "image" && src ? "" : " is-vide"}`}>
        {etat === "ok" && kind === "image" && src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={urlMiniature(src, 96)} alt="" loading="lazy" decoding="async" draggable={false} />
        ) : null}
      </span>
      <span className="as-code" title={description ?? undefined}>
        {code}
        {critique ? <span className="as-crit-mot">Critique</span> : null}
      </span>
      <span className="as-cache-s">{LIBELLE_TYPE_ASSET[type] ?? type}</span>
      <span className={`as-st is-${statut}`}>
        <i />
        {LIBELLE_STATUT[statut]}
      </span>
      <span className="num as-cache-s">{libellePlans(nbPlans)}</span>
      <span className="as-cache-s" style={{ color: voix ? "var(--or-glow)" : "var(--ink-4)" }}>
        {voix !== undefined ? <Icone nom="musique" taille={14} /> : null}
      </span>
      <span className="as-onde" aria-hidden="true" />
    </Link>
  );
}
