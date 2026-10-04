"use client";

import Link from "next/link";
import { useRef, useState } from "react";

type Lecteur = { src: string; titre: string };

/** Le lecteur du plan : un rendu, ou deux côte à côte pour les comparer. « Lire les deux » les démarre ensemble depuis le début
 * (même durée, même seed : c'est l'écart de prompt ou de seed qui se voit). */
export function LecteursRendus({ principal, comparaison, hrefSansComparaison }: { principal: Lecteur; comparaison: Lecteur | null; hrefSansComparaison: string }) {
  const a = useRef<HTMLVideoElement>(null);
  const b = useRef<HTMLVideoElement>(null);
  const [enLecture, setEnLecture] = useState(false);

  if (!comparaison) {
    return <video key={principal.src} controls style={{ width: "100%", height: "100%" }} src={principal.src} />;
  }

  const basculer = () => {
    const videos = [a.current, b.current].filter((v): v is HTMLVideoElement => v != null);
    if (enLecture) {
      videos.forEach((v) => v.pause());
      setEnLecture(false);
      return;
    }
    videos.forEach((v) => {
      v.currentTime = 0;
      void v.play();
    });
    setEnLecture(true);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, width: "100%", height: "100%" }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, flex: 1, minHeight: 0 }}>
        {[
          { ref: a, l: principal, tag: "A" },
          { ref: b, l: comparaison, tag: "B" },
        ].map(({ ref, l, tag }) => (
          <figure key={`${tag}-${l.src}`} style={{ margin: 0, display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
            <video ref={ref} controls muted={tag === "B"} style={{ width: "100%", minHeight: 0 }} src={l.src} onEnded={() => setEnLecture(false)} />
            <figcaption className="tiny-note">
              {tag} · {l.titre}
              {tag === "B" ? " (son coupé, réactivable dans le lecteur)" : ""}
            </figcaption>
          </figure>
        ))}
      </div>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <button className="btn btn-ghost btn-sm" type="button" onClick={basculer}>
          {enLecture ? "Pause" : "Lire les deux"}
        </button>
        <Link className="btn btn-ghost btn-sm" href={hrefSansComparaison} scroll={false}>
          Fermer la comparaison
        </Link>
      </div>
    </div>
  );
}
