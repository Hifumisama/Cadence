"use client";

import "@/components/conception/conception.css";
import "./brief.css";
import { useState } from "react";
import { urlMiniature } from "@/lib/miniatures";

/** Une image à montrer pour le style : celle de présentation du projet, ou l'aperçu d'une scène commune (`lib/styles/sujets.ts`). */
export type VignetteStyle = { id: string; libelle: string; teste: string; /** « 2:3 », « 16:9 »… */ aspect: string; /** Chemin sous `/api/media/styles/`. */ fichier: string };

export type StyleBriefVue = {
  nom: string;
  /** Clause d'image (anglais, longue) : génère les images de référence. Vide pour un projet sans conception. */
  promptImage: string;
  /** Clause vidéo (anglais, courte) : ouvre chaque description de plan. */
  clause: string;
  /** L'image de présentation du projet (en premier si elle existe) puis les aperçus de la bibliothèque, dans l'ordre des scènes communes. */
  vignettes: VignetteStyle[];
};

/** Le style du projet, FIXE (lecture seule), présenté comme dans l'assistant de création (/nouveau, scène « style ») : l'image et le nom,
 * puis la clause d'image et la clause vidéo en entier. Si le style a plusieurs images (aperçus générés par `npm run styles:apercus`), de
 * petites vignettes permettent de voir les autres scènes ; sans image, ou avec une seule, il n'y a pas de sélecteur. Les classes `cn-*`
 * sont celles de la conception (conception.css). */
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
              {/* eslint-disable-next-line @next/next/no-img-element -- stockage média, redimensionné par la route */}
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
