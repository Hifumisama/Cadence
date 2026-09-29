"use client";

import { usePathname } from "next/navigation";
import { useState, useTransition } from "react";
import { modifierEpisode, modifierNomProjet, uploaderPosterEpisode, uploaderPosterProjet } from "@/app/projects/actions";
import { Poster } from "@/components/ui/Poster";

function two(n: number): string {
  return String(n).padStart(2, "0");
}

/** Encart titre + résumé + poster, en tête de la page épisode. Le résumé
 * est toujours propre à l'épisode ; le titre et le poster, eux, pointent
 * vers le PROJET quand c'est un OneShot (`oneshot` non nul) — un OneShot
 * n'a conceptuellement qu'un seul titre/une seule affiche (celle du film),
 * jamais un second jeu séparé sur son épisode technique caché (retour
 * utilisateur 2026-09-28, voir aussi le fil d'Ariane qui s'arrête au nom du
 * projet). Pour une Série, titre/poster restent propres à l'épisode. */
export function EpisodeInfoPanel({
  projectId,
  episodeId,
  numero,
  titre,
  resume,
  posterSrc,
  oneshot,
}: {
  projectId: number;
  episodeId: number;
  numero: number;
  titre: string;
  resume: string;
  posterSrc: string | null;
  oneshot: { nom: string; posterSrc: string | null } | null;
}) {
  // La fiche de plan a besoin de toute la place : pas d'encart épisode dessus.
  const surFichePlan = /\/plans\/[^/]+/.test(usePathname());
  const titreInitial = oneshot ? oneshot.nom : titre;
  const posterInitial = oneshot ? oneshot.posterSrc : posterSrc;

  const [edition, setEdition] = useState(false);
  const [valeurTitre, setValeurTitre] = useState(titreInitial);
  const [valeurResume, setValeurResume] = useState(resume);
  const [pending, startTransition] = useTransition();
  const [uploadPending, startUpload] = useTransition();
  const [posterLocal, setPosterLocal] = useState<string | null>(posterInitial);

  const annuler = () => {
    setValeurTitre(titreInitial);
    setValeurResume(resume);
    setEdition(false);
  };

  const enregistrer = () => {
    startTransition(async () => {
      if (oneshot) {
        await Promise.all([
          modifierNomProjet(projectId, valeurTitre.trim() || "Sans titre"),
          modifierEpisode(episodeId, { resume: valeurResume }),
        ]);
      } else {
        await modifierEpisode(episodeId, { titre: valeurTitre.trim() || "Sans titre", resume: valeurResume });
      }
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
      if (oneshot) {
        await uploaderPosterProjet(projectId, formData);
      } else {
        await uploaderPosterEpisode(episodeId, formData);
      }
    });
  };

  if (surFichePlan) return null;

  return (
    <div className="info-panel">
      <Poster
        src={posterLocal}
        titre={titreInitial || (oneshot ? "Sans titre" : `Épisode ${two(numero)}`)}
        cleRepli={oneshot ? `projet:${projectId}` : `episode:${episodeId}`}
        taille="wide"
      />
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
              placeholder={oneshot ? "Nom du projet" : "Titre de l'épisode"}
              style={{ fontSize: 16 }}
            />
          ) : (
            <h1>{oneshot ? titreInitial || "Sans titre" : `E${two(numero)} — ${titre || "Sans titre"}`}</h1>
          )}
          {!edition ? (
            <button className="btn btn-ghost" type="button" onClick={() => setEdition(true)}>
              Modifier
            </button>
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
      </div>
    </div>
  );
}
