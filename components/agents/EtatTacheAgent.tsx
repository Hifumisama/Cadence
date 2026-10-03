"use client";

import { useState } from "react";
import { useMachineAEcrire } from "@/components/agents/useMachineAEcrire";
import { useTaches } from "@/components/taches/TachesProvider";
import { estTacheActive, libelleTache } from "@/lib/agents-affichage";
import { extraireChainePartielle, fin } from "@/lib/llm/flux-partiel";
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
  // Le streaming : la réponse de l'agent qui s'écrit (un tour de conversation), sinon la fin du JSON qu'il écrit ;
  // et la fin de sa réflexion, repliée par défaut. La réponse apparaît lettre par lettre (machine à écrire).
  const enDirect = tache?.statut === "en_cours";
  const reponseRecue = enDirect && tache?.but === "tour" ? extraireChainePartielle(tache.fluxTexte ?? "", "reponse") : null;
  const reponse = useMachineAEcrire(reponseRecue);
  if (!tache || !texte) return null;
  const actif = estTacheActive(tache);
  const echec = tache.statut === "echoue";
  const ecrit = enDirect && tache.but !== "tour" && tache.fluxTexte ? fin(tache.fluxTexte, 600) : null;
  const reflexion = enDirect && tache.fluxReflexion ? fin(tache.fluxReflexion, 1200) : null;

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
      {reponseRecue != null ? (
        <p className="ag-flux-reponse">
          {reponse}
          <span className="ag-curseur" aria-hidden="true" />
        </p>
      ) : null}
      {reflexion ? (
        <details className="ag-flux">
          <summary>Réflexion de l&rsquo;agent</summary>
          <pre className="ag-flux-texte">{reflexion}</pre>
        </details>
      ) : null}
      {ecrit ? (
        <details className="ag-flux">
          <summary>Ce que l&rsquo;agent écrit</summary>
          <pre className="ag-flux-texte">{ecrit}</pre>
        </details>
      ) : null}
    </div>
  );
}
