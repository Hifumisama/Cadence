"use client";

import "./assets.css";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { urlMiniature } from "@/lib/thumbnails";
import { Icone } from "@/components/ui/Icon";
import { LIBELLE_STATUT, LIBELLE_TYPE_ASSET, type LigneRegistre } from "@/lib/assets/registry-types";

export type { FichierEtat, MediaKind } from "@/lib/assets/registry-types";

// Only one media plays at a time in the grid: starting one card stops the previous one.
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
  /** An asset is checked. */
  choisi: boolean;
  /** Just entered the selection: the ripple fades and the check snaps in. */
  vient: boolean;
  onActiver: (e: React.MouseEvent<HTMLAnchorElement>, code: string) => void;
};

/** Registry card: a 16:9 thumbnail (the full image, never cropped), the status as a badge on the image, the
 * code below. Stays a link (a click opens the sheet); the long press, handled by the registry, selects it. */
export function AssetCard({ ligne, href, choisi, vient, onActiver }: PropsCommunes) {
  const { code, libelle, type, statut, critique, description, nbPlans, kind, etat, src, fichier } = ligne;
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

  // Lazy loading: the file (video or audio metadata) is only requested when the card enters the screen.
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
      aria-label={`${libelle}, ${LIBELLE_TYPE_ASSET[type] ?? type}, ${LIBELLE_STATUT[statut]}${choisi ? ", sélectionné" : ""}`}
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
        <span className="as-coche" role="checkbox" aria-checked={choisi} aria-label={`Sélectionner ${libelle}`} title="Sélectionner (Maj+clic : une plage)">
          <Icone nom="valide" taille={15} strokeWidth={3} />
        </span>
        {critique ? <span className="as-crit">Critique</span> : null}
        {jouable ? (
          <button type="button" className="as-jouer" onClick={basculer} aria-label={joue ? `Arrêter ${libelle}` : `Lire ${libelle}`}>
            <Icone nom={joue ? "arret" : "lecture"} taille={13} />
          </button>
        ) : null}
        {jouable && duree != null && Number.isFinite(duree) ? <span className="as-duree">{formatDuree(duree)}</span> : null}
      </div>

      <div className="as-meta">
        <span className="as-code" title={`${code}${description ? ` — ${description}` : ""}`}>
          {libelle}
        </span>
        <span className="as-sous">
          {LIBELLE_TYPE_ASSET[type] ?? type} · {libellePlans(nbPlans)}
        </span>
      </div>
      <span className="as-onde" aria-hidden="true" />
    </Link>
  );
}

/** A row of the list view: same information, denser, and the same selection. */
export function LigneAsset({ ligne, href, choisi, vient, onActiver }: PropsCommunes) {
  const { code, libelle, type, statut, critique, description, nbPlans, etat, src, kind } = ligne;
  return (
    <Link
      href={href}
      data-code={code}
      draggable={false}
      className={`as-ligne${choisi ? " is-choisi" : ""}${vient ? " is-vient" : ""}`}
      onClick={(e) => onActiver(e, code)}
    >
      <span className="as-coche" role="checkbox" aria-checked={choisi} aria-label={`Sélectionner ${libelle}`}>
        <Icone nom="valide" taille={15} strokeWidth={3} />
      </span>
      <span className={`as-mini${etat === "ok" && kind === "image" && src ? "" : " is-vide"}`}>
        {etat === "ok" && kind === "image" && src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={urlMiniature(src, 96)} alt="" loading="lazy" decoding="async" draggable={false} />
        ) : null}
      </span>
      <span className="as-code" title={`${code}${description ? ` — ${description}` : ""}`}>
        {libelle}
        {critique ? <span className="as-crit-mot">Critique</span> : null}
      </span>
      <span className="as-cache-s">{LIBELLE_TYPE_ASSET[type] ?? type}</span>
      <span className={`as-st is-${statut}`}>
        <i />
        {LIBELLE_STATUT[statut]}
      </span>
      <span className="num as-cache-s">{libellePlans(nbPlans)}</span>
      <span className="as-onde" aria-hidden="true" />
    </Link>
  );
}
