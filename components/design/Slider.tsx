"use client";

import { useRef, useState, type KeyboardEvent, type PointerEvent } from "react";

const SEUIL = 0.88;

/** The « giant slider » that moves from one step to the next: a filmstrip pulled by the tip of the handle (or clicked, or
 * validated by keyboard: Enter, Space, →). Below the threshold the handle returns; beyond it, the filmstrip tightens and the step changes.
 * At the last step (`action`), the handle is a clapperboard. Always a focusable `role="slider"`: never a mouse-only gesture. */
export function Glissiere({
  libelle,
  action = false,
  danger = false,
  geant = false,
  desactive = false,
  occupe = false,
  onValider,
}: {
  libelle: string;
  action?: boolean;
  /** The gesture overwrites something validated: the handle is red (the episode revision, docs/FRICTIONS.md 2026-10-09). */
  danger?: boolean;
  /** Demo version, large on the welcome scene: teaches the gesture before it is used in the bottom bar. */
  geant?: boolean;
  desactive?: boolean;
  occupe?: boolean;
  onValider: () => void;
}) {
  const piste = useRef<HTMLDivElement>(null);
  const poignee = useRef<HTMLButtonElement>(null);
  const depart = useRef<{ x: number; course: number } | null>(null);
  const bouge = useRef(false);
  const [p, setP] = useState(0);
  const [tire, setTire] = useState(false);
  const inerte = desactive || occupe;

  const valider = () => {
    if (inerte) return;
    setTire(false);
    setP(1);
    window.setTimeout(() => {
      onValider();
      setP(0);
    }, 240);
  };

  const debut = (e: PointerEvent<HTMLButtonElement>) => {
    if (inerte || !piste.current || !poignee.current) return;
    poignee.current.setPointerCapture(e.pointerId);
    depart.current = { x: e.clientX, course: Math.max(1, piste.current.clientWidth - poignee.current.offsetWidth - 8) };
    bouge.current = false;
    setTire(true);
  };
  const deplace = (e: PointerEvent<HTMLButtonElement>) => {
    const d = depart.current;
    if (!d) return;
    const dx = e.clientX - d.x;
    if (Math.abs(dx) > 4) bouge.current = true;
    setP(Math.min(1, Math.max(0, dx / d.course)));
  };
  const fin = () => {
    if (!depart.current) return;
    depart.current = null;
    setTire(false);
    // A simple click (without pulling) counts as validation: the slider must never be an obstacle.
    if (p >= SEUIL || !bouge.current) valider();
    else setP(0);
  };
  const annule = () => {
    depart.current = null;
    setTire(false);
    setP(0);
  };
  const touche = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === "Enter" || e.key === " " || e.key === "ArrowRight") {
      e.preventDefault();
      valider();
    }
  };

  return (
    <div
      ref={piste}
      className={`cn-glisse${action ? " is-action" : ""}${danger ? " is-danger" : ""}${geant ? " is-geant" : ""}${inerte ? " is-inerte" : ""}${tire ? " is-tire" : ""}${p >= SEUIL ? " is-pret" : ""}`}
      style={{ "--p": p } as React.CSSProperties}
    >
      <div className="cn-glisse-rempli" aria-hidden="true" />
      <span className="cn-glisse-texte" aria-hidden="true">
        {occupe ? "Un instant…" : libelle}
        <i>›</i><i>›</i><i>›</i>
      </span>
      <button
        ref={poignee}
        type="button"
        role="slider"
        aria-label={libelle}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(p * 100)}
        aria-disabled={inerte}
        className="cn-glisse-poignee"
        onPointerDown={debut}
        onPointerMove={deplace}
        onPointerUp={fin}
        onPointerCancel={annule}
        onKeyDown={touche}
      >
        {action ? "Action !" : "→"}
      </button>
    </div>
  );
}
