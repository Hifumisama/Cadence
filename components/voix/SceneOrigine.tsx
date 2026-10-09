"use client";

import { Onde } from "./onde";
import { useAssistantVoix } from "./AssistantVoix";

/** Scène 2 — « D'où vient cette voix ? » Deux grandes affiches : décrire un timbre (l'IA aide à l'écrire, puis le génère) ou fournir un
 * audio / une vidéo à cloner. Le choix s'enregistre tout de suite ; la scène 3 et la scène « Référence » s'y adaptent. */
export function SceneOrigine() {
  const { source, choisirSource } = useAssistantVoix();
  return (
    <>
      <p className="cn-acte">Scène 2 · Origine</p>
      <h2 className="cn-titre">
        D&rsquo;où vient <em>cette voix</em> ?
      </h2>
      <p className="cn-sous">Deux chemins. Le reste de l&rsquo;assistant s&rsquo;adapte à ton choix.</p>
      <div className="cn-duo" role="group" aria-label="Origine de la voix">
        <button type="button" className="cn-affiche" aria-pressed={source === "design"} onClick={() => choisirSource("design")}>
          <div className="av-affiche-visuel">
            <Onde graine="decrire" n={34} />
          </div>
          <span className="cn-gros">Je la décris</span>
          <p>On imagine un timbre. L&rsquo;IA aide à l&rsquo;écrire, puis le génère.</p>
        </button>
        <button type="button" className="cn-affiche" aria-pressed={source === "reference"} onClick={() => choisirSource("reference")}>
          <div className="av-affiche-visuel">
            <div className="cn-pile">
              <i />
              <i />
              <i>▶</i>
            </div>
          </div>
          <span className="cn-gros">Je la fournis</span>
          <p>Un audio ou une vidéo existants, à cloner.</p>
        </button>
      </div>
    </>
  );
}
