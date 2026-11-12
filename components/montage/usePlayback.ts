"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { debuts, dureeTotale, indexA, type Clip } from "@/lib/montage/montage";

/** Clé de ce qu'un lecteur vidéo a chargé : l'entrée et son fichier (deux copies d'un plan sont deux clés). */
const cleDe = (c: Clip) => (c.rendu ? `${c.entree.id}|${c.rendu.src}` : null);

/** Lecture continue du montage. Une HORLOGE GLOBALE (`t`, secondes depuis le début de l'épisode) fait foi : sur un clip avec rendu elle suit
 * la vidéo (début rogné + temps écoulé), sur un clip sans rendu (ou illisible) elle avance seule, pendant sa durée prévue, sans couper la
 * lecture. Deux balises <video> alternent : l'une joue, l'autre a déjà chargé le clip suivant au bon instant (pas de trou au raccord).
 * Les `src` sont posés à la main (jamais par React) pour qu'un nouveau rendu ne recharge rien d'autre. */
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
  // Les valeurs du rendu courant, lues par la boucle d'animation sans la relancer (mises à jour avant les effets).
  const etat = useRef({ clips, starts, total });
  useLayoutEffect(() => {
    illisiblesRef.current = illisibles;
    etat.current = { clips, starts, total };
  }, [illisibles, clips, starts, total]);

  const jouable = useCallback((c: Clip | undefined) => !!c?.rendu && !illisiblesRef.current.has(cleDe(c)!), []);

  /** Met les deux lecteurs d'accord avec l'horloge : le clip courant dans le lecteur visible (au bon instant), le suivant préchargé dans
   * l'autre. `forcer` : repositionner la vidéo même si elle est proche (saut de la tête de lecture). */
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
      // Préchargement : le prochain clip jouable, dans le lecteur caché, posé sur son début rogné.
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

  /** Saute à l'instant `v` de l'épisode (règle, J/L, plan précédent/suivant). */
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

  // Le montage a changé (rognage, rendu retenu, ordre) : l'horloge reste dans la table, les lecteurs suivent.
  useEffect(() => {
    if (tRef.current > total) poserT(total);
    synchroniser(false);
  }, [clips, total, poserT, synchroniser, illisibles]);

  // La boucle de lecture.
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

  /** Un fichier qui ne se lit pas (supprimé du disque, format refusé) : le clip est traité comme sans rendu, la lecture continue. */
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
