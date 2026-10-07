"use client";

import { useState } from "react";
import { lancerCreationProjet } from "@/app/creation/actions";
import { modifierNomProjet } from "@/app/projects/actions";
import type { NoteAffichee } from "@/lib/agents/fiche-affichage";
import { motDuTon, plansEstimes, valeursParDefaut, type Conception } from "@/lib/conception";
import { minutesSecondes } from "@/lib/conception-ui";
import { urlMiniature } from "@/lib/miniatures";
import { EnteteScene } from "./Scenes";

/** Scène « Clap » : tout ce qui a été récolté sur une planche (la claquette), l'affiche du projet à côté (générée à l'arrivée sur le clap, voir lib/agents/affiche-clap.ts), un
 * titre à donner, et « Lancer la préparation » qui enchaîne l'installateur (page d'avancée). */

/** `image` : l'aperçu du style (repli pendant que l'affiche se prépare) ; `poster` : l'affiche réelle du projet, quand il en a une. */
export type StyleAffiche = { nom: string; image: string | null; poster?: string | null };
/** L'état de l'affiche vu du clap (voir app/affiches/clap-actions.ts). */
export type AfficheEtat = { etat: "en_cours" | "prete" | "echec" | "indisponible"; src: string | null };

export function AfficheProjet({ conception, style, titre, affiche, reessayer }: { conception: Conception; style: StyleAffiche; titre: string; affiche?: AfficheEtat | null; reessayer?: () => void }) {
  const genres = conception.genres.join(" et ").toLowerCase();
  const reelle = affiche?.src ?? style.poster ?? null;
  const enCours = affiche?.etat === "en_cours";
  return (
    <aside className={`cn-poster${reelle || style.image ? "" : " is-vide"}${enCours ? " is-attente" : ""}`} aria-label="Affiche du projet" aria-busy={enCours}>
      {/* eslint-disable-next-line @next/next/no-img-element -- stockage média, redimensionné par la route */}
      {reelle ? <img src={reelle} alt="" /> : style.image ? <img src={urlMiniature(`/api/media/styles/${style.image}`, 768)} alt="" /> : null}
      <div className="cn-poster-voile" />
      {enCours ? <p className="cn-poster-attente" role="status">{reelle ? "L’affiche se refait…" : "L’affiche se tourne…"}</p> : null}
      {affiche?.etat === "echec" ? (
        <p className="cn-poster-attente is-echec" role="alert">
          L’affiche n’a pas pu se faire.{reessayer ? <> <button type="button" className="cn-lien" onClick={reessayer}>Réessayer</button></> : null}
        </p>
      ) : null}
      <div className="cn-poster-texte">
        <p className="cn-poster-haut">CADENCE PRÉSENTE</p>
        <p className="cn-poster-titre">{titre.trim() || "Titre à venir"}</p>
        <p className="cn-poster-accroche">{conception.format === "serie" ? "Une série" : "Un film"} {genres}, {motDuTon(conception.ton)}</p>
        <p className="cn-poster-style">Style · {style.nom}</p>
        <p className="cn-poster-bas">
          {conception.format === "serie" && conception.episodesPrevus ? `${conception.episodesPrevus} épisodes · ` : ""}
          {minutesSecondes(conception.dureeSecondes)} · {conception.langue === "Sans dialogue" ? "sans dialogue" : conception.langue}
        </p>
      </div>
    </aside>
  );
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
}: {
  projectId: number;
  nomProjet: string;
  conception: Conception;
  style: StyleAffiche;
  notes: NoteAffichee[];
  /** L'entretien a de quoi lancer la préparation (le scénariste a l'essentiel, ou l'utilisateur a parlé). */
  pret: boolean;
  affiche?: AfficheEtat | null;
  reessayer?: () => void;
}) {
  const provisoire = nomProjet === "Sans titre";
  const [titre, setTitre] = useState(provisoire ? "" : nomProjet);
  const [frappe, setFrappe] = useState(false);
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const defauts = valeursParDefaut(conception);
  const plans = plansEstimes(conception.dureeSecondes, conception.rythme);
  const note = (cle: string) => notes.find((n) => n.cle === cle)?.texte || "—";
  const extras = notes.filter((n) => !n.requis && n.texte);

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
      // La claquette a le temps de claquer avant de changer de page.
      window.setTimeout(() => window.location.assign(`/p/${projectId}/creation`), 650);
    } catch {
      setErreur("Le lancement a échoué. Réessaie.");
      setEnvoi(false);
    }
  };

  return (
    <>
      <EnteteScene acte="Acte 07" titre={<>Clap, on <em>tourne</em>.</>} sous="Tout ce que nous avons récolté, sur une seule planche. Relis, donne un titre, et on lance la préparation." />
      <div className="cn-clap-layout">
        <AfficheProjet conception={conception} style={style} titre={titre} affiche={affiche} reessayer={reessayer} />
        <div style={{ minWidth: 0 }}>
          <label className="cn-champ-titre">
            Titre
            <input type="text" value={titre} maxLength={120} placeholder="Un titre pour le projet (facultatif)" onChange={(e) => setTitre(e.target.value)} />
          </label>
          <div className={`cn-claps${frappe ? " is-frappe" : ""}`}>
            <div className="cn-claps-haut" />
            <dl className="cn-claps-grille">
              <Cellule cle="Format" valeur={conception.format === "serie" ? `Série${conception.episodesPrevus ? ` · ${conception.episodesPrevus} ép.` : ""}` : "Film"} />
              <Cellule cle="Genre" valeur={conception.genres.join(" + ")} />
              <Cellule cle="Ton" valeur={`${motDuTon(conception.ton)} · ${conception.ton}`} defaut={defauts.ton} />
              <Cellule cle="Durée" valeur={minutesSecondes(conception.dureeSecondes)} defaut={defauts.duree} />
              <Cellule cle="Rythme" valeur={`${conception.rythme} · ≈ ${plans.moyen} plans`} defaut={defauts.duree} />
              <Cellule cle="Dialogues" valeur={conception.langue} defaut={defauts.langue} />
              <Cellule cle="L’arc" valeur={note("arc")} large />
              <Cellule cle="La fin" valeur={note("fin")} large />
              <Cellule cle="Le héros et les personnages" valeur={note("personnages")} large />
              {extras.map((n) => <Cellule key={n.cle} cle={n.libelle} valeur={n.texte} large />)}
            </dl>
          </div>
          <div className="cn-lancer">
            <button type="button" className="btn btn-gold cn-clap" disabled={!pret || envoi} onClick={() => void lancer()}>{envoi ? "Lancement…" : "Action ! Lancer la préparation"}</button>
            {!pret ? <p className="cn-manque">Le scénariste n’a pas encore l’essentiel : retourne à l’entretien.</p> : null}
            {erreur ? <p className="cn-erreur" role="alert">{erreur}</p> : null}
          </div>
        </div>
      </div>
    </>
  );
}
