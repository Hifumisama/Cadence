"use client";

import { useEffect, useRef } from "react";
import { rappelleDe } from "@/lib/h3ir/apercu-style";
import { NARRATION_DEMOS, REPLIQUES_DEMOS, type DemoDispo } from "@/lib/h3ir/demos";
import {
  AJOUTS_CREATIVITE,
  EXEMPLE_AUCUN_STYLE,
  EXEMPLE_CREATIVITE,
  EXEMPLE_STYLE,
  FILMS_STYLE,
  PASTILLES_CREATIVITE,
  QUAND_AUCUN_STYLE,
  QUAND_CREATIVITE,
  QUAND_STYLE,
} from "@/lib/h3ir/exemples";
import {
  AIDE_CREATIVITE,
  DETAIL_STYLE_CAMERA,
  LIBELLE_CREATIVITE,
  RESUME_STYLE_CAMERA,
  STYLE_AUCUN,
  estMiseEnScene,
  estProfilPerso,
  estStyleCamera,
  signatureChoix,
  type ChoixMiseEnScene,
  type Creativite,
} from "@/lib/h3ir/reglages";
import { MotsMise, VisuelMise } from "./VisuelMise";

/** Ce que la carte montre : un style de mise en scène (« aucun », l'un des 7 réalisateurs ou un profil perso) ou un niveau de créativité. */
export type CarteChoisie = { genre: "style"; id: string } | { genre: "creativite"; id: Creativite };

/** Ce que ce niveau de créativité peut ajouter, d'un coup d'œil : une pastille par ajout, allumée ou non (✓ / ✕ : jamais la couleur seule). */
export function Pastilles({ creativite }: { creativite: Creativite }) {
  return (
    <ul className="cn-pastilles" aria-label="Ce que ce niveau peut ajouter">
      {PASTILLES_CREATIVITE.map((p) => {
        const oui = AJOUTS_CREATIVITE[creativite][p.cle];
        return (
          <li key={p.cle} className={`cn-pastille${oui ? " is-on" : ""}`} aria-label={`${p.libelle} : ${oui ? "oui" : "non"}`}>
            {p.libelle}
          </li>
        );
      })}
    </ul>
  );
}

/** Un bouton de choix de mise en scène (titre, sous-titre, étiquette éventuelle) et son « ? » qui ouvre la carte : le rendu commun de l'écran « Mise en scène » de la
 * conception (SceneMiseEnScene) et de la fenêtre de choix du style d'un projet, d'une scène ou d'un plan (components/h3ir/FenetreStyleMiseEnScene.tsx). Sans `aide`, pas de « ? ». */
export function ChoixMise({
  titre,
  sous,
  tag,
  presse,
  onChoisir,
  aide,
  suggere = false,
  className,
  visuel,
  detail,
}: {
  titre: string;
  sous: string;
  /** Un visuel en tête de carte (VisuelMise) : image fixe de la démo ou pictogramme. */
  visuel?: React.ReactNode;
  /** Sous le sous-titre : mots-clés, « Rappelle… ». */
  detail?: React.ReactNode;
  /** Petite étiquette au-dessus du titre (« Suggéré par ton style », « Hérité »…). */
  tag?: string;
  presse: boolean;
  onChoisir: () => void;
  aide?: { label: string; onOuvrir: (e: React.MouseEvent<HTMLButtonElement>) => void };
  suggere?: boolean;
  /** Classe de plus sur l'enveloppe (la fenêtre de choix y met la sienne, indépendante des feuilles de la conception). */
  className?: string;
}) {
  return (
    <div className={`cn-choix${suggere ? " is-suggere" : ""}${className ? ` ${className}` : ""}`}>
      <button type="button" className="cn-mise" aria-pressed={presse} onClick={onChoisir}>
        {visuel}
        {tag ? <em className="cn-mise-tag">{tag}</em> : null}
        <b>{titre}</b>
        <span>{sous}</span>
        {detail}
      </button>
      {aide ? (
        <button type="button" className="cn-choix-aide" aria-label={aide.label} aria-haspopup="dialog" onClick={aide.onOuvrir}>
          ?
        </button>
      ) : null}
    </div>
  );
}

