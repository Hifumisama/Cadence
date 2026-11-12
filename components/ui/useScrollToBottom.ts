"use client";

import { useEffect, useRef, type RefObject } from "react";

/** Distance (px) from the bottom of a thread below which we are « en bas du fil » (at the bottom of the thread). */
const MARGE_PX = 80;

/** The scrolling ancestor (overflow-y auto or scroll): the thread itself. Null if the thread is in the page. */
function conteneurDefilant(el: HTMLElement | null): HTMLElement | null {
  for (let p = el?.parentElement ?? null; p; p = p.parentElement) {
    const o = getComputedStyle(p).overflowY;
    if ((o === "auto" || o === "scroll") && p.scrollHeight > p.clientHeight) return p;
  }
  return null;
}

/** Scrolls the thread down to the sentinel `fin` (its bottom) when `declencheur` changes, UNLESS the user has scrolled back up to read earlier: while a text arrives in the thread's flow, follow it without snatching the scrollbar away.
 * `toujours` (e.g. the number of messages) forces scrolling: a new message is the one we have just sent or received.
 *
 * Only the thread's container scrolls (`scrollTop`): `scrollIntoView` also aligns the PAGE with the sentinel, and pulled the page up
 * at each update as soon as the user had scrolled down to the input area. */
export function useDefilementBas(fin: RefObject<HTMLElement | null>, declencheur: unknown, toujours: unknown) {
  const enBas = useRef(true);
  const dernierToujours = useRef(toujours);

  // "At the bottom" = the thread is stuck to its bottom. Listened to in the capture phase: a scroll of an inner container does not bubble up to `document`.
  useEffect(() => {
    const mesurer = (e: Event) => {
      const el = fin.current;
      if (!el) return;
      const c = conteneurDefilant(el);
      // A scroll of the page (not of the thread) says nothing about the position INSIDE the thread.
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
