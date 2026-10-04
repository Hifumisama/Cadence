"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { couverture, dureeCarton, dureeTotale, largeurs, minutes, precedent, suivant, type SegmentLu } from "@/lib/lecture-episode";

/** Lecture de l'épisode bout à bout : le dernier rendu terminé de chaque plan, joué l'un derrière l'autre dans l'ordre de
 * montage, sous une frise cliquable (largeur = durée du plan). Un plan sans rendu n'interrompt pas la lecture : un carton
 * « pas de rendu » tient sa place quelques secondes. Sert à juger le rythme et les raccords du tout, avant l'assemblage. */
export function LectureEpisode({ segments }: { segments: SegmentLu[] }) {
  const [index, setIndex] = useState(0);
  const [lecture, setLecture] = useState(false);
  const video = useRef<HTMLVideoElement>(null);
  const courant = segments[index];
  const parts = useMemo(() => largeurs(segments), [segments]);
  const { avecRendu, total } = couverture(segments);
  const debuts = useMemo(() => {
    let t = 0;
    return segments.map((s) => {
      const d = t;
      t += Math.max(1, s.dureeSecondes);
      return d;
    });
  }, [segments]);

  const aller = useCallback((i: number | null, jouer = true) => {
    if (i == null) {
      setLecture(false);
      return;
    }
    setIndex(i);
    setLecture(jouer);
  }, []);

  // Une vidéo : on la lance ; un carton : on le garde le temps voulu, puis on passe au suivant.
  useEffect(() => {
    if (!lecture || !courant) return;
    if (courant.src) {
      const v = video.current;
      if (v) {
        v.currentTime = 0;
        void v.play().catch(() => setLecture(false));
      }
      return;
    }
    const t = setTimeout(() => aller(suivant(segments, index)), dureeCarton(courant) * 1000);
    return () => clearTimeout(t);
  }, [lecture, index, courant, segments, aller]);

  // Pause : la vidéo en cours s'arrête.
  useEffect(() => {
    if (!lecture) video.current?.pause();
  }, [lecture]);

  if (segments.length === 0) return null;

  return (
    <section className="panel lecture-episode" aria-label="Lecture de l'épisode">
      <div className="panel-hd">
        <h2>Lecture de l&rsquo;épisode</h2>
        <span className="eyebrow num">
          {avecRendu} / {total} plans avec un rendu · {minutes(dureeTotale(segments))}
        </span>
      </div>
      <div className="panel-bd" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div className="lecture-ecran">
          {courant?.src ? (
            <video ref={video} key={courant.uuid} src={courant.src} playsInline preload="auto" onEnded={() => aller(suivant(segments, index))} onClick={() => setLecture((l) => !l)} />
          ) : (
            <div className="lecture-carton" role="img" aria-label={`Plan ${courant?.position} : pas de rendu`}>
              <span className="num">{String(courant?.position ?? 0).padStart(2, "0")}</span>
              <span>Pas de rendu pour ce plan</span>
            </div>
          )}
        </div>
        <div className="gd-row gd-row-between">
          <span className="lecture-titre">
            <span className="num">{String(courant?.position ?? 0).padStart(2, "0")}</span> · {courant?.titre}
            <span className="tiny-note num"> {minutes(debuts[index] ?? 0)} / {minutes(dureeTotale(segments))}</span>
          </span>
          <span className="gd-row">
            <button type="button" className="btn btn-ghost btn-mini" onClick={() => aller(precedent(index))} disabled={index === 0} aria-label="Plan précédent">
              ‹
            </button>
            <button type="button" className="btn btn-gold btn-mini" onClick={() => setLecture((l) => !l)} aria-pressed={lecture}>
              {lecture ? "Pause" : index === 0 ? "Lire l'épisode" : "Lire"}
            </button>
            <button type="button" className="btn btn-ghost btn-mini" onClick={() => aller(suivant(segments, index), lecture)} disabled={suivant(segments, index) == null} aria-label="Plan suivant">
              ›
            </button>
          </span>
        </div>
        <ol className="lecture-frise" aria-label="Plans de l'épisode">
          {segments.map((s, i) => (
            <li key={s.uuid} style={{ width: `${parts[i]}%` }}>
              <button
                type="button"
                className={`lecture-seg${i === index ? " is-actif" : ""}${s.src ? "" : " is-vide"}`}
                onClick={() => aller(i)}
                title={`${String(s.position).padStart(2, "0")} · ${s.titre}${s.src ? "" : " (pas de rendu)"}`}
                aria-label={`Plan ${s.position} : ${s.titre}${s.src ? "" : ", pas de rendu"}`}
                aria-current={i === index ? "true" : undefined}
              >
                <span className="num">{String(s.position).padStart(2, "0")}</span>
              </button>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
