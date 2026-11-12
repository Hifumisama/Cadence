"use client";

import { useRef, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";

/** A cursor for mouse, finger and keyboard, without `<input type="range">` (invisible and covered by the decor, it did not respond
 * reliably). The whole area is the slider: the pointer is captured for the duration of the gesture. `slider` role for screen readers. */
export function Curseur({
  valeur,
  min,
  max,
  pas = 1,
  pasGrand = 10,
  etiquette,
  texteValeur,
  onChange,
  className,
  children,
}: {
  valeur: number;
  min: number;
  max: number;
  pas?: number;
  pasGrand?: number;
  etiquette: string;
  texteValeur?: string;
  onChange: (v: number) => void;
  className?: string;
  children: ReactNode;
}) {
  const zone = useRef<HTMLDivElement>(null);

  const poser = (e: PointerEvent<HTMLDivElement>) => {
    const r = zone.current?.getBoundingClientRect();
    if (!r || r.width === 0) return;
    const ratio = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
    const brut = min + ratio * (max - min);
    onChange(Math.max(min, Math.min(max, Math.round(brut / pas) * pas)));
  };

  const clavier = (e: KeyboardEvent<HTMLDivElement>) => {
    const grand = e.shiftKey ? pasGrand : pas;
    let v: number | null = null;
    if (e.key === "ArrowRight" || e.key === "ArrowUp") v = valeur + grand;
    else if (e.key === "ArrowLeft" || e.key === "ArrowDown") v = valeur - grand;
    else if (e.key === "Home") v = min;
    else if (e.key === "End") v = max;
    if (v == null) return;
    e.preventDefault();
    e.stopPropagation(); // the arrows change the value, not the step
    onChange(Math.max(min, Math.min(max, v)));
  };

  return (
    <div
      ref={zone}
      className={className}
      role="slider"
      tabIndex={0}
      aria-label={etiquette}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={valeur}
      aria-valuetext={texteValeur}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        poser(e);
      }}
      onPointerMove={(e) => {
        if (e.currentTarget.hasPointerCapture(e.pointerId)) poser(e);
      }}
      onKeyDown={clavier}
    >
      {children}
    </div>
  );
}
