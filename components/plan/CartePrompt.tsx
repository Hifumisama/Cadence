"use client";

import { EVENEMENT_ONGLET } from "@/components/plan/TiroirPlan";

/** Le prompt est la dernière des références du plan : le texte qui décrit la vidéo. Sa carte, sous les cases de références, en montre un extrait et ouvre le
 * tiroir où on le lit, le retouche et retrouve ses versions. */
export function CartePrompt({ extrait, nbMots, nbVersions }: { extrait: string; nbMots: number; nbVersions: number }) {
  const ouvrir = () => window.dispatchEvent(new CustomEvent(EVENEMENT_ONGLET, { detail: "prompt" }));
  return (
    <section className="fp-prompt-carte" aria-label="Prompt du plan">
      <span className="eyebrow">Prompt</span>
      <button type="button" className="fp-prompt-carte-corps" onClick={ouvrir} title="Lire et modifier le prompt">
        <span className={`fp-prompt-extrait${extrait ? "" : " is-vide"}`}>{extrait || "Pas encore de prompt."}</span>
        <span className="fp-prompt-carte-pied num">
          {nbMots} mots{nbVersions > 0 ? ` · ${nbVersions} version${nbVersions > 1 ? "s" : ""}` : ""} · ouvrir
        </span>
      </button>
    </section>
  );
}
