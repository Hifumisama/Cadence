"use client";

import { useEffect, useRef, type RefObject } from "react";

/** Distance (px) sous le bas d'un fil en dessous de laquelle on est « en bas du fil ». */
const MARGE_PX = 80;

/** L'ancêtre qui défile (overflow-y auto ou scroll) : le fil lui-même. Null si le fil est dans la page. */
function conteneurDefilant(el: HTMLElement | null): HTMLElement | null {
  for (let p = el?.parentElement ?? null; p; p = p.parentElement) {
    const o = getComputedStyle(p).overflowY;
    if ((o === "auto" || o === "scroll") && p.scrollHeight > p.clientHeight) return p;
  }
  return null;
}

/** Fait défiler le fil jusqu'à la sentinelle `fin` (son bas) quand `declencheur` change, SAUF si l'utilisateur est remonté lire plus
 * haut : pendant qu'un texte arrive au fil du flux, le suivre sans lui arracher l'ascenseur.
 * `toujours` (ex. le nombre de messages) force le défilement : un nouveau message, c'est celui qu'on vient d'envoyer ou de recevoir.
 *
 * Seul le conteneur du fil défile (`scrollTop`) : `scrollIntoView` aligne aussi la PAGE sur la sentinelle, et tirait la page vers le haut
 * à chaque mise à jour dès que l'utilisateur était descendu jusqu'à la zone de saisie. */
export function useDefilementBas(fin: RefObject<HTMLElement | null>, declencheur: unknown, toujours: unknown) {
  const enBas = useRef(true);
  const dernierToujours = useRef(toujours);

  // « En bas » = le fil est collé à son bas. Écouté en phase de capture : un scroll d'un conteneur interne ne remonte pas jusqu'à `document`.
  useEffect(() => {
    const mesurer = (e: Event) => {
      const el = fin.current;
      if (!el) return;
      const c = conteneurDefilant(el);
      // Un scroll de la page (pas du fil) ne dit rien sur la position DANS le fil.
      if (c) {
        if (e.target === c) enBas.current = c.scrollHeight - c.scrollTop - c.clientHeight <= MARGE_PX;
      } else enBas.current = el.getBoundingClientRect().top <= window.innerHeight + MARGE_PX;
    };
    document.addEventListener("scroll", mesurer, { capture: true, passive: true });
    return () => document.removeEventListener("scroll", mesurer, { capture: true });
  }, [fin]);

  useEffect(() => {
    const force = dernierToujours.current !== toujours;
    dernierToujours.current = toujours;
    if (!force && !enBas.current) return;
    const el = fin.current;
    if (!el) return;
    const c = conteneurDefilant(el);
    if (c) c.scrollTop = c.scrollHeight;
    else el.scrollIntoView({ block: "nearest" });
    enBas.current = true;
  }, [fin, declencheur, toujours]);
}
