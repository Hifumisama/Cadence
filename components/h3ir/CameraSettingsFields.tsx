"use client";

import { useRef, useState } from "react";
import { Curseur } from "@/components/design/Cursor";
import { Pastilles } from "@/components/design/StagingCard";
import type { DemoDispo } from "@/lib/h3ir/demos";
import {
  AIDE_CREATIVITE,
  CREATIVITES,
  DETAIL_STYLE_CAMERA,
  LIBELLE_CREATIVITE,
  LIBELLE_NIVEAU,
  RESUME_STYLE_CAMERA,
  STYLE_AUCUN,
  estCreativite,
  estMiseEnScene,
  signatureChoix,
  type ReglagesResolus,
} from "@/lib/h3ir/settings";
import { FenetreStyleMiseEnScene } from "./StagingStyleWindow";
import "@/components/conception/conception.css";
import "./h3ir.css";

/** The two Open H3 IR settings of one level (project, scene or clip): the creativity and the staging style. Empty = inherits from the level above (`heritage`: what this
 * level would receive if it set nothing, with the level it comes from). For the style, « Aucun style » is a choice in its own right: it forces the absence of style over a
 * style defined higher up. These settings only serve the sheets compiled by Open H3 IR.
 *
 * Creativity: a four-notch slider (mouse, finger, keyboard), with what the level adds as pills (Pastilles, as at the project design). As long as the level inherits, the slider
 * shows the inherited value set back, « héritée de la scène »; touching it sets an own value, « Revenir à l'héritage » removes it.
 * Style: a button that opens a window of cards (FenetreStyleMiseEnScene); `demos` puts the demo videos there (without them, the sample text). */
export function ChampsReglagesCamera({
  creativite,
  styleCamera,
  onCreativite,
  onStyleCamera,
  heritage,
  idPrefixe,
  demos,
}: {
  creativite: string;
  styleCamera: string;
  onCreativite: (v: string) => void;
  onStyleCamera: (v: string) => void;
  heritage: ReglagesResolus;
  idPrefixe: string;
  /** The demo videos of the staging (lib/media.ts, `demosMiseEnScene`), read server-side; absent = text cards. */
  demos?: Record<string, DemoDispo>;
}) {
  const creativitePropre = estCreativite(creativite) ? creativite : null;
  const creativiteVue = creativitePropre ?? heritage.creativite;
  const styleChoisi = estMiseEnScene(styleCamera) || styleCamera === STYLE_AUCUN ? styleCamera : "";
  // What the displayed style does: the one picked, or the one inherited when nothing is picked.
  const styleVu = estMiseEnScene(styleChoisi) ? styleChoisi : styleChoisi === "" ? heritage.styleCamera : null;
  const [fenetre, setFenetre] = useState(false);
  const bouton = useRef<HTMLButtonElement>(null);
  const fermer = () => {
    setFenetre(false);
    bouton.current?.focus();
  };
  const idx = CREATIVITES.indexOf(creativiteVue);
  const origine = LIBELLE_NIVEAU[heritage.origine.creativite];
  const origineStyle = LIBELLE_NIVEAU[heritage.origine.styleCamera];

  return (
    <>
      <div className="field-group">
        <span className="h3-label" id={`${idPrefixe}-creativite-label`}>
          Créativité
        </span>
        <Curseur
          className={`h3-crans${creativitePropre ? "" : " is-herite"}`}
          valeur={idx}
          min={0}
          max={CREATIVITES.length - 1}
          pasGrand={1}
          etiquette={`Créativité${creativitePropre ? "" : ` (héritée de ${origine})`}`}
          texteValeur={`${LIBELLE_CREATIVITE[creativiteVue]}${creativitePropre ? "" : `, héritée de ${origine}`}`}
          onChange={(i) => onCreativite(CREATIVITES[i]!)}
        >
          <span className="h3-crans-rail" aria-hidden="true">
            <span className="h3-crans-rempli" style={{ width: `${(100 * idx) / (CREATIVITES.length - 1)}%` }} />
            {CREATIVITES.map((c, i) => (
              <span key={c} className={`h3-cran${i <= idx ? " is-atteint" : ""}${i === idx ? " is-courant" : ""}`} style={{ left: `${(100 * i) / (CREATIVITES.length - 1)}%` }} />
            ))}
          </span>
          <span className="h3-crans-noms" aria-hidden="true">
            {CREATIVITES.map((c, i) => (
              <span key={c} className={i === idx ? "is-courant" : undefined}>
                {LIBELLE_CREATIVITE[c]}
              </span>
            ))}
          </span>
        </Curseur>
        <div className="h3-heritage" aria-live="polite">
          {creativitePropre ? (
            <>
              <span>
                Réglée ici : <b>{LIBELLE_CREATIVITE[creativitePropre]}</b>
              </span>
              <button type="button" className="tm-lien" onClick={() => onCreativite("")}>
                Revenir à l&rsquo;héritage ({LIBELLE_CREATIVITE[heritage.creativite]}, {origine})
              </button>
            </>
          ) : (
            <span className="h3-herite">
              Héritée de {origine} : <b>{LIBELLE_CREATIVITE[heritage.creativite]}</b>. Déplace le curseur pour la régler ici.
            </span>
          )}
        </div>
        <Pastilles creativite={creativiteVue} />
        <span className="tiny-note">{AIDE_CREATIVITE[creativiteVue]}</span>
      </div>
      <div className="field-group">
        <span className="h3-label" id={`${idPrefixe}-style-camera-label`}>
          Style de mise en scène
        </span>
        <button
          ref={bouton}
          type="button"
          id={`${idPrefixe}-style-camera`}
          className="h3-style-bouton"
          aria-haspopup="dialog"
          aria-labelledby={`${idPrefixe}-style-camera-label ${idPrefixe}-style-camera`}
          onClick={() => setFenetre(true)}
        >
          <b>{styleChoisi === STYLE_AUCUN ? "Aucun style" : styleVu ? RESUME_STYLE_CAMERA[styleVu] : "Aucun style"}</b>
          <span>
            {styleChoisi === "" ? `hérité de ${origineStyle}` : styleChoisi === STYLE_AUCUN ? "choisi ici : l’IA décide" : `choisi ici${estMiseEnScene(styleChoisi) && signatureChoix(styleChoisi) ? ` · ${signatureChoix(styleChoisi)}` : ""}`}
          </span>
          <em>Changer…</em>
        </button>
        {styleChoisi !== "" ? (
          <button type="button" className="tm-lien h3-revenir" onClick={() => onStyleCamera("")}>
            Revenir à l&rsquo;héritage ({heritage.styleCamera ? RESUME_STYLE_CAMERA[heritage.styleCamera] : "aucun style"}, {origineStyle})
          </button>
        ) : null}
        <span className="tiny-note">
          {styleVu ? DETAIL_STYLE_CAMERA[styleVu] : "Une manière de mettre en scène (caméra, cadrage, lumière, jeu, musique) qui ne remplit que ce que ta description et tes images ne précisent pas."}
        </span>
      </div>
      {fenetre ? <FenetreStyleMiseEnScene valeur={styleChoisi} heritage={heritage} demos={demos} onChoisir={onStyleCamera} onFermer={fermer} /> : null}
    </>
  );
}
