"use client";

import { useRef, useState } from "react";
import { cleDemoCreativite, cleDemoStyle, type DemoDispo } from "@/lib/h3ir/demos";
import { choisirMiseEnScene, miseEnSceneDuStyle } from "@/lib/conception-ui";
import { EXEMPLE_AUCUN_STYLE, EXEMPLE_CREATIVITE, EXEMPLE_STYLE, FILMS_STYLE, SCENE_EXEMPLE } from "@/lib/h3ir/exemples";
import { IDS_PROFILS_PERSO } from "@/lib/h3ir/profils-perso";
import { AIDE_CREATIVITE, CREATIVITES, LIBELLE_CREATIVITE, LIBELLE_STYLE_CAMERA, STYLE_AUCUN, estMiseEnScene, estStyleCamera, type ChoixMiseEnScene } from "@/lib/h3ir/reglages";
import { STYLES_CAMERA } from "@/lib/h3ir/styles-camera";
import { CarteMiseEnScene, ChoixMise, ChoixStyleMise, Pastilles, type CarteChoisie } from "./CarteMiseEnScene";
import { EnteteScene } from "./Scenes";
import type { PropsScene } from "./types";

/** Sixième scène : la mise en scène des fiches que compilera Open H3 IR. Deux petits choix sur un même écran : la créativité (jusqu'où l'IA peut ajouter à ce que tu
 * écris) et le style de mise en scène (« aucun style », les façons de filmer d'animation et de genre, puis les sept réalisateurs, chacun résumé en quelques mots). Le style du projet
 * (étape précédente) peut recommander une façon de filmer : sa carte passe en tête, « suggérée par ton style », et reste cochée tant qu'on n'a pas choisi soi-même (conception-ui.ts).
 * Pour se projeter : chaque bouton a son « ? » qui ouvre un tiroir, une CARTE DE MISE EN SCÈNE avec un rendu vidéo réel d'une même scène (components/conception/CarteMiseEnScene.tsx,
 * vidéos produites par `npm run mises-en-scene`), et sous chaque bloc un court rappel du choix en cours (lib/h3ir/exemples.ts). Les valeurs de départ sont cochées : on peut continuer sans
 * toucher à rien. Ce n'est PAS dit au scénariste (ces réglages ne servent qu'aux prompts vidéo) et ils ne sont pas figés : ils se changent ensuite dans le Brief, sur une scène ou sur un plan. */
export function SceneMiseEnScene({ etat, maj, demos = {} }: PropsScene & { demos?: Record<string, DemoDispo> }) {
  const [carte, setCarte] = useState<CarteChoisie | null>(null);
  // Le bouton « ? » qui a ouvert la carte : le focus y revient à la fermeture.
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
  // La recommandation du style du projet (null : style libre ou sans recommandation) ; sa carte passe en tête.
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

/** Une carte de style de mise en scène (rendu commun : ChoixStyleMise) branchée sur l'état de la conception. `suggere` : la recommandation du style du projet, marquée comme telle. */
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
