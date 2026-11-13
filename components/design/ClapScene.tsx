"use client";

import { useState } from "react";
import { lancerCreationProjet } from "@/app/creation/actions";
import { modifierNomProjet } from "@/app/projects/actions";
import type { NoteAffichee } from "@/lib/agents/sheet-display";
import { plansEstimes, valeursParDefaut, type Conception } from "@/lib/projects/design";
import { minutesSecondes } from "@/lib/projects/design-ui";
import { urlMiniature } from "@/lib/thumbnails";
import { posterPorteLeTitre } from "@/lib/posters/poster";
import { AfficheZoom } from "@/components/posters/PosterZoom";
import { EnteteScene } from "./Scenes";

/** « Clap » scene: everything gathered on one board (the clapperboard), the project's poster beside it (generated on arrival at the clap, see lib/agents/poster-clap.ts), a title to give, and « Lancer la préparation » which chains the installer (progress page). */

/** `image`: the style's preview (fallback while the poster is being prepared); `poster`: the project's real poster, when it has one. */
export type StyleAffiche = { nom: string; image: string | null; poster?: string | null };
/** The poster's state as seen from the clap (see app/affiches/clap-actions.ts). */
export type AfficheEtat = { etat: "en_cours" | "prete" | "echec" | "indisponible"; src: string | null };

export function AfficheProjet({ conception, style, titre, affiche, reessayer }: { conception: Conception; style: StyleAffiche; titre: string; affiche?: AfficheEtat | null; reessayer?: () => void }) {
  const genres = conception.genres.join(" et ").toLowerCase();
  const reelle = affiche?.src ?? style.poster ?? null;
  const enCours = affiche?.etat === "en_cours";
  // A poster whose title is written into the image (suffix -titre) does not get the title a second time on top.
  const titreDansImage = posterPorteLeTitre(reelle);
  const poster = (
    <aside className={`cn-poster${reelle || style.image ? "" : " is-vide"}${enCours ? " is-attente" : ""}`} aria-label="Affiche du projet" aria-busy={enCours}>
      {/* eslint-disable-next-line @next/next/no-img-element -- media storage, resized by the route */}
      {reelle ? <img src={reelle} alt="" /> : style.image ? <img src={urlMiniature(`/api/media/styles/${style.image}`, 768)} alt="" /> : null}
      <div className="cn-poster-voile" />
      {enCours ? <p className="cn-poster-attente" role="status">{reelle ? "L’affiche se refait…" : "L’affiche se tourne…"}</p> : null}
      {affiche?.etat === "echec" ? (
        <p className="cn-poster-attente is-echec" role="alert">
          L’affiche n’a pas pu se faire.{reessayer ? <> <button type="button" className="cn-lien" onClick={reessayer}>Réessayer</button></> : null}
        </p>
      ) : null}
      {/* Top and bottom, over dark veils: what used to sit in the middle got lost in the image. */}
      <div className="cn-poster-texte">
        <div className="cn-poster-tete">
          <p className="cn-poster-haut">CADENCE PRÉSENTE</p>
          <p className="cn-poster-accroche">Un film {genres}</p>
        </div>
        <div className="cn-poster-pied">
          {titreDansImage ? null : <p className="cn-poster-titre">{titre.trim() || "Titre à venir"}</p>}
          <p className="cn-poster-style">Style · {style.nom}</p>
          <p className="cn-poster-bas">
            {minutesSecondes(conception.dureeSecondes)} · {conception.langue === "Sans dialogue" ? "sans dialogue" : conception.langue}
          </p>
        </div>
      </div>
    </aside>
  );
  // The real poster enlarges on a click (except while it is being redone).
  return reelle && !enCours ? <AfficheZoom src={reelle} titre={titre.trim() || "ce projet"}>{poster}</AfficheZoom> : poster;
}

function Cellule({ cle, valeur, defaut, large }: { cle: string; valeur: string; defaut?: boolean; large?: boolean }) {
  return (
    <div className={large ? "is-large" : undefined}>
      <dt>{cle}</dt>
      <dd className={defaut ? "is-def" : large ? "is-texte" : undefined}>
        {valeur}
        {defaut ? <span className="cn-tag">par défaut</span> : null}
      </dd>
    </div>
  );
}

