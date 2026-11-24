"use client";

import type { ReactNode } from "react";
import {
  DUREE_EXPERIMENTALE_SECONDES,
  INTENTIONS_MUSIQUE,
} from "@/lib/projects/design";
import { minutesSecondes } from "@/lib/projects/design-ui";
import { urlMiniature } from "@/lib/thumbnails";
import { Chronometre } from "./Stopwatch";
import { TableauLangues } from "./LanguageBoard";
import { SceneMusicale } from "./MusicStage";
import type { PropsScene } from "./types";

/** The simple scenes of the design: welcome, duration, language, music. The style and staging scenes are separate
 * (SceneStyle.tsx, StagingScene.tsx). Each scene only displays the state and changes it through `maj`; the rules live in lib/projects/design-ui.ts. */

export function EnteteScene({ acte, titre, sous }: { acte: string; titre: ReactNode; sous?: string }) {
  return (
    <>
      <p className="cn-acte">{acte}</p>
      <h1 className="cn-titre">{titre}</h1>
      {sous ? <p className="cn-sous">{sous}</p> : null}
    </>
  );
}

/* ---------------------------------------------------------------- 1. Accueil */

/** Welcome screen: says what we are going to do. A project is a film: there is no format choice. On the right, a wall of the styles' showcase
 * images drifting slowly in three columns (test feedback 2026-11-24: half of the screen was empty). */
export function SceneAccueil({ apercus, action }: { apercus: string[]; action: ReactNode }) {
  const colonnes = [0, 1, 2].map((k) => apercus.filter((_, i) => i % 3 === k));
  return (
    <div className="cn-accueil">
      <div className="cn-accueil-texte">
        <EnteteScene acte="Bienvenue" titre={<>On va <em>générer un film</em> avec l’IA.</>} sous="En quelques choix (durée, langue, style, mise en scène, musique), tu poses le cadre de ton film. Ensuite, un scénariste te pose ses questions pour écrire l’histoire avec toi (genre compris), et la production des images, des voix et des plans peut commencer." />
        <ol className="cn-accueil-etapes">
          <li><b>Tu poses le cadre</b><span>la durée, la langue, le style graphique, la mise en scène et la musique.</span></li>
          <li><b>Tu rencontres le scénariste</b><span>un entretien pour transformer ton idée en scénario.</span></li>
          <li><b>L’IA fabrique le film</b><span>assets, voix, plans, jusqu’au montage.</span></li>
        </ol>
        {action}
      </div>
      {apercus.length ? (
        <div className="cn-mur" aria-hidden="true">
          {colonnes.map((c, k) => (
            <div key={k} className="cn-mur-colonne" style={{ ["--duree" as string]: `${60 + k * 14}s` }}>
              {/* Twice the same list: the loop runs without a jump. */}
              {[...c, ...c].map((id, i) => (
                // eslint-disable-next-line @next/next/no-img-element -- media storage, resized by the route
                <img key={`${id}-${i}`} src={urlMiniature(`/api/media/styles/${id}/apercu.webp`, 384)} alt="" loading="lazy" decoding="async" />
              ))}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------ 2. Duration and rhythm */

const PRESETS = [60, 120, 180, 300, 600, 1800] as const;

/** What a duration feels like, to picture it (2026-11-24). */
function repereDuree(s: number): string {
  if (s <= 45) return "Le temps d’un spot de pub.";
  if (s <= 90) return "Le temps d’un teaser.";
  if (s <= 150) return "Le temps d’une bande-annonce.";
  if (s <= 300) return "Le temps d’un clip musical.";
  if (s <= 600) return "Un court métrage.";
  if (s <= 1200) return "Un court métrage ambitieux.";
  return "Un épisode de série.";
}

export function SceneDuree({ etat, maj }: PropsScene) {
  const poser = (duree: number) => maj((e) => ({ ...e, duree, dureeChoisie: true }));
  return (
    <>
      <EnteteScene acte="Acte 02" titre={<>Combien de <em>temps</em> ?</>} sous="La durée visée donne le nombre de plans que le scénario écrira, à peu près." />
      <div className="cn-duree-mise">
        <Chronometre duree={etat.duree} onChange={poser} />
        <div className="cn-duree-cote">
          <p className="cn-grande-duree">{minutesSecondes(etat.duree)}</p>
          <p className="cn-duree-repere">{repereDuree(etat.duree)}</p>
          {etat.duree > DUREE_EXPERIMENTALE_SECONDES ? (
            <p className="cn-note-duree">Au-delà de 10 min, c’est <b>expérimental</b> : le scénario compte des centaines de plans, et le modèle local risque d’y perdre le fil.</p>
          ) : null}
          <p className="cn-note-chrono">Fais tourner l’aiguille : un tour, c’est 30 minutes. Ou choisis :</p>
          <div className="cn-presets">
            {PRESETS.map((s) => (
              <button key={s} type="button" aria-pressed={etat.duree === s} onClick={() => poser(s)}>{minutesSecondes(s)}</button>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

/* ---------------------------------------------------------------- 3. Language */


export function SceneLangue({ etat, maj }: PropsScene) {
  const choisir = (langue: string) => maj((e) => ({ ...e, langue, langueChoisie: true }));
  return (
    <>
      <EnteteScene acte="Acte 03" titre={<>Dans quelle <em>langue</em> ?</>} sous="Les dialogues parlés. Le français est présélectionné ; « Sans dialogue » coupe la parole." />
      <TableauLangues langue={etat.langue} choisir={choisir} />
    </>
  );
}

/* ---------------------------------------------------------------- 6. Music */

/** The music intention: how present the score is. Its content (genre, instruments, tempo) is deduced in the interview, from the story. */
export function SceneMusique({ etat, maj }: PropsScene) {
  return (
    <>
      <EnteteScene acte="Acte 06" titre={<>Et la <em>musique</em> ?</>} sous="Combien de place elle prend à côté des voix. Son style (genre, instruments, tempo) se décide avec le scénariste, à partir de ton histoire." />
      <SceneMusicale musique={etat.musique} choisir={(m) => maj((e) => ({ ...e, musique: m }))} />
    </>
  );
}
