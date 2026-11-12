"use client";

import { useEffect, useRef, useState } from "react";

/** « Typewriter » effect: the visible text catches up with the text received letter by letter (the stream arrives in bursts,
 * every ~1.2 s; without smoothing it would appear in chunks). The speed adapts to the lag: a small gap is read
 * calmly, a large chunk is caught up quickly (never more than ~1 s of lag). A text that gets shorter (new call)
 * starts over from zero. `null`: nothing to write. */
export function useMachineAEcrire(cible: string | null): string {
  const texte = cible ?? "";
  const [n, setN] = useState(0);
  const dernier = useRef("");

  useEffect(() => {
    // A text that does not extend the previous one (new call, resend to the model): we start over from zero.
    if (!texte.startsWith(dernier.current)) setN(0);
    dernier.current = texte;
  }, [texte]);

  useEffect(() => {
    const t = setInterval(() => {
      setN((courant) => {
        const total = dernier.current.length;
        if (courant >= total) return courant;
        const retard = total - courant;
        return Math.min(total, courant + Math.max(1, Math.ceil(retard / 25)));
      });
    }, 25);
    return () => clearInterval(t);
  }, []);

  return texte.slice(0, Math.min(n, texte.length));
}
