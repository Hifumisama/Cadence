"use client";

import "@/components/conception/conception.css";
import "./brief.css";
import { useState } from "react";
import { urlMiniature } from "@/lib/thumbnails";

/** An image to show for the style: the project's presentation image, or the preview of a common scene (`lib/styles/subjects.ts`). */
export type VignetteStyle = { id: string; libelle: string; teste: string; /** « 2:3 », « 16:9 »… */ aspect: string; /** Chemin sous `/api/media/styles/`. */ fichier: string };

export type StyleBriefVue = {
  nom: string;
  /** Image clause (English, long): generates the reference images. Empty for a project without design. */
  promptImage: string;
  /** Video clause (English, short): opens each clip description. */
  clause: string;
  /** The project's presentation image (first if it exists), then the library previews, in the order of the common scenes. */
  vignettes: VignetteStyle[];
};

/** The project's style, FIXED (read-only), presented as in the creation assistant (/nouveau, « style » scene): the image and the name,
 * then the image clause and the video clause in full. If the style has several images (previews already generated), small
 * thumbnails let you see the other scenes; without an image, or with only one, there is no selector. The `cn-*` classes are
 * those of the design (conception.css). */
export function StyleBrief({ style }: { style: StyleBriefVue }) {
  const [choisie, setChoisie] = useState(0);
  const vignette = style.vignettes[choisie] ?? style.vignettes[0] ?? null;
  const url = (v: VignetteStyle, largeur: 384 | 768) => urlMiniature(`/api/media/styles/${v.fichier}`, largeur);

  return (
    <div className="bf-carte bf-style-vue bf-reveal">
      <div className="bf-style-visuel">
        {vignette ? (
          <>
            <span className="cn-apercu" style={{ display: "block", ["--ar" as string]: vignette.aspect.replace(":", " / ") }}>
              {/* eslint-disable-next-line @next/next/no-img-element -- media storage, resized by the route */}
              <img src={url(vignette, 768)} alt={`Aperçu du style ${style.nom || "du projet"} : ${vignette.libelle}`} decoding="async" />
            </span>
            {style.vignettes.length > 1 ? (
              <div className="cn-sujets bf-style-sujets" role="group" aria-label="Autres images du style">
                {style.vignettes.map((v, i) => (
                  <button key={v.id} type="button" className="cn-puce" aria-pressed={i === choisie} title={v.teste} onClick={() => setChoisie(i)}>
                    {v.libelle}
                  </button>
                ))}
              </div>
            ) : null}
            {vignette.teste ? <p className="bf-aide">{vignette.teste}</p> : null}
          </>
        ) : (
          <span className="cn-apercu is-vide" style={{ display: "block", ["--ar" as string]: "2 / 3" }}>
            <em>pas d&rsquo;aperçu</em>
          </span>
        )}
      </div>

      <div className="bf-style-texte">
        <div className="bf-tete">
          <span className="bf-etiquette">Style</span>
          <span className="bf-fige" title="Choisi à la conception du projet : il ne se modifie pas ici.">fixé</span>
        </div>
        <h3 className="bf-style-titre">{style.nom || "Style libre"}</h3>

        <div className="cn-champ">
          <span>Clause d&rsquo;image : génère les images de référence (personnages, lieux)</span>
          {style.promptImage ? (
            <p lang="en" className="bf-clause">
              {style.promptImage}
            </p>
          ) : (
            <p className="bf-aide">Pas de clause d&rsquo;image propre à ce projet : les images reprennent la clause vidéo.</p>
          )}
        </div>
        <div className="cn-champ">
          <span>Clause vidéo : ouvre chaque description de plan (le rendu seulement)</span>
          <p lang="en" className="bf-clause">
            {style.clause || "—"}
          </p>
        </div>
      </div>
    </div>
  );
}
