"use client";

import { useAgents, type DemandeAgent } from "@/components/agents/AgentsProvider";

/** Le point d'entrée : « Demander à l'agent ✦ ». Il ne fait qu'ouvrir la popup (montée une
 * fois dans le layout) avec la portée de l'endroit où il se trouve. */
export function BoutonAgent({
  demande,
  libelle = "Demander à l'agent",
  className = "btn btn-ghost btn-sm",
  titre,
}: {
  demande: DemandeAgent;
  libelle?: string;
  className?: string;
  titre?: string;
}) {
  const { ouvrirAgent } = useAgents();
  return (
    <button type="button" className={className} onClick={() => ouvrirAgent(demande)} title={titre ?? "Demander à l'agent, avec cette portée"}>
      {libelle} <span aria-hidden="true">✦</span>
    </button>
  );
}
