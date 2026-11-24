"use client";

import type { CSSProperties } from "react";
import { INTENTIONS_MUSIQUE, LIBELLES_INTENTION_MUSIQUE } from "@/lib/projects/design";

type Intention = (typeof INTENTIONS_MUSIQUE)[number];

/** The music step as a small stage (2026-11-24): on the left the voices, a waveform that always speaks; on the right a turntable on its deck,
 * under a spotlight. The more room the music takes, the bigger and livelier the turntable: still and dimmed for « aucune », small and slow
 * under the voices for « discrète », huge, fast, lit and throwing notes for « présente ». */

const ECHELLE: Record<Intention, number> = { aucune: 0.7, discrete: 0.85, presente: 1.12 };
const NOTES: Record<Intention, number> = { aucune: 0, discrete: 3, presente: 9 };
const BARRES_VOIX = 22;
const BARRES_MUSIQUE = 14;

export function SceneMusicale({ musique, choisir }: { musique: Intention; choisir: (m: Intention) => void }) {
  return (
    <div className="cn-musique">
      <div className={`cn-scene-son is-${musique}`} aria-hidden="true">
        <div className="cn-projecteur" />
        <div className="cn-voix">
          <div className="cn-voix-onde">
            {Array.from({ length: BARRES_VOIX }, (_, i) => <i key={i} style={{ "--i": i } as CSSProperties} />)}
          </div>
          <small>Voix et bruitages</small>
        </div>
        <div className="cn-platine" style={{ "--echelle": ECHELLE[musique] } as CSSProperties}>
          <div className="cn-socle">
            <div className="cn-plateau"><div className="cn-disque"><span /></div></div>
            <div className="cn-bras"><i /></div>
            <span className="cn-led" />
            <span className="cn-molette" /><span className="cn-molette is-2" />
          </div>
          {Array.from({ length: NOTES[musique] }, (_, i) => (
            <span key={`${musique}-${i}`} className="cn-note-volante" style={{ "--i": i } as CSSProperties}>{i % 3 === 0 ? "♫" : "♪"}</span>
          ))}
          <div className="cn-egaliseur">
            {Array.from({ length: BARRES_MUSIQUE }, (_, i) => <i key={i} style={{ "--i": i } as CSSProperties} />)}
          </div>
          <small>Musique</small>
        </div>
      </div>
      <div className="cn-musique-choix" role="radiogroup" aria-label="Place de la musique">
        {INTENTIONS_MUSIQUE.map((m) => (
          <button key={m} type="button" role="radio" aria-checked={musique === m} className="cn-musique-cran" onClick={() => choisir(m)}>
            <b>{LIBELLES_INTENTION_MUSIQUE[m]}</b>
          </button>
        ))}
      </div>
    </div>
  );
}
