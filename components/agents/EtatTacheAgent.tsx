"use client";

import { useState } from "react";
import { useTaches } from "@/components/taches/TachesProvider";
import { estTacheActive, libelleTache } from "@/lib/agents-affichage";
import type { EtatTache } from "@/lib/agents/types";
import { cleLlm } from "@/lib/taches";

/** L'état d'une tâche d'agent (un tour, le brief, une proposition) : file, travail en cours
 * avec le compteur de jetons (pas de pourcentage : le maximum est inconnu), échec, annulation.
 * L'annulation passe par la file (la même que le panneau du header) ; une tâche en cours
 * demande confirmation, une tâche en attente s'annule d'un clic. */
export function EtatTacheAgent({ tache }: { tache: EtatTache | null }) {
  const { annuler } = useTaches();
  const [confirmer, setConfirmer] = useState(false);
  const texte = libelleTache(tache);
  if (!tache || !texte) return null;
  const actif = estTacheActive(tache);
  const echec = tache.statut === "echoue";

  return (
    <div className={`ag-tache${echec ? " ag-tache-echec" : ""}`} role={echec ? "alert" : "status"}>
      {actif ? <progress className="gd-bar" aria-label={texte} /> : null}
      <div className="gd-row gd-row-between">
        <span className="gd-prog">{texte}</span>
        {actif ? (
          confirmer ? (
            <span className="gd-row" role="group" aria-label="Confirmer l'annulation">
              <button
                type="button"
                className="btn btn-ghost btn-mini"
                onClick={() => {
                  setConfirmer(false);
                  annuler(cleLlm(tache.runUuid));
                }}
              >
                Oui, annuler
              </button>
              <button type="button" className="btn btn-ghost btn-mini" onClick={() => setConfirmer(false)}>
                Non
              </button>
            </span>
          ) : (
            <button
              type="button"
              className="btn btn-ghost btn-mini"
              onClick={() => (tache.statut === "en_cours" ? setConfirmer(true) : annuler(cleLlm(tache.runUuid)))}
              title={tache.statut === "en_cours" ? "Interrompre cette génération" : "Retirer de la file"}
            >
              Annuler
            </button>
          )
        ) : null}
      </div>
    </div>
  );
}
