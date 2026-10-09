import type { CSSProperties } from "react";

/** Hauteurs (en %) d'une onde décorative, tirées d'une graine : la même voix a toujours la même onde. Elle ne représente pas le signal,
 * elle donne à l'écran sa ligne de lecture. */
export function hauteursOnde(graine: string, n: number): number[] {
  let s = 7;
  for (const c of graine) s = (s * 31 + c.charCodeAt(0)) % 233280;
  return Array.from({ length: n }, () => {
    s = (s * 9301 + 49297) % 233280;
    return 14 + Math.round((s / 233280) * 86);
  });
}

/** Onde décorative animée (`joue`) pendant qu'un son se lit. */
export function Onde({ graine, n = 34, joue = false }: { graine: string; n?: number; joue?: boolean }) {
  return (
    <div className={`av-onde${joue ? " is-joue" : ""}`} aria-hidden="true">
      {hauteursOnde(graine, n).map((h, k) => (
        <i key={k} style={{ "--h": `${h}%`, "--k": k } as CSSProperties} />
      ))}
    </div>
  );
}
