"use client";

import { GENRES_SCENE, LIBELLE_GENRE, genreOuNull } from "@/lib/scene-genres";

/** Genre et ambiance d'une scène (formulaires de création et de modification). Le genre choisit les guides de
 * rédaction des plans de la scène ; l'ambiance est le cadre visuel tenu sur toute la scène. */
export function ChampsGenreScene({
  genre,
  ambiance,
  onGenre,
  onAmbiance,
}: {
  genre: string;
  ambiance: string;
  onGenre: (v: string) => void;
  onAmbiance: (v: string) => void;
}) {
  return (
    <>
      <div className="field-group">
        <label htmlFor="scene-genre">Genre</label>
        <select id="scene-genre" className="field" value={genreOuNull(genre) ?? ""} onChange={(e) => onGenre(e.target.value)}>
          <option value="">Standard</option>
          {GENRES_SCENE.map((g) => (
            <option key={g} value={g}>
              {LIBELLE_GENRE[g]}
            </option>
          ))}
        </select>
        <span className="tiny-note">Choisit comment les plans de la scène se rédigent (action, montage, dialogue…).</span>
      </div>
      <div className="field-group wide">
        <label htmlFor="scene-ambiance">Ambiance</label>
        <input
          id="scene-ambiance"
          className="field"
          value={ambiance}
          onChange={(e) => onAmbiance(e.target.value)}
          placeholder="Ex. plein jour, ciel dégagé — tenue sur toute la scène"
        />
      </div>
    </>
  );
}
