"use client";

import { useRef, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";

/** Un curseur à la souris, au doigt et au clavier, sans `<input type="range">` (invisible et recouvert de décor, il ne répondait pas
 * de façon fiable). Toute la zone est la glissière : le pointeur est capturé le temps du geste. Rôle `slider` pour les lecteurs d'écran. */
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
    e.stopPropagation(); // les flèches changent la valeur, pas l'étape
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
