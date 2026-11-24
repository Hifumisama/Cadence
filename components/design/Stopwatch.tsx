"use client";

import { useRef, type KeyboardEvent, type PointerEvent } from "react";
import { DUREE_MAX_SECONDES, DUREE_MIN_SECONDES, PAS_SECONDES_CADRAN } from "@/lib/projects/design";

/** The duration stopwatch (test feedback 2026-11-24, it replaces the long slider): ONE hand sets everything, one turn = 30 min, by steps
 * of 15 s. Drag the hand or click anywhere on the dial; the hand is a keyboard slider (arrows: 15 s, Page up/down: 1 min). The filled arc is
 * a dashed circle (no path recomputed: it never jumps). */

const C = 200;
const R = 168;
const R_ARC = R - 10;
const TOUR = DUREE_MAX_SECONDES;
const PAS = PAS_SECONDES_CADRAN;

const point = (r: number, fraction: number) => {
  const a = fraction * 2 * Math.PI - Math.PI / 2;
  return { x: C + r * Math.cos(a), y: C + r * Math.sin(a) };
};
const borner = (s: number) => Math.min(DUREE_MAX_SECONDES, Math.max(DUREE_MIN_SECONDES, s));

export function Chronometre({ duree, onChange }: { duree: number; onChange: (duree: number) => void }) {
  const svg = useRef<SVGSVGElement>(null);
  const tire = useRef(false);

  const poser = (e: PointerEvent) => {
    const r = svg.current?.getBoundingClientRect();
    if (!r) return;
    const x = ((e.clientX - r.left) / r.width) * 400 - C;
    const y = ((e.clientY - r.top) / r.height) * 400 - C;
    const fraction = ((Math.atan2(y, x) + Math.PI / 2 + 2 * Math.PI) % (2 * Math.PI)) / (2 * Math.PI);
    let s = Math.round((fraction * TOUR) / PAS) * PAS;
    // Crossing 12 o'clock: the hand stops at the end it comes from instead of jumping to the other.
    if (tire.current && duree > TOUR * 0.75 && s < TOUR * 0.25) s = TOUR;
    if (tire.current && duree < TOUR * 0.25 && s > TOUR * 0.75) s = DUREE_MIN_SECONDES;
    onChange(borner(s));
  };
  const clavier = (e: KeyboardEvent) => {
    const pas = e.key === "PageUp" || e.key === "PageDown" ? 60 : PAS;
    const sens = ["ArrowRight", "ArrowUp", "PageUp"].includes(e.key) ? 1 : ["ArrowLeft", "ArrowDown", "PageDown"].includes(e.key) ? -1 : 0;
    if (!sens) return;
    e.preventDefault();
    onChange(borner(duree + sens * pas));
  };

  const fraction = duree / TOUR;
  const bout = point(R - 34, fraction);
  const perimetre = 2 * Math.PI * R_ARC;

  return (
    <div className="cn-chrono">
      <div className="cn-chrono-fond" aria-hidden="true"><i /><i /><i /></div>
      <svg
        ref={svg}
        viewBox="0 0 400 400"
        className="cn-chrono-cadran"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          poser(e);
          tire.current = true;
        }}
        onPointerMove={(e) => tire.current && poser(e)}
        onPointerUp={() => (tire.current = false)}
        onPointerCancel={() => (tire.current = false)}
      >
        <circle cx={C} cy={C} r={R + 14} className="cn-chrono-boitier" />
        <circle cx={C} cy={C} r={R} className="cn-chrono-face" />
        <circle
          cx={C}
          cy={C}
          r={R_ARC}
          className="cn-chrono-arc"
          transform={`rotate(-90 ${C} ${C})`}
          strokeDasharray={`${fraction * perimetre} ${perimetre}`}
        />
        {Array.from({ length: 60 }, (_, k) => {
          const a = point(R - 4, k / 60);
          const b = point(R - (k % 10 === 0 ? 22 : k % 2 === 0 ? 15 : 9), k / 60);
          return <line key={k} x1={a.x} y1={a.y} x2={b.x} y2={b.y} className={k % 10 === 0 ? "is-fort" : k % 2 === 0 ? "" : "is-fin"} />;
        })}
        {[0, 5, 10, 15, 20, 25].map((m) => {
          const p = point(R - 44, (m * 60) / TOUR);
          return <text key={m} x={p.x} y={p.y} className="cn-chrono-chiffre" textAnchor="middle" dominantBaseline="central">{m === 0 ? "30" : m}</text>;
        })}
        <g
          tabIndex={0}
          role="slider"
          aria-label="Durée du film"
          aria-valuemin={DUREE_MIN_SECONDES}
          aria-valuemax={DUREE_MAX_SECONDES}
          aria-valuenow={duree}
          aria-valuetext={`${Math.floor(duree / 60)} min ${duree % 60 ? `${duree % 60} s` : ""}`.trim()}
          onKeyDown={clavier}
          className="cn-chrono-prise"
        >
          <line x1={C} y1={C} x2={bout.x} y2={bout.y} className="cn-chrono-min" />
          <circle cx={bout.x} cy={bout.y} r={14} className="cn-chrono-bout" />
        </g>
        <circle cx={C} cy={C} r={10} className="cn-chrono-axe" />
      </svg>
    </div>
  );
}
