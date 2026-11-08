"use client";

import { useRef, useState } from "react";
import { Curseur } from "@/components/conception/Curseur";
import { Pastilles } from "@/components/conception/CarteMiseEnScene";
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
} from "@/lib/h3ir/reglages";
import { FenetreStyleMiseEnScene } from "./FenetreStyleMiseEnScene";
import "@/components/conception/conception.css";
import "./h3ir.css";

/** Les deux réglages d'Open H3 IR d'un niveau (projet, scène ou plan) : la créativité et le style de mise en scène. Vide = hérite du niveau au-dessus (`heritage` : ce que ce
 * niveau recevrait s'il ne réglait rien, avec le niveau d'où cela vient). Pour le style, « Aucun style » est un choix à part entière : il force l'absence de style par-dessus un
 * style défini plus haut. Ces réglages ne servent qu'aux fiches compilées par Open H3 IR.
 *
 * Créativité : un curseur à quatre crans (souris, doigt, clavier), avec ce que le niveau ajoute en pastilles (Pastilles, comme à la conception). Tant que le niveau hérite, le curseur
 * montre la valeur héritée en retrait, « héritée de la scène » ; le toucher règle une valeur propre, « Revenir à l'héritage » la retire.
 * Style : un bouton qui ouvre une fenêtre de cartes (FenetreStyleMiseEnScene) ; `demos` y met les vidéos de démo (sans elles, le texte d'exemple). */
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
  /** Les vidéos de démo de la mise en scène (lib/media.ts, `demosMiseEnScene`), lues côté serveur ; absentes = cartes en texte. */
  demos?: Record<string, DemoDispo>;
}) {
  const creativitePropre = estCreativite(creativite) ? creativite : null;
  const creativiteVue = creativitePropre ?? heritage.creativite;
  const styleChoisi = estMiseEnScene(styleCamera) || styleCamera === STYLE_AUCUN ? styleCamera : "";
  // Ce que le style affiché fait : celui qu'on choisit, ou celui dont on hérite quand rien n'est choisi.
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
