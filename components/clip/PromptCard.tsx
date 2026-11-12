"use client";

import { EVENEMENT_ONGLET } from "@/components/clip/ClipDrawer";

/** The prompt is the last of the clip's references: the text that describes the video. Its card, under the reference boxes, shows an excerpt and opens the
 * drawer where it is read, retouched and its versions found. */
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