/** Le choix d'un style de mise en scène (un réalisateur ou un profil perso) : titre = son résumé, sous-titre = « style de … » ou, pour un profil perso, ce qu'il fait. */
export function ChoixStyleMise({
  id,
  presse,
  onChoisir,
  onAide,
  suggere = false,
  className,
  affiche,
  avecVisuel = false,
}: {
  id: ChoixMiseEnScene;
  /** Avec `avecVisuel` : l'image fixe de la démo (`DemoDispo.affiche`), ou null pour le pictogramme. */
  affiche?: string | null;
  /** Montre le visuel, les trois mots-clés et la ligne « Rappelle » (la fenêtre de choix) ; sans, la carte reste en texte (écran de conception). */
  avecVisuel?: boolean;
  presse: boolean;
  onChoisir: () => void;
  onAide: (e: React.MouseEvent<HTMLButtonElement>) => void;
  suggere?: boolean;
  className?: string;
}) {
  const signature = signatureChoix(id);
  const rappelle = rappelleDe(id);
  return (
    <ChoixMise
      visuel={avecVisuel ? <VisuelMise id={id} affiche={affiche} /> : undefined}
      detail={
        avecVisuel ? (
          <>
            <MotsMise id={id} />
            {rappelle ? <small className="cn-rappelle">{estStyleCamera(id) ? "Pense à" : "Rappelle"} : {rappelle}</small> : null}
          </>
        ) : undefined
      }
      titre={RESUME_STYLE_CAMERA[id]}
      sous={signature || DETAIL_STYLE_CAMERA[id]}
      tag={suggere ? "Suggéré par ton style" : undefined}
      presse={presse}
      onChoisir={onChoisir}
      aide={{ label: `Voir un exemple : ${RESUME_STYLE_CAMERA[id]}${signature ? `, ${signature}` : ""}`, onOuvrir: onAide }}
      suggere={suggere}
      className={className}
    />
  );
}

/** Le tiroir « carte de mise en scène » : un rendu VIDÉO réel de la scène de démo (lib/h3ir/demos.ts) dans ce style ou à ce niveau, ce que le choix change, les films à connaître et
 * quand le choisir. Sans vidéo produite, il garde le texte d'exemple et le dit. Échap, un clic à côté ou la croix le ferment ; « Choisir » sélectionne et ferme. Les vidéos se lisent à
 * la demande, SON ACTIVÉ (la musique et les voix font partie de la différence). */
