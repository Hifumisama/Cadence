"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CarteMiseEnScene, ChoixMise, ChoixStyleMise, type CarteChoisie } from "@/components/conception/CarteMiseEnScene";
import { cleDemoStyle, type DemoDispo } from "@/lib/h3ir/demos";
import { IDS_PROFILS_PERSO } from "@/lib/h3ir/profils-perso";
import { LIBELLE_NIVEAU, RESUME_STYLE_CAMERA, STYLE_AUCUN, type ReglagesResolus } from "@/lib/h3ir/reglages";
import { STYLES_CAMERA } from "@/lib/h3ir/styles-camera";

const FOCUSABLES = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), video[controls], [tabindex]:not([tabindex="-1"])';

/** La fenêtre de choix du style de mise en scène d'un niveau (projet, scène, plan) : une grille de cartes, « Hériter » (valeur vide), « Aucun style », les six façons de filmer
 * d'animation et de genre, puis les sept réalisateurs. Le rendu des cartes est celui de l'écran « Mise en scène » de la conception (ChoixMise, ChoixStyleMise) et leur « ? »
 * ouvre la même carte (CarteMiseEnScene), avec la vidéo de démo quand elle existe (`demos`, lue côté serveur par `demosMiseEnScene`) ; les profils perso n'en ont pas : la carte
 * garde alors son texte d'exemple. Un choix ferme la fenêtre. Échap ferme la carte ouverte, sinon la fenêtre, sans fermer une fenêtre parente (popup de la scène). */
export function FenetreStyleMiseEnScene({
  valeur,
  heritage,
  demos = {},
  onChoisir,
  onFermer,
}: {
  /** "" = hérite, "aucun", ou un choix de mise en scène. */
  valeur: string;
  heritage: ReglagesResolus;
  demos?: Record<string, DemoDispo>;
  onChoisir: (v: string) => void;
  onFermer: () => void;
}) {
  const fenetre = useRef<HTMLDivElement>(null);
  const [carte, setCarte] = useState<CarteChoisie | null>(null);
  const carteRef = useRef(carte);
  carteRef.current = carte;
  const declencheur = useRef<HTMLElement | null>(null);
  const fermerRef = useRef(onFermer);
  fermerRef.current = onFermer;

  const fermerCarte = () => {
    setCarte(null);
    declencheur.current?.focus();
  };
  const fermerCarteRef = useRef(fermerCarte);
  fermerCarteRef.current = fermerCarte;

  useEffect(() => {
    // Le choix en cours (ou le premier) prend le focus à l'ouverture.
    const f = fenetre.current;
    (f?.querySelector<HTMLElement>('.cn-mise[aria-pressed="true"]') ?? f?.querySelector<HTMLElement>(".cn-mise"))?.focus();
    // Capture sur window : Échap et Tab sont traités ici AVANT les écouteurs de document (carte, popup parente), qui ne les voient pas.
    const touche = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        e.preventDefault();
        if (carteRef.current) fermerCarteRef.current();
        else fermerRef.current();
        return;
      }
      if (e.key !== "Tab" || !f) return;
      const zone = carteRef.current ? (f.querySelector<HTMLElement>(".cn-tiroir") ?? f) : f;
      const liste = [...zone.querySelectorAll<HTMLElement>(FOCUSABLES)].filter((el) => !(carteRef.current == null && el.closest(".cn-tiroir")));
      if (liste.length === 0) return;
      const premier = liste[0]!;
      const dernier = liste[liste.length - 1]!;
      const actif = document.activeElement as HTMLElement | null;
      if (!actif || !zone.contains(actif)) {
        e.preventDefault();
        premier.focus();
      } else if (e.shiftKey && actif === premier) {
        e.preventDefault();
        dernier.focus();
      } else if (!e.shiftKey && actif === dernier) {
        e.preventDefault();
        premier.focus();
      }
    };
    window.addEventListener("keydown", touche, true);
    return () => window.removeEventListener("keydown", touche, true);
  }, []);

  const ouvrir = (c: CarteChoisie, e: React.MouseEvent<HTMLButtonElement>) => {
    declencheur.current = e.currentTarget;
    setCarte(c);
  };
  const choisir = (v: string) => {
    onChoisir(v);
    onFermer();
  };
  const demoDe = (c: CarteChoisie): DemoDispo | null => (c.genre === "style" ? (demos[cleDemoStyle(c.id)] ?? null) : null);
  const herite = heritage.styleCamera ? RESUME_STYLE_CAMERA[heritage.styleCamera] : "Aucun style";

  return createPortal(
    <div className="h3-fenetre-fond" onClick={onFermer}>
      <div ref={fenetre} className="h3-fenetre" role="dialog" aria-modal="true" aria-labelledby="h3-fenetre-titre" onClick={(e) => e.stopPropagation()}>
        <header className="h3-fenetre-hd">
          <div>
            <span className="cn-tiroir-etiquette">Open H3 IR</span>
            <h2 id="h3-fenetre-titre">Style de mise en scène</h2>
          </div>
          <button type="button" className="cn-tiroir-fermer" onClick={onFermer} aria-label="Fermer">
            ×
          </button>
        </header>
        <div className="h3-fenetre-corps">
          <p className="tiny-note">
            Une manière de mettre en scène (caméra, cadrage, lumière, jeu, musique) qui ne remplit que ce que ta description et tes images ne précisent pas. Le « ? » de chaque carte montre ce qu&rsquo;elle
            donne sur une même scène.
          </p>
          <div className="cn-mises h3-mises" role="group" aria-label="Hériter ou aucun style">
            <ChoixMise
              className="h3-choix"
              tag="Hériter"
              titre={herite}
              sous={`vient de ${LIBELLE_NIVEAU[heritage.origine.styleCamera]}`}
              presse={valeur === ""}
              onChoisir={() => choisir("")}
            />
            <ChoixMise
              className="h3-choix"
              titre="Aucun style"
              sous="l’IA décide"
              presse={valeur === STYLE_AUCUN}
              onChoisir={() => choisir(STYLE_AUCUN)}
              aide={{ label: "Voir un exemple : aucun style", onOuvrir: (e) => ouvrir({ genre: "style", id: STYLE_AUCUN }, e) }}
            />
          </div>
          <p className="cn-mini">Animation et genres</p>
          <div className="cn-mises h3-mises" role="group" aria-label="Façons de filmer d'animation et de genre">
            {IDS_PROFILS_PERSO.map((p) => (
              <ChoixStyleMise key={p} className="h3-choix" id={p} presse={valeur === p} onChoisir={() => choisir(p)} onAide={(e) => ouvrir({ genre: "style", id: p }, e)} />
            ))}
          </div>
          <p className="cn-mini">Dans le style d&rsquo;un réalisateur</p>
          <div className="cn-mises h3-mises" role="group" aria-label="Style d'un réalisateur">
            {STYLES_CAMERA.map((s) => (
              <ChoixStyleMise key={s} className="h3-choix" id={s} presse={valeur === s} onChoisir={() => choisir(s)} onAide={(e) => ouvrir({ genre: "style", id: s }, e)} />
            ))}
          </div>
        </div>
        {carte ? (
          <CarteMiseEnScene
            carte={carte}
            demo={demoDe(carte)}
            courant={carte.genre === "style" && valeur === carte.id}
            onChoisir={() => {
              setCarte(null);
              choisir(carte.id);
            }}
            onFermer={fermerCarte}
          />
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
