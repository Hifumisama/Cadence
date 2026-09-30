"use client";

import type { OptionsLocuteur } from "@/lib/queries-repliques";

/** Locuteur d'une réplique, encodé dans une seule valeur (voir
 * lib/repliques.ts, decoderLocuteur) : `p:<id>` un personnage — sa voix se
 * déduit du casting —, `v:<id>` une voix du catalogue sans personnage (voix
 * off), `t:<texte>` un locuteur libre (foule, « inconnu »). */
export function SelecteurLocuteur({
  options,
  value,
  onChange,
  disabled,
}: {
  options: OptionsLocuteur;
  value: string;
  onChange: (valeur: string) => void;
  disabled?: boolean;
}) {
  const libre = value.startsWith("t:");
  return (
    <span className="loc-select">
      <select
        className="field"
        value={libre ? "t:" : value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        aria-label="Locuteur"
      >
        <option value="">— locuteur</option>
        <optgroup label="Personnages">
          {options.personnages.map((p) => (
            <option key={p.id} value={`p:${p.id}`}>
              {p.label} — {p.voixCode ?? "sans voix"}
            </option>
          ))}
        </optgroup>
        {options.voixSeules.length > 0 ? (
          <optgroup label="Voix seules (voix off)">
            {options.voixSeules.map((v) => (
              <option key={v.id} value={`v:${v.id}`}>
                {v.code}
              </option>
            ))}
          </optgroup>
        ) : null}
        <option value="t:">Autre (texte libre)…</option>
      </select>
      {libre ? (
        <input
          className="field"
          value={value.slice(2)}
          onChange={(e) => onChange(`t:${e.target.value}`)}
          placeholder="foule, inconnu…"
          maxLength={100}
          disabled={disabled}
          aria-label="Nom du locuteur"
        />
      ) : null}
    </span>
  );
}