export function CarteMiseEnScene({
  carte,
  demo,
  courant,
  onChoisir,
  onFermer,
}: {
  carte: CarteChoisie;
  demo: DemoDispo | null;
  /** C'est le choix déjà retenu à l'écran. */
  courant: boolean;
  onChoisir: () => void;
  onFermer: () => void;
}) {
  const fermer = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    fermer.current?.focus();
    const echap = (e: KeyboardEvent) => e.key === "Escape" && onFermer();
    document.addEventListener("keydown", echap);
    return () => document.removeEventListener("keydown", echap);
  }, [onFermer]);

  const style = carte.genre === "style" && estMiseEnScene(carte.id) ? carte.id : null;
  const creativite = carte.genre === "creativite" ? carte.id : null;
  const titre = creativite ? LIBELLE_CREATIVITE[creativite] : style ? RESUME_STYLE_CAMERA[style] : "Aucun style";
  const sousTitre = creativite ? AIDE_CREATIVITE[creativite] : style ? signatureChoix(style) || "façon de filmer" : "l'IA décide";
  const exemple = creativite ? EXEMPLE_CREATIVITE[creativite] : style ? EXEMPLE_STYLE[style] : EXEMPLE_AUCUN_STYLE;
  const quand = creativite ? QUAND_CREATIVITE[creativite] : style ? QUAND_STYLE[style] : QUAND_AUCUN_STYLE;
  const etiquette = creativite ? "Carte de créativité" : "Carte de mise en scène";

  return (
    <div className="cn-tiroir-fond" onClick={onFermer}>
      <aside className="cn-tiroir" role="dialog" aria-modal="true" aria-label={`${etiquette} : ${titre}`} onClick={(e) => e.stopPropagation()}>
        <header className="cn-tiroir-hd">
          <span className="cn-tiroir-etiquette">{etiquette}</span>
          <button ref={fermer} type="button" className="cn-tiroir-fermer" onClick={onFermer} aria-label="Fermer la carte">
            ×
          </button>
        </header>
        <div className="cn-tiroir-corps">
          <h2 className="cn-tiroir-titre">{titre}</h2>
          <p className="cn-tiroir-sous">{sousTitre}</p>

          {demo ? (
            <video className="cn-carte-video" src={demo.video} poster={demo.affiche ?? undefined} controls loop playsInline preload="metadata" aria-label={`Rendu de la scène de démo : ${titre}`} />
          ) : (
            <div className="cn-carte-video is-vide">
              <b>Vidéo pas encore produite</b>
              <span>En attendant, voici ce que ce choix donnerait sur la scène de démo.</span>
            </div>
          )}

          <div className="cn-carte-scene">
            <p>
              <b>La scène</b> : {NARRATION_DEMOS}
            </p>
            {carte.genre === "style" ? (
              <ul>
                {REPLIQUES_DEMOS.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            ) : (
              <p className="cn-carte-sans">Dans cette démo la scène n&rsquo;a pas de réplique : c&rsquo;est elle qui montre ce qu&rsquo;ajoute chaque niveau.</p>
            )}
          </div>

          {creativite ? <Pastilles creativite={creativite} /> : null}
          {!demo ? <p className="cn-carte-texte">{exemple}</p> : null}

          {style ? (
            <>
              <h3 className="cn-carte-mini">Ce que tu remarqueras</h3>
              <p className="cn-carte-texte">{DETAIL_STYLE_CAMERA[style]}</p>
              {estStyleCamera(style) ? (
                <>
                  <h3 className="cn-carte-mini">Pense à</h3>
                  <p className="cn-carte-texte cn-carte-films">{FILMS_STYLE[style].join(" · ")}</p>
                </>
              ) : null}
            </>
          ) : null}
          <h3 className="cn-carte-mini">Quand le choisir</h3>
          <p className="cn-carte-texte">{quand}</p>

          <p className="cn-carte-note">
            {demo ? "Rendu réel d’Open H3 IR, sur des images de référence neutres. " : ""}
            {creativite
              ? "La créativité règle ce que l'IA a le droit d'ajouter et à quel point elle pousse la caméra."
              : style && estProfilPerso(style)
                ? "Cette façon de filmer règle surtout le mouvement, le rythme, la caméra et les sons. L'apparence (matière, dessin, couleurs) vient du style de ton projet et de tes images de référence : choisis-les dans le même esprit."
                : "Avec tes propres images, la lumière et les couleurs suivront surtout tes références : le style joue sur la caméra, le cadrage, le jeu, les sons et la musique."}
          </p>
        </div>
        <footer className="cn-tiroir-pied">
          <button type="button" className="btn btn-gold" onClick={onChoisir} disabled={courant}>
            {courant ? "Déjà choisi" : creativite ? "Choisir ce niveau" : style || carte.id === STYLE_AUCUN ? "Choisir ce style" : "Choisir"}
          </button>
          <button type="button" className="btn" onClick={onFermer}>
            Fermer
          </button>
        </footer>
      </aside>
    </div>
  );
}
