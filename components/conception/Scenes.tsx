"use client";

import { useMemo, type ReactNode } from "react";
import {
  DUREE_EXPERIMENTALE_SECONDES,
  EPISODES_MAX,
  EPISODES_MIN,
  GENRES,
  GENRES_MAX,
  LANGUES_DIALOGUES,
  PLAGES_RYTHME,
  POSITION_DUREE_MAX,
  REPERES_DUREE,
  SANS_DIALOGUE,
  dureeDepuisPosition,
  motDuTon,
  plansEstimes,
  positionDepuisDuree,
} from "@/lib/conception";
import { ajusterTon, basculerGenre, minutesSecondes, reinitialiserTon, SERIES_DISPONIBLES } from "@/lib/conception-ui";
import { Curseur } from "./Curseur";
import type { PropsScene } from "./types";

/** Les quatre premières scènes de la conception : format, genre et ton, durée et rythme, langue. La scène du style est à part
 * (SceneStyle.tsx). Chaque scène ne fait qu'afficher l'état et le modifier par `maj` ; les règles vivent dans lib/conception-ui.ts. */

export function EnteteScene({ acte, titre, sous }: { acte: string; titre: ReactNode; sous: string }) {
  return (
    <>
      <p className="cn-acte">{acte}</p>
      <h1 className="cn-titre">{titre}</h1>
      <p className="cn-sous">{sous}</p>
    </>
  );
}

/* ---------------------------------------------------------------- 1. Format */

const BANDE = "COMING SOON · COMING SOON · COMING SOON · COMING SOON · COMING SOON · COMING SOON · ";

export function SceneFormat({ etat, maj }: PropsScene) {
  return (
    <>
      <EnteteScene acte="Acte 01" titre={<>Qu’est-ce qu’on <em>tourne</em> ?</>} sous="Le plus simple d’abord. Le reste s’adaptera à ce choix." />
      <div className="cn-duo">
        <button type="button" className="cn-affiche" aria-pressed={etat.format === "film"} onClick={() => maj((e) => ({ ...e, format: "film" }))}>
          <span className="cn-visuel" aria-hidden="true"><span className="cn-scope" /></span>
          <span className="cn-gros">Film</span>
          <p>Une histoire, un seul bloc, une fin.</p>
        </button>
        <button
          type="button"
          className={`cn-affiche${SERIES_DISPONIBLES ? "" : " is-bientot"}`}
          aria-pressed={etat.format === "serie"}
          disabled={!SERIES_DISPONIBLES}
          onClick={() => maj((e) => ({ ...e, format: "serie" }))}
        >
          <span className="cn-visuel" aria-hidden="true">
            <span className="cn-pile"><i /><i /><i /></span>
          </span>
          <span className="cn-gros">Série</span>
          <p>Des épisodes qui se suivent, un fil qui court d’un épisode à l’autre.</p>
          {SERIES_DISPONIBLES ? null : (
            <>
              <span className="cn-police" aria-hidden="true"><i>{BANDE}</i></span>
              <span className="cn-police is-croise" aria-hidden="true"><i>{BANDE}</i></span>
              <span className="cn-sr-seul">Bientôt disponible</span>
            </>
          )}
        </button>
      </div>
      <div className={`cn-episodes${etat.format === "serie" ? " is-on" : ""}`} aria-hidden={etat.format !== "serie"}>
        <button type="button" className="btn cn-pas" aria-label="Un épisode de moins" disabled={etat.format !== "serie"} onClick={() => maj((e) => ({ ...e, episodes: Math.max(EPISODES_MIN, e.episodes - 1) }))}>−</button>
        <output>{etat.episodes}</output>
        <button type="button" className="btn cn-pas" aria-label="Un épisode de plus" disabled={etat.format !== "serie"} onClick={() => maj((e) => ({ ...e, episodes: Math.min(EPISODES_MAX, e.episodes + 1) }))}>+</button>
        <span>épisodes prévus (indicatif, modifiable plus tard)</span>
      </div>
    </>
  );
}

