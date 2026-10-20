"use client";

import { usePathname } from "next/navigation";
import { useState, useTransition } from "react";
import { modifierEpisode, modifierNomProjet, uploaderPosterProjet } from "@/app/projects/actions";
import Link from "next/link";
import { BoutonAffiche } from "@/components/affiches/BoutonAffiche";
import { AfficheZoom } from "@/components/affiches/AfficheZoom";
import { Poster } from "@/components/ui/Poster";

/** Encart titre + résumé + poster, en tête de la page du film. Un projet est un film : le titre et l'affiche sont ceux du PROJET,
 * le résumé est celui de son épisode (le film). */
export function EpisodeInfoPanel({
  projectId,
  episodeId,
  nom,
  resume,
  clauseStyle,
  posterSrc,
  etatPlans,
}: {
  projectId: number;
  episodeId: number;
  /** Le nom du projet (le titre du film). */
  nom: string;
  resume: string;
  /** Clause de style du projet : une info qui cadre toute la génération, rappelée ici sous le résumé. */
  clauseStyle: string;
  posterSrc: string | null;
  /** L'état des plans et son action : intégré à l'en-tête, mais seulement sur la page Scénario. */
  etatPlans?: React.ReactNode;
}) {
  // La fiche de plan a besoin de toute la place : pas d'encart épisode dessus.
  const chemin = usePathname();
  const surFichePlan = /\/plans\/[^/]+/.test(chemin);
  const surScenario = /\/scenario\/?$/.test(chemin);
  const titreInitial = nom;

  const [edition, setEdition] = useState(false);
  const [valeurTitre, setValeurTitre] = useState(titreInitial);
  const [valeurResume, setValeurResume] = useState(resume);
  const [pending, startTransition] = useTransition();
  const [uploadPending, startUpload] = useTransition();
  const [posterLocal, setPosterLocal] = useState<string | null>(posterSrc);

  const annuler = () => {
    setValeurTitre(titreInitial);
    setValeurResume(resume);
    setEdition(false);
  };

  const enregistrer = () => {
    startTransition(async () => {
      await Promise.all([
        modifierNomProjet(projectId, valeurTitre.trim() || "Sans titre"),
        modifierEpisode(episodeId, { resume: valeurResume }),
      ]);
      setEdition(false);
    });
  };

  const onChoisirFichier = (e: React.ChangeEvent<HTMLInputElement>) => {
    const fichier = e.target.files?.[0];
    if (!fichier) return;
    setPosterLocal(URL.createObjectURL(fichier));
    const formData = new FormData();
    formData.set("fichier", fichier);
    startUpload(async () => {
      await uploaderPosterProjet(projectId, formData);
    });
  };

  if (surFichePlan) return null;

  return (
    <div className="info-panel">
      <AfficheZoom src={posterLocal} titre={titreInitial || "Sans titre"}>
        <Poster
          src={posterLocal}
          titre={titreInitial || "Sans titre"}
          cleRepli={`projet:${projectId}`}
          taille="apercu"
        />
      </AfficheZoom>
      <div className="info-body">
        {edition ? (
          <label className="btn btn-ghost btn-sm" style={{ cursor: "pointer", alignSelf: "flex-start" }}>
            {uploadPending ? "Envoi..." : "Changer l'image de présentation"}
            <input type="file" accept="image/*" style={{ display: "none" }} onChange={onChoisirFichier} />
          </label>
        ) : null}

        <div className="info-hd">
          {edition ? (
            <input
              className="field"
              value={valeurTitre}
              onChange={(e) => setValeurTitre(e.target.value)}
              placeholder="Nom du projet"
              style={{ fontSize: 16 }}
            />
          ) : (
            <h1>{titreInitial || "Sans titre"}</h1>
          )}
          {!edition ? (
            <div className="info-hd-actions">
              <BoutonAffiche cible="projects" id={projectId} className="btn btn-ghost" />
              <button className="btn btn-ghost" type="button" onClick={() => setEdition(true)}>
                Modifier
              </button>
            </div>
          ) : null}
        </div>

        {edition ? (
          <textarea
            className="field"
            rows={3}
            value={valeurResume}
            onChange={(e) => setValeurResume(e.target.value)}
            placeholder="Résumé"
          />
        ) : (
          <p className={`resume ${resume.trim() ? "" : "is-empty"}`}>{resume.trim() || ""}</p>
        )}

        {!edition && clauseStyle.trim() ? (
          <p className="clause-style" title={clauseStyle.trim()}>
            <span className="k">Style</span>
            <span className="v">{clauseStyle.trim()}</span>
            <Link href={`/p/${projectId}/brief`}>Brief</Link>
          </p>
        ) : null}

        {edition ? (
          <div className="form-actions">
            <button className="btn btn-gold" type="button" onClick={enregistrer} disabled={pending}>
              {pending ? "..." : "Enregistrer"}
            </button>
            <button className="btn btn-ghost" type="button" onClick={annuler}>
              Annuler
            </button>
          </div>
        ) : null}

        {surScenario && !edition ? etatPlans : null}
      </div>
    </div>
  );
}