export function ClapScene({
  projectId,
  nomProjet,
  conception,
  style,
  notes,
  pret,
  affiche,
  reessayer,
  apresTitre,
  miseEnScene,
}: {
  projectId: number;
  nomProjet: string;
  conception: Conception;
  style: StyleAffiche;
  /** The project's staging in a few words (lib/h3ir/settings.ts, `resumeMiseEnScene`), shown on the board; it stays editable in the Brief. */
  miseEnScene?: string;
  notes: NoteAffichee[];
  /** The interview has what it takes to launch the preparation (the screenwriter has the essentials, or the user has spoken). */
  pret: boolean;
  affiche?: AfficheEtat | null;
  reessayer?: () => void;
  /** The title has just been saved (it is written into the poster): the poster must be redone. */
  apresTitre?: () => void;
}) {
  const provisoire = nomProjet === "Sans titre";
  const [titre, setTitre] = useState(provisoire ? "" : nomProjet);
  const [enregistre, setEnregistre] = useState(provisoire ? "" : nomProjet);
  const [frappe, setFrappe] = useState(false);
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  // We do not launch before the poster is ready (otherwise it is skipped); on failure or without a generator, we do not block.
  const afficheAttendue = affiche === null || affiche === undefined || affiche.etat === "en_cours";
  const defauts = valeursParDefaut(conception);
  const plans = plansEstimes(conception.dureeSecondes, conception.rythme);
  const note = (cle: string) => notes.find((n) => n.cle === cle)?.texte || "—";
  const extras = notes.filter((n) => !n.requis && n.texte);

  // The title is in the poster: we save it as soon as we leave the field, and the poster is redone so that it carries the right one.
  const validerTitre = async () => {
    const nom = titre.trim();
    if (!nom || nom === enregistre) return;
    setErreur(null);
    try {
      await modifierNomProjet(projectId, nom);
      setEnregistre(nom);
      apresTitre?.();
    } catch {
      setErreur("Le titre n’a pas pu être enregistré. Réessaie.");
    }
  };

  const lancer = async () => {
    setEnvoi(true);
    setErreur(null);
    setFrappe(false);
    requestAnimationFrame(() => setFrappe(true));
    try {
      const nom = titre.trim();
      if (nom && nom !== nomProjet) await modifierNomProjet(projectId, nom);
      const r = await lancerCreationProjet(projectId);
      if (!r.ok) {
        setErreur(r.erreur);
        setEnvoi(false);
        return;
      }
      // The clapperboard has time to clap before the page changes.
      window.setTimeout(() => window.location.assign(`/p/${projectId}/creation`), 650);
    } catch {
      setErreur("Le lancement a échoué. Réessaie.");
      setEnvoi(false);
    }
  };

  return (
    <>
      <EnteteScene acte="Acte 08" titre={<>Clap, on <em>tourne</em>.</>} sous="Tout ce que nous avons récolté, sur une seule planche. Relis, donne un titre, et on lance la préparation." />
      <div className="cn-clap-layout">
        <AfficheProjet conception={conception} style={style} titre={titre} affiche={affiche} reessayer={reessayer} />
        <div style={{ minWidth: 0 }}>
          <label className="cn-champ-titre">
            Titre
            <input type="text" value={titre} maxLength={120} placeholder="Un titre pour le projet (facultatif)" onChange={(e) => setTitre(e.target.value)} onBlur={() => void validerTitre()} onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }} />
          </label>
          <div className={`cn-claps${frappe ? " is-frappe" : ""}`}>
            <div className="cn-claps-haut" />
            <dl className="cn-claps-grille">
              <Cellule cle="Format" valeur="Film" />
              <Cellule cle="Genre" valeur={conception.genres.join(" + ")} />
              <Cellule cle="Durée" valeur={minutesSecondes(conception.dureeSecondes)} defaut={defauts.duree} />
              <Cellule cle="Plans estimés" valeur={`≈ ${plans.min} à ${plans.max} plans`} defaut={defauts.duree} />
              <Cellule cle="Dialogues" valeur={conception.langue} defaut={defauts.langue} />
              {miseEnScene ? <Cellule cle="Mise en scène" valeur={miseEnScene} /> : null}
              <Cellule cle="L’arc" valeur={note("arc")} large />
              <Cellule cle="La fin" valeur={note("fin")} large />
              <Cellule cle="Le héros et les personnages" valeur={note("personnages")} large />
              {extras.map((n) => <Cellule key={n.cle} cle={n.libelle} valeur={n.texte} large />)}
            </dl>
          </div>
          <div className="cn-lancer">
            <button type="button" className="btn btn-gold cn-clap" disabled={!pret || envoi || afficheAttendue} onClick={() => void lancer()}>{envoi ? "Lancement…" : afficheAttendue ? "L’affiche se tourne…" : "Action ! Lancer la préparation"}</button>
            {!pret ? <p className="cn-manque">Le scénariste n’a pas encore l’essentiel : retourne à l’entretien.</p> : null}
            {erreur ? <p className="cn-erreur" role="alert">{erreur}</p> : null}
          </div>
        </div>
      </div>
    </>
  );
}
