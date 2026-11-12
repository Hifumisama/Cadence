"use client";

/** A duration selector as a slider: whole seconds from `min` to `max`, the value shown beside it. Replaces the wheel (AT-01 of the test book: impractical).
 * Native keyboard of an `input range` (arrows, Home, End, PageUp/PageDown). `valeur` null: the current duration is outside the bounds (earlier clip), nothing is chosen
 * until the slider is touched (a click or a release on the track is enough, even without changing a notch). */
export function CurseurDuree({
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
  /** The id of the element that names the field (aria-labelledby). */
  idEtiquette: string;
  disabled?: boolean;
}) {
  const crans = Array.from({ length: max - min + 1 }, (_, i) => min + i);
  const lire = (e: { currentTarget: HTMLInputElement }) => Math.max(min, Math.min(max, Number(e.currentTarget.value)));
  return (
    <div className={`pl-curseur${disabled ? " is-off" : ""}${valeur == null ? " is-vide" : ""}`}>
      <input
        type="range"
        className="pl-curseur-piste"
        min={min}
        max={max}
        step={1}
        value={valeur ?? min}
        disabled={disabled}
        aria-labelledby={idEtiquette}
        aria-valuetext={valeur != null ? `${valeur} secondes` : "aucune durée choisie"}
        onChange={(e) => onChange(lire(e))}
        onPointerUp={(e) => {
          if (valeur == null) onChange(lire(e));
        }}
        onKeyDown={(e) => e.stopPropagation()} // the arrows change the duration, not the displayed attempt
      />
      <div className="pl-curseur-crans" aria-hidden="true">
        {crans.map((c) => (
          <span key={c} className={`num${c === valeur ? " is-choisi" : ""}`}>
            {c}
          </span>
        ))}
      </div>
      <output className="pl-curseur-valeur num">
        {valeur != null ? `${valeur} s` : "—"}
      </output>
    </div>
  );
}