/* ----------------------------------------------------------- 2. Genre et ton */

function phraseTon(ton: number): string {
  if (ton <= 18) return "Couleurs chaudes, humour, gestes francs.";
  if (ton <= 38) return "Optimiste, rythme vif, enjeux qui ne pèsent pas.";
  if (ton <= 62) return "Un mélange : ni tout à fait gai, ni tout à fait grave.";
  if (ton <= 82) return "Enjeux lourds, silences, lumière contrastée.";
  return "Menace, noirceur, peu d’espoir visible.";
}

const NB_BARRES = 64;

export function SceneGenreTon({ etat, maj }: PropsScene) {
  const barres = useMemo(
    () => Array.from({ length: NB_BARRES }, (_, k) => 14 + Math.abs(Math.sin(k * 0.55) * 34) + Math.abs(Math.sin(k * 0.17 + 1) * 28)),
    [],
  );
  const seuil = Math.round((etat.ton / 100) * NB_BARRES);
  return (
    <>
      <EnteteScene acte="Acte 02" titre={<>Quel <em>univers</em>, quelle <em>couleur</em> ?</>} sous="Le genre règle le ton de départ ; tu peux l’ajuster à la main, comme tu veux." />
      <div className="cn-nuage" role="group" aria-label="Genres">
        {GENRES.map((g) => (
          <button
            key={g.nom}
            type="button"
            className="cn-bulle"
            style={{ fontSize: `${(22 + (g.poids - 2.2) * 10).toFixed(0)}px` }}
            aria-pressed={etat.genres.includes(g.nom)}
            onClick={() => maj((e) => basculerGenre(e, g.nom))}
          >
            {g.nom}
          </button>
        ))}
      </div>
      <p className="cn-compte">
        {etat.genres.length ? (
          <><b>{etat.genres.join(" + ")}</b> — {GENRES_MAX} genres au maximum, le plus récent remplace le plus ancien.</>
        ) : (
          "Choisis un genre, ou deux pour un mélange. L’ambiance de la salle change avec eux."
        )}
      </p>

      <div className="cn-ton">
        <p className="cn-ton-mot" aria-live="polite" style={{ letterSpacing: `${(((etat.ton - 50) / 50) * 0.04).toFixed(3)}em` }}>
          {motDuTon(etat.ton).replace(/^./, (c) => c.toUpperCase())}
        </p>
        <p className="cn-ton-sous">{phraseTon(etat.ton)}</p>
        <Curseur className="cn-fader" valeur={etat.ton} min={0} max={100} etiquette="Ton : de lumineux à sombre" texteValeur={motDuTon(etat.ton)} onChange={(v) => maj((e) => ajusterTon(e, v))}>
          <div className="cn-onde" aria-hidden="true">
            {barres.map((h, k) => (
              <i key={k} className={k < seuil ? "is-on" : ""} style={{ height: `${h * (0.4 + etat.ton / 100)}%` }} />
            ))}
          </div>
          <div className="cn-poignee" style={{ left: `${etat.ton}%` }} aria-hidden="true" />
        </Curseur>
        <div className="cn-fader-bord" aria-hidden="true"><span>Lumineux</span><span>Sombre</span></div>
        <p className="cn-ton-info">
          {etat.tonAjuste ? "Ajusté à la main" : etat.genres.length ? `Calé sur ${etat.genres.join(" + ")}` : "Valeur neutre (aucun genre choisi)"}
          <span className={`cn-tag${etat.tonAjuste ? " is-or" : ""}`}>{etat.tonAjuste ? "ajusté" : "par défaut"}</span>
          {etat.tonAjuste && etat.genres.length ? (
            <> <button type="button" className="cn-lien" onClick={() => maj(reinitialiserTon)}>Revenir au ton du genre</button></>
          ) : null}
        </p>
      </div>
    </>
  );
}

