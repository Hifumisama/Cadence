"use client";

import { useRef, useState } from "react";
import { cleDemoCreativite, cleDemoStyle, type DemoDispo } from "@/lib/h3ir/demos";
import { choisirMiseEnScene, miseEnSceneDuStyle } from "@/lib/projects/design-ui";
import { EXEMPLE_AUCUN_STYLE, EXEMPLE_CREATIVITE, EXEMPLE_STYLE, FILMS_STYLE, SCENE_EXEMPLE } from "@/lib/h3ir/examples";
import { IDS_PROFILS_PERSO } from "@/lib/h3ir/character-profiles";
import { AIDE_CREATIVITE, CREATIVITES, LIBELLE_CREATIVITE, LIBELLE_STYLE_CAMERA, STYLE_AUCUN, estMiseEnScene, estStyleCamera, type ChoixMiseEnScene } from "@/lib/h3ir/settings";
import { STYLES_CAMERA } from "@/lib/h3ir/styles-camera";
import { CarteMiseEnScene, ChoixMise, ChoixStyleMise, Pastilles, type CarteChoisie } from "./StagingCard";
import { EnteteScene } from "./Scenes";
import type { PropsScene } from "./types";

/** Sixth scene: the staging of the clips that Open H3 IR will compile. Two small choices on one screen: creativity (how far the AI can add to what you
 * write) and the staging style (« aucun style », the animation and genre ways of filming, then the seven directors, each summed up in a few words). The project's
 * style (previous step) may recommend a way of filming: its card moves to the top, « suggérée par ton style », and stays ticked until one chooses for oneself (design-ui.ts).
 * To picture it: each button has its « ? » which opens a drawer, a STAGING CARD with a real video render of one same scene (components/design/StagingCard.tsx,
 * demo videos versioned in data/mises-en-scene), and under each block a short reminder of the current choice (lib/h3ir/examples.ts). The starting values are ticked: one can continue without
 * touching anything. This is NOT said to the screenwriter (these settings only serve the video prompts) and they are not locked: they are changed afterwards in the Brief, on a scene or on a clip. */
