import { libelleStyleComplet } from "@/lib/h3ir/reglages";
import { IDS_PROFILS_PERSO } from "@/lib/h3ir/profils-perso";
import { STYLES_CAMERA } from "@/lib/h3ir/styles-camera";

/** Les choix de « style de mise en scène » d'un menu déroulant, en deux groupes : les façons de filmer d'animation et de genre (profils perso), puis les réalisateurs. */
export function OptionsMiseEnScene() {
  return (
    <>
      <optgroup label="Animation et genres">
        {IDS_PROFILS_PERSO.map((s) => (
          <option key={s} value={s}>
            {libelleStyleComplet(s)}
          </option>
        ))}
      </optgroup>
      <optgroup label="Dans le style d'un réalisateur">
        {STYLES_CAMERA.map((s) => (
          <option key={s} value={s}>
            {libelleStyleComplet(s)}
          </option>
        ))}
      </optgroup>
    </>
  );
}
