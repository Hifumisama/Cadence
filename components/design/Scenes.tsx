"use client";

import type { ReactNode } from "react";
import {
  DUREE_EXPERIMENTALE_SECONDES,
  INTENTIONS_MUSIQUE,
  LANGUES_DIALOGUES,
  LIBELLES_INTENTION_MUSIQUE,
  REFERENCE_MUSIQUE_MAX,
  POSITION_DUREE_MAX,
  REPERES_DUREE,
  SANS_DIALOGUE,
  dureeDepuisPosition,
  positionDepuisDuree,
} from "@/lib/projects/design";
import { minutesSecondes } from "@/lib/projects/design-ui";
import { Curseur } from "./Cursor";
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

/** Welcome screen: says what we are going to do. A project is a film: there is no format choice. */
export function SceneAccueil() {
  return (
    <>
      <EnteteScene acte="Bienvenue" titre={<>On va <em>générer un film</em> avec l’IA.</>} sous="En quelques choix (durée, langue, style, mise en scène, musique), tu poses le cadre de ton film. Ensuite, un scénariste te pose ses questions pour écrire l’histoire avec toi (genre compris), et la production des images, des voix et des plans peut commencer." />
      <ol className="cn-accueil-etapes">
        <li><b>Tu poses le cadre</b><span>la durée, la langue, le style graphique, la mise en scène et la musique.</span></li>
        <li><b>Tu rencontres le scénariste</b><span>un entretien pour transformer ton idée en scénario.</span></li>
        <li><b>L’IA fabrique le film</b><span>assets, voix, plans, jusqu’au montage.</span></li>
      </ol>
    </>
  );
}

/* ------------------------------------------------------ 2. Duration and rhythm */

const PRESETS = [60, 120, 180, 300, 600, 1800, 3600, 5400] as const;

export function SceneDuree({ etat, maj }: PropsScene) {
  const poser = (duree: number) => maj((e) => ({ ...e, duree, dureeChoisie: true }));
  return (
    <>
      <EnteteScene acte="Acte 02" titre={<>Combien de <em>temps</em> ?</>} sous="La durée visée donne le nombre de plans que le scénario écrira, à peu près." />
      <p className="cn-grande-duree">{minutesSecondes(etat.duree)}</p>
      {etat.duree > DUREE_EXPERIMENTALE_SECONDES ? (
        <p className="cn-note-duree">Au-delà de 10 min, c’est <b>expérimental</b> : le scénario compte des centaines de plans, et le modèle local risque d’y perdre le fil.</p>
      ) : null}
      <Curseur
        className="cn-regle"
        valeur={Math.round(positionDepuisDuree(etat.duree))}
        min={0}
        max={POSITION_DUREE_MAX}
        pas={25}
        pasGrand={100}
        etiquette="Durée du film"
        texteValeur={minutesSecondes(etat.duree)}
        onChange={(position) => poser(dureeDepuisPosition(position))}
      >
        <div className="cn-graduation" aria-hidden="true" />
        <div className="cn-rempli" style={{ width: `${positionDepuisDuree(etat.duree) / 10}%` }} aria-hidden="true" />
        {REPERES_DUREE.map((r) => (
          <span key={r.secondes} className="cn-repere" style={{ left: `${r.position / 10}%` }} aria-hidden="true">{minutesSecondes(r.secondes)}</span>
        ))}
      </Curseur>
      <div className="cn-presets">
        {PRESETS.map((s) => (
          <button key={s} type="button" aria-pressed={etat.duree === s} onClick={() => poser(s)}>{minutesSecondes(s)}</button>
        ))}
      </div>
    </>
  );
}

/* ---------------------------------------------------------------- 3. Language */

const NOMS_LANGUES: Record<string, string> = {
  Français: "Par défaut",
  English: "Anglais",
  日本語: "Japonais",
  한국어: "Coréen",
  中文: "Chinois",
  Deutsch: "Allemand",
  Русский: "Russe",
  Português: "Portugais",
  Español: "Espagnol",
  Italiano: "Italien",
};

export function SceneLangue({ etat, maj }: PropsScene) {
  const choisir = (langue: string) => maj((e) => ({ ...e, langue, langueChoisie: true }));
  return (
    <>
      <EnteteScene acte="Acte 03" titre={<>Dans quelle <em>langue</em> ?</>} sous="Les dialogues parlés. Le français est présélectionné ; « Sans dialogue » coupe la parole." />
      <div className="cn-langues" role="group" aria-label="Langue des dialogues">
        {LANGUES_DIALOGUES.map((l) => (
          <button key={l} type="button" className="cn-langue" aria-pressed={etat.langue === l} onClick={() => choisir(l)}>
            <b>{l}</b>
            <span>{NOMS_LANGUES[l]}</span>
          </button>
        ))}
        <button type="button" className="cn-langue" aria-pressed={etat.langue === SANS_DIALOGUE} onClick={() => choisir(SANS_DIALOGUE)}>
          <b>{SANS_DIALOGUE}</b>
          <span>Musique et sons seulement</span>
        </button>
      </div>
    </>
  );
}

/* ---------------------------------------------------------------- 6. Music */

const AIDES_MUSIQUE: Record<(typeof INTENTIONS_MUSIQUE)[number], string> = {
  aucune: "Pas de musique : seulement les voix, les bruitages et l’ambiance.",
  discrete: "En fond, sous les bruitages. Recommandée.",
  presente: "Elle porte le film, comme dans un clip.",
};

/** The music intention: how present the score is. Its content (genre, instruments, tempo) is deduced in the interview, from the story. */
export function SceneMusique({ etat, maj }: PropsScene) {
  return (
    <>
      <EnteteScene acte="Acte 06" titre={<>Et la <em>musique</em> ?</>} sous="Combien de place elle prend. Le scénariste en déduira le reste (genre, instruments, tempo) à partir de ton histoire." />
      <div className="cn-langues" role="group" aria-label="Place de la musique">
        {INTENTIONS_MUSIQUE.map((m) => (
          <button key={m} type="button" className="cn-langue" aria-pressed={etat.musique === m} onClick={() => maj((e) => ({ ...e, musique: m }))}>
            <b>{LIBELLES_INTENTION_MUSIQUE[m]}</b>
            <span>{AIDES_MUSIQUE[m]}</span>
          </button>
        ))}
      </div>
      {etat.musique === "aucune" ? null : (
        <label className="cn-champ-reference">
          <span>Une référence ? <small>(facultatif)</small></span>
          <input
            type="text"
            maxLength={REFERENCE_MUSIQUE_MAX}
            placeholder="Un peu comme… (un film, un artiste, une ambiance)"
            value={etat.referenceMusique}
            onChange={(e) => {
              const referenceMusique = e.target.value;
              maj((x) => ({ ...x, referenceMusique }));
            }}
          />
        </label>
      )}
      <p className="cn-note">{etat.musique === "aucune" ? "Aucune musique sur aucun plan, quelle que soit la mise en scène." : "La même musique court sur tout le film, sans coupure entre les plans liés."}</p>
    </>
  );
}
