"use client";

import { useEffect, useRef, type RefObject } from "react";

/** Distance (px) sous le bas de l'écran en dessous de laquelle on est « en bas du fil ». */
const MARGE_PX = 160;

/** Fait défiler jusqu'à la sentinelle `fin` (le bas d'un fil de messages) quand `declencheur` change, SAUF si l'utilisateur est
 * remonté lire plus haut : pendant qu'un texte arrive au fil du flux, le suivre sans lui arracher l'ascenseur.
 * `toujours` (ex. le nombre de messages) force le défilement : un nouveau message, c'est celui qu'on vient d'envoyer ou de recevoir. */
export function useDefilementBas(fin: RefObject<HTMLElement | null>, declencheur: unknown, toujours: unknown) {
  const enBas = useRef(true);
  const dernierToujours = useRef(toujours);

  // L'utilisateur est « en bas » tant que la sentinelle est à l'écran (ou juste dessous). Écouté en phase de capture : un scroll
  // d'un conteneur interne ne remonte pas jusqu'à `document`.
  useEffect(() => {
    const mesurer = () => {
      const el = fin.current;
      if (el) enBas.current = el.getBoundingClientRect().top <= window.innerHeight + MARGE_PX;
    };
    document.addEventListener("scroll", mesurer, { capture: true, passive: true });
    return () => document.removeEventListener("scroll", mesurer, { capture: true });
  }, [fin]);

  useEffect(() => {
    const force = dernierToujours.current !== toujours;
    dernierToujours.current = toujours;
    if (force || enBas.current) {
      fin.current?.scrollIntoView({ block: "end" });
      enBas.current = true;
    }
  }, [fin, declencheur, toujours]);
}
