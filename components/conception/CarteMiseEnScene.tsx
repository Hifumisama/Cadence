"use client";

import { useEffect, useRef } from "react";
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
import { AIDE_CREATIVITE, DETAIL_STYLE_CAMERA, LIBELLE_CREATIVITE, LIBELLE_STYLE_CAMERA, RESUME_STYLE_CAMERA, STYLE_AUCUN, estStyleCamera, type Creativite } from "@/lib/h3ir/reglages";

/** Ce que la carte montre : un style (« aucun » ou l'un des 7 profils) ou un niveau de créativité. */
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

  const style = carte.genre === "style" && estStyleCamera(carte.id) ? carte.id : null;
  const creativite = carte.genre === "creativite" ? carte.id : null;
  const titre = creativite ? LIBELLE_CREATIVITE[creativite] : style ? RESUME_STYLE_CAMERA[style] : "Aucun style";
  const sousTitre = creativite ? AIDE_CREATIVITE[creativite] : style ? `style de ${LIBELLE_STYLE_CAMERA[style]}` : "l'IA décide";
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
              <h3 className="cn-carte-mini">Pense à</h3>
              <p className="cn-carte-texte cn-carte-films">{FILMS_STYLE[style].join(" · ")}</p>
            </>
          ) : null}
          <h3 className="cn-carte-mini">Quand le choisir</h3>
          <p className="cn-carte-texte">{quand}</p>

          <p className="cn-carte-note">
            Rendu réel d&rsquo;Open H3 IR, sur des images de référence neutres.{" "}
            {creativite
              ? "La créativité règle ce que l'IA a le droit d'ajouter et à quel point elle pousse la caméra."
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
