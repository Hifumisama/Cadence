"use client";

/** Un sélecteur de durée en curseur : des secondes entières de `min` à `max`, la valeur affichée à côté. Remplace la roulette (AT-01 du cahier de tests : peu pratique).
 * Clavier natif d'un `input range` (flèches, Début, Fin, PageUp/PageDown). `valeur` null : la durée actuelle est hors des bornes (plan d'avant), rien n'est choisi
 * tant qu'on ne touche pas le curseur (un clic ou un relâchement sur la piste suffit, même sans changer de cran). */
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
  /** L'id de l'élément qui nomme le champ (aria-labelledby). */
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
        onKeyDown={(e) => e.stopPropagation()} // les flèches changent la durée, pas l'essai affiché
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
