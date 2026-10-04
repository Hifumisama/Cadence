"use client";

import { useState, useTransition } from "react";
import { lireInventaireSuppression, supprimerProjet } from "@/app/projects/actions";
import type { InventaireSuppression } from "@/lib/suppression-projet";

function pluriel(n: number, mot: string): string {
  return `${n} ${mot}${n > 1 ? "s" : ""}`;
}

/** Bouton « Supprimer » d'un projet + confirmation qui détaille ce qui disparaît. `compact` : petit
 * bouton posé sur la carte de l'accueil. */
export function SupprimerProjetBouton({ projectId, nom, compact = false }: { projectId: number; nom: string; compact?: boolean }) {
  const [ouvert, setOuvert] = useState(false);
  const [inventaire, setInventaire] = useState<InventaireSuppression | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const ouvrir = () => {
    setOuvert(true);
    setInventaire(null);
    setErreur(null);
    lireInventaireSuppression(projectId)
      .then(setInventaire)
      .catch(() => setErreur("Impossible de lire le contenu du projet."));
  };
  const fermer = () => setOuvert(false);

  const confirmer = () => {
    setErreur(null);
    startTransition(async () => {
      try {
        await supprimerProjet(projectId);
      } catch (err) {
        // redirect() de Next lève une exception de contrôle : on la laisse passer.
        if (err && typeof err === "object" && "digest" in err) throw err;
        setErreur(err instanceof Error ? err.message : "Échec de la suppression.");
      }
    });
  };

  const lignes = inventaire
    ? [
        inventaire.saisons > 0 || inventaire.episodes > 0
          ? `${pluriel(inventaire.saisons, "saison")}, ${pluriel(inventaire.episodes, "épisode")}`
          : null,
        pluriel(inventaire.plans, "plan"),
        pluriel(inventaire.assets, "asset") + " (images, voix, sons du registre)",
        pluriel(inventaire.repliques, "réplique"),
        `${pluriel(inventaire.rendus, "rendu")} vidéo et ${pluriel(inventaire.generations, "génération")} d'assets`,
        `${pluriel(inventaire.appelsLlm, "appel")} LLM, conversations, briefs, propositions et traces`,
        "tous les fichiers correspondants sur le disque",
      ].filter((l): l is string => l !== null)
    : [];

  return (
    <>
      <button
        className={compact ? "btn btn-danger btn-sm proj-suppr" : "btn btn-danger"}
        type="button"
        onClick={ouvrir}
        title="Supprimer le projet"
        aria-label={`Supprimer le projet ${nom}`}
      >
        {compact ? "Supprimer" : "Supprimer le projet"}
      </button>
      {ouvert ? (
        <div className="modal-overlay" onClick={pending ? undefined : fermer}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="modal-hd">
              <h2>Supprimer « {nom} » ?</h2>
              <button className="modal-close" type="button" onClick={fermer} aria-label="Fermer" disabled={pending}>
                ×
              </button>
            </div>
            <div className="modal-bd">
              <p>Cette suppression est définitive et emporte tout ce qui est rattaché au projet :</p>
              {inventaire ? (
                <ul>
                  {lignes.map((l) => (
                    <li key={l}>{l}</li>
                  ))}
                </ul>
              ) : (
                <p className="tiny-note">{erreur ?? "Calcul du contenu…"}</p>
              )}
              {inventaire && inventaire.tachesEnCours > 0 ? (
                <p className="tiny-note" style={{ color: "var(--or)" }}>
                  {pluriel(inventaire.tachesEnCours, "tâche")} en cours pour ce projet : elles échoueront.
                </p>
              ) : null}
              <div className="danger-zone">
                <button className="btn btn-danger" type="button" disabled={pending || !inventaire} onClick={confirmer}>
                  {pending ? "Suppression…" : "Supprimer définitivement"}
                </button>
                <button className="btn btn-ghost" type="button" onClick={fermer} disabled={pending}>
                  Annuler
                </button>
                {erreur && inventaire ? <span className="tiny-note" style={{ color: "var(--ecarlate-glow)" }}>{erreur}</span> : null}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
