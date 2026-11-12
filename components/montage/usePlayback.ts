"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { debuts, dureeTotale, indexA, type Clip } from "@/lib/montage/montage";

/** Key of what a video player has loaded: the entry and its file (two copies of a clip are two keys). */
const cleDe = (c: Clip) => (c.rendu ? `${c.entree.id}|${c.rendu.src}` : null);

/** Continuous playback of the edit. A GLOBAL CLOCK (`t`, seconds since the start of the episode) is authoritative: on a clip with a render it follows
 * the video (trimmed start + elapsed time), on a clip without a render (or unreadable) it advances on its own, for its planned duration, without
 * interrupting playback. Two <video> tags alternate: one plays, the other has already loaded the next clip at the right moment (no gap at the join).
 * The `src` are set by hand (never by React) so that a new render reloads nothing else. */
export function useLecture(clips: Clip[]) {
  const durees = useMemo(() => clips.map((c) => c.duree), [clips]);
  const starts = useMemo(() => debuts(durees), [durees]);
  const total = useMemo(() => dureeTotale(durees), [durees]);

  const [t, setTEtat] = useState(0);
  const tRef = useRef(0);
  const [lecture, setLectureEtat] = useState(false);
  const lectureRef = useRef(false);
  const videoA = useRef<HTMLVideoElement>(null);
  const videoB = useRef<HTMLVideoElement>(null);
  const videos = useMemo(() => [videoA, videoB] as const, []);
  const lecteur = useCallback((i: number) => (i === 0 ? videoA : videoB).current, []);
  const [actif, setActif] = useState(0);
  const actifRef = useRef(0);
  const [illisibles, setIllisibles] = useState<ReadonlySet<string>>(() => new Set());
  const illisiblesRef = useRef<ReadonlySet<string>>(illisibles);
  // The current render's values, read by the animation loop without restarting it (updated before the effects).
  const etat = useRef({ clips, starts, total });
  useLayoutEffect(() => {
    illisiblesRef.current = illisibles;
    etat.current = { clips, starts, total };
  }, [illisibles, clips, starts, total]);

  const jouable = useCallback((c: Clip | undefined) => !!c?.rendu && !illisiblesRef.current.has(cleDe(c)!), []);

  /** Brings both players into agreement with the clock: the current clip in the visible player (at the right moment), the next one preloaded in
   * the other. `forcer`: reposition the video even if it is close (playhead jump). */
  const synchroniser = useCallback(
    (forcer: boolean) => {
      const { clips: cs, starts: st } = etat.current;
      if (cs.length === 0) return;
      const k = indexA(tRef.current, st);
      const c = cs[k]!;
      if (!jouable(c)) {
        videos.forEach((r) => r.current?.pause());
      } else {
        const cle = cleDe(c)!;
        let a = actifRef.current;
        if (lecteur(a)?.dataset.cle !== cle && lecteur(1 - a)?.dataset.cle === cle) {
          a = 1 - a;
          actifRef.current = a;
          setActif(a);
        }
        const v = lecteur(a);
        if (v) {
          const local = c.debut + (tRef.current - st[k]!);
          if (v.dataset.cle !== cle) {
            v.dataset.cle = cle;
            v.src = c.rendu!.src;
            v.currentTime = local;
          } else if (Math.abs(v.currentTime - local) > (forcer ? 0.04 : 0.3)) {
            v.currentTime = local;
          }
          if (lectureRef.current) void v.play().catch(() => undefined);
          else v.pause();
        }
        lecteur(1 - a)?.pause();
      }
      // Preloading: the next playable clip, in the hidden player, set to its trimmed start.
      const suivant = cs.slice(k + 1).find((x) => jouable(x));
      const autre = lecteur(1 - actifRef.current);
      if (suivant && autre && (!jouable(c) || cleDe(c) !== cleDe(suivant))) {
        const cle = cleDe(suivant)!;
        if (autre.dataset.cle !== cle) {
          autre.dataset.cle = cle;
          autre.src = suivant.rendu!.src;
          autre.preload = "auto";
          autre.currentTime = suivant.debut;
        } else if (Math.abs(autre.currentTime - suivant.debut) > 0.05 && autre.paused) {
          autre.currentTime = suivant.debut;
        }
      }
    },
    [jouable, lecteur, videos],
  );

  const poserT = useCallback((v: number) => {
    tRef.current = v;
    setTEtat(v);
  }, []);

  /** Jumps to instant `v` of the episode (ruler, J/L, previous/next clip). */
  const allerA = useCallback(
    (v: number) => {
      poserT(Math.min(Math.max(0, v), etat.current.total));
      synchroniser(true);
    },
    [poserT, synchroniser],
  );

  const jouer = useCallback(
    (on: boolean) => {
      if (on && tRef.current >= etat.current.total - 0.05) poserT(0);
      lectureRef.current = on;
      setLectureEtat(on);
      synchroniser(true);
    },
    [poserT, synchroniser],
  );

  // The edit has changed (trimming, retained render, order): the clock stays in the table, the players follow.
  useEffect(() => {
    if (tRef.current > total) poserT(total);
    synchroniser(false);
  }, [clips, total, poserT, synchroniser, illisibles]);

  // The playback loop.
  useEffect(() => {
    if (!lecture) return;
    let raf = 0;
    let dernier = performance.now();
    const tic = (maintenant: number) => {
      const dt = Math.min(0.25, (maintenant - dernier) / 1000);
      dernier = maintenant;
      const { clips: cs, starts: st, total: tot } = etat.current;
      if (cs.length === 0) return;
      const k = indexA(tRef.current, st);
      const c = cs[k]!;
      const fin = st[k]! + c.duree;
      let nt = tRef.current;
      if (jouable(c)) {
        const v = lecteur(actifRef.current);
        if (v && v.dataset.cle === cleDe(c) && !v.seeking && v.readyState >= 2) {
          nt = st[k]! + Math.max(0, v.currentTime - c.debut);
          if (v.ended || v.currentTime >= c.fin - 0.02) nt = fin;
        }
      } else {
        nt += dt;
      }
      if (nt >= fin - 1e-3) {
        if (k + 1 >= cs.length) {
          poserT(tot);
          lectureRef.current = false;
          setLectureEtat(false);
          synchroniser(true);
          return;
        }
        poserT(st[k + 1]!);
        synchroniser(true);
      } else {
        poserT(nt);
      }
      raf = requestAnimationFrame(tic);
    };
    raf = requestAnimationFrame(tic);
    return () => cancelAnimationFrame(raf);
  }, [lecture, jouable, lecteur, poserT, synchroniser]);

  /** A file that does not play (deleted from disk, format refused): the clip is treated as without a render, playback continues. */
  const signalerIllisible = useCallback((v: HTMLVideoElement) => {
    const cle = v.dataset.cle;
    if (!cle) return;
    setIllisibles((s) => (s.has(cle) ? s : new Set(s).add(cle)));
  }, []);

  const k = clips.length ? indexA(t, starts) : -1;
  const courant = k >= 0 ? clips[k]! : null;
  const courantIllisible = !!courant?.rendu && illisibles.has(cleDe(courant)!);
  return {
    t,
    total,
    starts,
    durees,
    lecture,
    jouer,
    allerA,
    videoA,
    videoB,
    actif,
    indexCourant: k,
    courant,
    courantLisible: !!courant?.rendu && !courantIllisible,
    courantIllisible,
    signalerIllisible,
  };
}
