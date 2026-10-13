"use client";

import { createElement, useEffect, useRef, useState } from "react";

type Lecteur = { src: string; numero: number };

const fmt = (t: number) => {
  const m = Math.floor(t / 60);
  const r = Math.floor(t % 60);
  return `0${m}:${r < 10 ? "0" : ""}${r}`;
};

/** La comparaison A / B du lecteur : deux vidéos superposées, une poignée à glisser (bibliothèque `img-comparison-slider`, un web
 * component : chaque emplacement `slot="first"` / `slot="second"` accepte n'importe quel élément, vidéo comprise). Les deux vidéos
 * se lisent ensemble (une seule barre de lecture : même durée, même seed, c'est l'écart de prompt ou de seed qui se voit) ; le son
 * de B est coupé. La bibliothèque est chargée côté navigateur seulement (elle touche à `customElements`) : en attendant, on montre A. */
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
        // Repli : sans la bibliothèque on garde A seul (le lien « Quitter la comparaison » reste là).
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
        // Garde B calée sur A (la dérive d'un décodage à l'autre reste de quelques images).
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