export function SceneMiseEnScene({ etat, maj, demos = {} }: PropsScene & { demos?: Record<string, DemoDispo> }) {
  const [carte, setCarte] = useState<CarteChoisie | null>(null);
  // The « ? » button that opened the card: focus returns to it on closing.
  const declencheur = useRef<HTMLElement | null>(null);
  const ouvrir = (c: CarteChoisie, e: React.MouseEvent<HTMLButtonElement>) => {
    declencheur.current = e.currentTarget;
    setCarte(c);
  };
  const fermer = () => {
    setCarte(null);
    declencheur.current?.focus();
  };
  const styleCourant: ChoixMiseEnScene | null = estMiseEnScene(etat.styleCamera) ? etat.styleCamera : null;
  // The project's style recommendation (null: free style or no recommendation); its card moves to the top.
  const recommande = miseEnSceneDuStyle(etat.style);
  const autresPerso = IDS_PROFILS_PERSO.filter((p) => p !== recommande);

  const demoDe = (c: CarteChoisie): DemoDispo | null => demos[c.genre === "creativite" ? cleDemoCreativite(c.id) : cleDemoStyle(c.id)] ?? null;
  const estCourante = (c: CarteChoisie): boolean => (c.genre === "creativite" ? etat.creativite === c.id : etat.styleCamera === c.id);
  const choisir = (c: CarteChoisie) => {
    if (c.genre === "creativite") maj((e) => ({ ...e, creativite: c.id }));
    else maj((e) => choisirMiseEnScene(e, c.id));
    fermer();
  };

  return (
    <>
      <EnteteScene
        acte="Acte 06"
        titre={
          <>
            Quelle <em>mise en scène</em> ?
          </>
        }
        sous="Jusqu'où l'IA peut ajouter à ce que tu écris, et dans quel esprit elle filme. Les choix de départ conviennent : tu peux continuer sans rien changer. Le « ? » de chaque choix montre un vrai rendu."
      />
      <p className="cn-mini">Créativité</p>
      <div className="cn-rythmes cn-rythmes-haut" role="group" aria-label="Créativité">
        {CREATIVITES.map((c) => (
          <div key={c} className="cn-choix">
            <button type="button" className="cn-rythme" aria-pressed={etat.creativite === c} onClick={() => maj((e) => ({ ...e, creativite: c }))}>
              <b>{LIBELLE_CREATIVITE[c]}</b>
              <span>{AIDE_CREATIVITE[c]}</span>
            </button>
            <button type="button" className="cn-choix-aide" aria-label={`Voir un exemple : créativité ${LIBELLE_CREATIVITE[c]}`} aria-haspopup="dialog" onClick={(e) => ouvrir({ genre: "creativite", id: c }, e)}>
              ?
            </button>
          </div>
        ))}
      </div>
      <div className="cn-aide-boite" aria-live="polite">
        <Pastilles creativite={etat.creativite} />
        <p>{EXEMPLE_CREATIVITE[etat.creativite]}</p>
      </div>

      <p className="cn-mini">Style de mise en scène</p>
      <div className="cn-mises" role="group" aria-label="Style de mise en scène">
        <ChoixMise
          titre="Aucun style"
          sous="l’IA décide"
          presse={etat.styleCamera === STYLE_AUCUN}
          onChoisir={() => maj((e) => choisirMiseEnScene(e, STYLE_AUCUN))}
          aide={{ label: "Voir un exemple : aucun style", onOuvrir: (e) => ouvrir({ genre: "style", id: STYLE_AUCUN }, e) }}
        />
        {recommande ? <CarteChoix id={recommande} etat={etat} maj={maj} ouvrir={ouvrir} suggere /> : null}
      </div>
      {recommande ? (
        <p className="cn-note">{etat.miseEnSceneChoisie ? "Ton style suggère cette façon de filmer, mais tu as choisi autre chose : c'est ton choix qui compte." : "Cochée d'après le style choisi à l'étape précédente. Tu peux prendre autre chose."}</p>
      ) : null}
      <p className="cn-mini">Animation et genres</p>
      <div className="cn-mises" role="group" aria-label="Façons de filmer d'animation et de genre">
        {autresPerso.map((p) => (
          <CarteChoix key={p} id={p} etat={etat} maj={maj} ouvrir={ouvrir} />
        ))}
      </div>
      <p className="cn-mini">Dans le style d&rsquo;un réalisateur</p>
      <div className="cn-mises" role="group" aria-label="Style d'un réalisateur">
        {STYLES_CAMERA.map((s) => (
          <CarteChoix key={s} id={s} etat={etat} maj={maj} ouvrir={ouvrir} />
        ))}
      </div>
      <div className="cn-aide-boite" aria-live="polite">
        <p className="cn-aide-scene">{SCENE_EXEMPLE}</p>
        <p>{styleCourant ? EXEMPLE_STYLE[styleCourant] : EXEMPLE_AUCUN_STYLE}</p>
        {styleCourant && estStyleCamera(styleCourant) ? (
          <p className="cn-aide-films">
            Pense à : <b>{FILMS_STYLE[styleCourant].join(" · ")}</b> ({LIBELLE_STYLE_CAMERA[styleCourant]})
          </p>
        ) : null}
      </div>
      <p className="cn-note">Tu pourras changer tout ça plus tard : dans le Brief du projet, sur une scène ou sur un plan.</p>

      {carte ? <CarteMiseEnScene carte={carte} demo={demoDe(carte)} courant={estCourante(carte)} onChoisir={() => choisir(carte)} onFermer={fermer} /> : null}
    </>
  );
}

/** A staging style card (shared rendering: ChoixStyleMise) wired to the design's state. `suggere`: the project's style recommendation, marked as such. */
function CarteChoix({
  id,
  etat,
  maj,
  ouvrir,
  suggere = false,
}: {
  id: ChoixMiseEnScene;
  etat: PropsScene["etat"];
  maj: PropsScene["maj"];
  ouvrir: (c: CarteChoisie, e: React.MouseEvent<HTMLButtonElement>) => void;
  suggere?: boolean;
}) {
  return <ChoixStyleMise id={id} presse={etat.styleCamera === id} onChoisir={() => maj((e) => choisirMiseEnScene(e, id))} onAide={(e) => ouvrir({ genre: "style", id }, e)} suggere={suggere} />;
}
