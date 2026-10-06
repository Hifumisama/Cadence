"use client";

import { useEffect, useRef } from "react";

type Braise = { x: number; y: number; vx: number; vy: number; r: number; vie: number; max: number };

/** Des braises qui montent derrière le lecteur : ambiance du cercle de feu, discrète. Arrêtées si l'utilisateur demande moins de
 * mouvement, ou quand l'onglet est caché. */
export function Braises() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const cv = ref.current;
    if (!cv || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const cx = cv.getContext("2d");
    if (!cx) return;
    let w = 0;
    let h = 0;
    const mesurer = () => {
      const r = cv.getBoundingClientRect();
      w = cv.width = r.width;
      h = cv.height = r.height;
    };
    mesurer();
    const obs = new ResizeObserver(mesurer);
    obs.observe(cv);

    const naitre = (): Braise => ({ x: w * (0.25 + Math.random() * 0.5), y: h + 4, vx: (Math.random() - 0.5) * 0.3, vy: -(0.3 + Math.random() * 0.7), r: 0.6 + Math.random() * 1.6, vie: 0, max: 120 + Math.random() * 120 });
    const braises: Braise[] = Array.from({ length: 26 }, () => {
      const b = naitre();
      b.y = Math.random() * h;
      b.vie = Math.random() * b.max;
      return b;
    });

    let raf = 0;
    const tick = () => {
      cx.clearRect(0, 0, w, h);
      braises.forEach((b, i) => {
        b.x += b.vx + Math.sin(b.vie / 18) * 0.15;
        b.y += b.vy;
        b.vie++;
        const a = Math.max(0, 1 - b.vie / b.max);
        cx.fillStyle = `rgba(255,${Math.round(120 + 90 * a)},70,${a * 0.75})`;
        cx.beginPath();
        cx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
        cx.fill();
        if (b.vie > b.max || b.y < -4) braises[i] = naitre();
      });
      raf = requestAnimationFrame(tick);
    };
    const surVisibilite = () => {
      cancelAnimationFrame(raf);
      if (!document.hidden) raf = requestAnimationFrame(tick);
    };
    document.addEventListener("visibilitychange", surVisibilite);
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      obs.disconnect();
      document.removeEventListener("visibilitychange", surVisibilite);
    };
  }, []);

  return <canvas ref={ref} className="fp-braises" aria-hidden="true" />;
}
