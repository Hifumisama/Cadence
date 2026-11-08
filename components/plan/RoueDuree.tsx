"use client";

import { useEffect, useLayoutEffect, useRef, type KeyboardEvent } from "react";

const HAUTEUR_CRAN = 36;

/** Un sélecteur de durée en roulette, comme le minuteur d'un téléphone : une colonne de secondes entières qui défile (molette, doigt, glisser) et se cale au
 * centre (scroll-snap), encadrée de « − » et « + ». Au clavier, c'est un `spinbutton` : ↑ / → ajoutent une seconde, ↓ / ← en retirent une, Début / Fin vont aux bornes.
 * `valeur` null : la durée actuelle est hors des bornes (plan d'avant), rien n'est sélectionné tant qu'on ne choisit pas. */
export function RoueDuree({
  valeur,
  min,
  max,
  onChange,
  idEtiquette,
  disabled = false,
}: {
  valeur: number | null;
  min: number;
  max: number;
  onChange: (v: number) => void;
  /** L'id de l'élément qui nomme le champ (aria-labelledby). */
  idEtiquette: string;
  disabled?: boolean;
}) {
  const valeurs = Array.from({ length: max - min + 1 }, (_, i) => min + i);
  const colonne = useRef<HTMLDivElement>(null);
  const attente = useRef<ReturnType<typeof setTimeout> | null>(null);
  const idx = valeur == null ? -1 : valeurs.indexOf(valeur);
  const borner = (v: number) => Math.max(min, Math.min(max, v));

  // Au montage : la roulette se pose sur la valeur, sans animation.
  useLayoutEffect(() => {
    if (colonne.current && idx >= 0) colonne.current.scrollTop = idx * HAUTEUR_CRAN;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // Une valeur changée autrement (boutons, clavier, clic) : la roulette la rejoint.
  useEffect(() => {
    const c = colonne.current;
    if (!c || idx < 0) return;
    if (Math.round(c.scrollTop / HAUTEUR_CRAN) === idx) return;
    const doux = !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    c.scrollTo({ top: idx * HAUTEUR_CRAN, behavior: doux ? "smooth" : "auto" });
  }, [idx]);
  useEffect(() => () => void (attente.current && clearTimeout(attente.current)), []);

  // Le défilement s'arrête : le cran au centre devient la valeur.
  const onScroll = () => {
    if (attente.current) clearTimeout(attente.current);
    attente.current = setTimeout(() => {
      const c = colonne.current;
      if (!c || disabled) return;
      const i = Math.max(0, Math.min(valeurs.length - 1, Math.round(c.scrollTop / HAUTEUR_CRAN)));
      const v = valeurs[i]!;
      if (v !== valeur) onChange(v);
    }, 140);
  };

  const pas = (d: number) => onChange(borner((valeur ?? (d > 0 ? min - 1 : max + 1)) + d));

  const clavier = (e: KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return;
    let v: number | null = null;
    if (e.key === "ArrowUp" || e.key === "ArrowRight") v = (valeur ?? min - 1) + 1;
    else if (e.key === "ArrowDown" || e.key === "ArrowLeft") v = (valeur ?? max + 1) - 1;
    else if (e.key === "Home") v = min;
    else if (e.key === "End") v = max;
    else if (e.key === "PageUp") v = (valeur ?? min) + 3;
    else if (e.key === "PageDown") v = (valeur ?? max) - 3;
    if (v == null) return;
    e.preventDefault();
    e.stopPropagation(); // les flèches changent la durée, pas l'essai affiché
    onChange(borner(v));
  };

  return (
    <div className={`pl-roue${disabled ? " is-off" : ""}`}>
      <button type="button" className="pl-roue-pas" onClick={() => pas(-1)} disabled={disabled || valeur === min} aria-label="Une seconde de moins" tabIndex={-1}>
        −
      </button>
      <div
        className="pl-roue-cadre"
        role="spinbutton"
        tabIndex={disabled ? -1 : 0}
        aria-labelledby={idEtiquette}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={valeur ?? undefined}
        aria-valuetext={valeur != null ? `${valeur} secondes` : "aucune durée choisie"}
        aria-disabled={disabled || undefined}
        onKeyDown={clavier}
      >
        <div ref={colonne} className="pl-roue-colonne" onScroll={onScroll} aria-hidden="true">
          <div className="pl-roue-marge" />
          {valeurs.map((v) => (
            <div key={v} className={`pl-roue-cran${v === valeur ? " is-choisi" : ""}`} onClick={() => !disabled && onChange(v)}>
              <span className="num">{v}</span>
            </div>
          ))}
          <div className="pl-roue-marge" />
        </div>
        <span className="pl-roue-unite" aria-hidden="true">
          s
        </span>
      </div>
      <button type="button" className="pl-roue-pas" onClick={() => pas(1)} disabled={disabled || valeur === max} aria-label="Une seconde de plus" tabIndex={-1}>
        +
      </button>
    </div>
  );
}