/* ------------------------------------------------------ 3. Durée et rythme */

const PRESETS = [60, 120, 180, 300, 600, 1800, 3600, 5400] as const;
const MAX_CASES = 120;
const RYTHMES = [
  { id: "lent", nom: "Lent" },
  { id: "mesure", nom: "Mesuré" },
  { id: "rapide", nom: "Rapide" },
  { id: "variable", nom: "Variable" },
] as const;

export function SceneDuree({ etat, maj }: PropsScene) {
  const plans = plansEstimes(etat.duree, etat.rythme);
  const plage = PLAGES_RYTHME[etat.rythme];
  // Au-delà de MAX_CASES plans, une case en représente plusieurs (une bande de plusieurs centaines de cases ne dirait plus rien).
  const parCase = Math.max(1, Math.ceil(plans.moyen / MAX_CASES));
  const blocs = useMemo(() => {
    // Largeur de chaque case : la même partout, sauf au rythme « variable » où elle varie de façon stable (suite déterministe).
    return Array.from({ length: Math.ceil(plans.moyen / parCase) }, (_, k) => (etat.rythme === "variable" ? 5 + ((k * 7919) % 11) : (plage.min + plage.max) / 2) * parCase);
  }, [plans.moyen, parCase, etat.rythme, plage.min, plage.max]);
  const film = etat.format === "film";
  const poser = (duree: number) => maj((e) => ({ ...e, duree, dureeChoisie: true }));
  return (
    <>
      <EnteteScene acte="Acte 03" titre={<>Combien de <em>temps</em> ?</>} sous={film ? "La durée du film et le rythme fixent le nombre de plans que le scénario devra écrire." : "La durée d’un épisode et le rythme fixent le nombre de plans que le scénario devra écrire."} />
      <p className="cn-grande-duree">{minutesSecondes(etat.duree)}{film ? null : <small>par épisode</small>}</p>
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
        etiquette={film ? "Durée du film" : "Durée de l’épisode"}
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
      <div className="cn-bande" aria-hidden="true" key={`${etat.duree}-${etat.rythme}`}>
        {blocs.map((w, k) => (
          <i key={k} title={`Plan ${k + 1} · ≈ ${w} s`} style={{ ["--w" as string]: w, ["--k" as string]: Math.min(k, 40) }}>
            {blocs.length <= 30 || k % 5 === 4 ? k + 1 : ""}
          </i>
        ))}
      </div>
      <div className="cn-bande-axe" aria-hidden="true"><span>0 s</span><span>{parCase === 1 ? "1 case = 1 plan, largeur = durée" : `1 case ≈ ${parCase} plans`}</span></div>
      <p className="cn-bande-legende">≈ <b>{plans.min} à {plans.max} plans</b> · compter <b>{plans.moyen}</b> en moyenne</p>
      <div className="cn-rythmes" role="group" aria-label="Rythme">
        {RYTHMES.map((r) => (
          <button key={r.id} type="button" className="cn-rythme" aria-pressed={etat.rythme === r.id} onClick={() => maj((e) => ({ ...e, rythme: r.id, dureeChoisie: true }))}>
            <b>{r.nom}</b>
            <span>{r.id === "variable" ? "5–15 s, selon la scène" : `${PLAGES_RYTHME[r.id].min}–${PLAGES_RYTHME[r.id].max} s par plan`}</span>
          </button>
        ))}
      </div>
    </>
  );
}

/* ---------------------------------------------------------------- 4. Langue */

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
      <EnteteScene acte="Acte 04" titre={<>Dans quelle <em>langue</em> ?</>} sous="Les dialogues parlés. Le français est présélectionné ; « Sans dialogue » coupe la parole." />
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
      <p className="cn-note">Les dix langues que le modèle vidéo sait parler. Les prompts restent écrits en anglais.</p>
    </>
  );
}
