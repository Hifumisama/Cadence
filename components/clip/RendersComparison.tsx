"use client";

import { createElement, useEffect, useRef, useState } from "react";

type Lecteur = { src: string; numero: number };

const fmt = (t: number) => {
  const m = Math.floor(t / 60);
  const r = Math.floor(t % 60);
  return `0${m}:${r < 10 ? "0" : ""}${r}`;
};

/** The player's A / B comparison: two superimposed videos, a handle to drag (`img-comparison-slider` library, a web
 * component: each `slot="first"` / `slot="second"` location accepts any element, video included). Both videos
 * play together (a single playback bar: same duration, same seed, it is the prompt or seed gap that shows); B's
 * sound is cut. The library is loaded browser-side only (it touches `customElements`): in the meantime, we show A. */
export function ComparaisonRendus({ a, b }: { a: Lecteur; b: Lecteur }) {
  const va = useRef<HTMLVideoElement>(null);
  const vb = useRef<HTMLVideoElement>(null);
  const [pret, setPret] = useState(false);
  const [enLecture, setEnLecture] = useState(false);
  const [t, setT] = useState(0);
  const [duree, setDuree] = useState(0);

  useEffect(() => {
    let annule = false;
    import("img-comparison-slider")
      .then(() => {
        if (!annule) setPret(true);
      })
      .catch(() => {
        // Fallback: without the library we keep A alone (the « Quitter la comparaison » link stays there).
      });
    return () => {
      annule = true;
    };
  }, []);

  const videos = () => [va.current, vb.current].filter((v): v is HTMLVideoElement => v != null);

  const basculer = () => {
    if (enLecture) {
      videos().forEach((v) => v.pause());
      setEnLecture(false);
      return;
    }
    const fin = va.current ? va.current.ended : false;
    videos().forEach((v) => {
      if (fin) v.currentTime = 0;
      void v.play();
    });
    setEnLecture(true);
  };

  const aller = (valeur: number) => {
    videos().forEach((v) => {
      v.currentTime = valeur;
    });
    setT(valeur);
  };

  const videoA = (
    <video
      key={`a-${a.src}`}
      ref={va}
      slot="first"
      src={a.src}
      playsInline
      preload="auto"
      onLoadedMetadata={(e) => setDuree(e.currentTarget.duration || 0)}
      onTimeUpdate={(e) => {
        const cur = e.currentTarget.currentTime;
        setT(cur);
        // Keep B locked to A (drift between one decode and another stays within a few frames).
        if (vb.current && Math.abs(vb.current.currentTime - cur) > 0.15) vb.current.currentTime = cur;
      }}
      onEnded={() => setEnLecture(false)}
    />
  );
  const videoB = <video key={`b-${b.src}`} ref={vb} slot="second" src={b.src} muted playsInline preload="auto" />;

  return (
    <div className="tm-cmp">
      <div className="tm-cmp-scene">
        {pret ? createElement("img-comparison-slider", { class: "tm-slider" }, videoA, videoB) : <div className="tm-slider-attente">{videoA}</div>}
        <span className="tm-lab tm-lab-a num">A · n°{a.numero}</span>
        <span className="tm-lab tm-lab-b num">B · n°{b.numero}</span>
      </div>
      <div className="tm-cmp-barre">
        <button type="button" className="tm-lire" onClick={basculer} aria-label={enLecture ? "Pause" : "Lire les deux"}>
          {enLecture ? "❚❚" : "▶"}
        </button>
        <input type="range" min={0} max={duree || 1} step={0.04} value={Math.min(t, duree || 1)} onChange={(e) => aller(Number(e.target.value))} aria-label="Position de lecture" />
        <span className="num tm-tc">
          {fmt(t)} / {fmt(duree)}
        </span>
      </div>
    </div>
  );
}
