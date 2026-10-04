"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { listerConversationsProjetVue } from "@/app/agents/lecture";
import { useAgents } from "@/components/agents/AgentsProvider";
import { porteesDepuisChemin } from "@/lib/agents/page-agent";
import type { Portee } from "@/lib/agents/types";
import type { ResumeConversation } from "@/lib/queries-agents";

const LIBELLE_PORTEE: Record<Portee, string> = { projet: "Projet", saison: "Saison", episode: "Épisode", plan: "Plan", asset: "Asset" };

/** Sous l'en-tête de la fenêtre de l'agent : la PORTÉE courante (déduite de la page : la plus petite), avec de quoi l'ÉLARGIR
 * d'un clic (le plan → son épisode → le projet), et la trace des AUTRES conversations du projet (ce qui a déjà été demandé),
 * pour y revenir. Une conversation par portée et par cible : le verrou de portée de l'agent en dépend (il ne modifie jamais
 * que ce que sa portée couvre). */
export function SelecteurPortee({ conversationUuid, projectId, porteeActuelle }: { conversationUuid: string | null; projectId: number; porteeActuelle: Portee | null }) {
  const chemin = usePathname();
  const { ouvrirAgent } = useAgents();
  const options = porteesDepuisChemin(chemin).filter((p) => p.demande.projectId === projectId);
  const [conversations, setConversations] = useState<ResumeConversation[] | null>(null);

  useEffect(() => {
    let annule = false;
    listerConversationsProjetVue(projectId)
      .then((l) => {
        if (!annule) setConversations(l);
      })
      .catch(() => {
        if (!annule) setConversations([]);
      });
    return () => {
      annule = true;
    };
  }, [projectId, conversationUuid]);

  const autres = (conversations ?? []).filter((c) => c.uuid !== conversationUuid && (c.nbMessages > 0 || c.aProposition));
  if (options.length <= 1 && autres.length === 0) return null;

  return (
    <div className="ag-portee">
      {options.length > 1 ? (
        <span className="ag-portee-choix">
          <span className="tiny-note">Portée</span>
          {options.map((o) => {
            const actuelle = porteeActuelle === o.demande.portee;
            return (
              <button
                key={o.cle}
                type="button"
                className={`btn btn-mini ${actuelle ? "btn-gold" : "btn-ghost"}`}
                aria-pressed={actuelle}
                disabled={actuelle}
                onClick={() =>
                  ouvrirAgent({
                    projectId: o.demande.projectId,
                    portee: o.demande.portee,
                    cible: o.demande.cible,
                    ...(o.demande.vue ? { vue: o.demande.vue } : {}),
                    ...(o.demande.episodeId != null ? { episodeId: o.demande.episodeId } : {}),
                    ...(o.demande.planUuid ? { planUuid: o.demande.planUuid } : {}),
                  })
                }
                title={actuelle ? "Portée de cette conversation" : `Passer à : ${o.libelle.toLowerCase()}`}
              >
                {o.libelle}
              </button>
            );
          })}
        </span>
      ) : null}
      {autres.length > 0 ? (
        <details className="ag-portee-autres">
          <summary className="tiny-note">Autres conversations du projet ({autres.length})</summary>
          <ul>
            {autres.map((c) => (
              <li key={c.uuid}>
                <button type="button" className="ag-lien" onClick={() => ouvrirAgent({ conversationUuid: c.uuid, projectId })}>
                  {LIBELLE_PORTEE[c.portee]} · {c.cibleLibelle}
                </button>
                <span className="tiny-note">
                  {" "}
                  {c.nbMessages > 0 ? `${c.nbMessages} message${c.nbMessages > 1 ? "s" : ""}` : ""}
                  {c.aProposition ? `${c.nbMessages > 0 ? " · " : ""}proposition` : ""}
                </span>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}
