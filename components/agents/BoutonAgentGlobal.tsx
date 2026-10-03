"use client";

import { usePathname } from "next/navigation";
import { useAgents } from "@/components/agents/AgentsProvider";
import { demandeDepuisChemin, porteesDepuisChemin } from "@/lib/agents/page-agent";

/** LE point d'accès à l'agent (bandeau, sur toutes les pages d'un projet) : la portée est déduite de la page où l'on se trouve,
 * toujours la plus petite qui s'y applique (un plan, un asset, un épisode, sinon le projet). On l'élargit dans la fenêtre
 * (`SelecteurPortee`), jamais besoin de choisir « une portée » à froid. Hors d'un projet : rien à demander. */
export function BoutonAgentGlobal() {
  const chemin = usePathname();
  const { ouvrirAgent } = useAgents();
  const demande = demandeDepuisChemin(chemin);
  if (!demande) return null;
  const portee = porteesDepuisChemin(chemin)[0]?.libelle ?? "Tout le projet";
  return (
    <button
      type="button"
      className="btn btn-ghost btn-mini tq-agent"
      onClick={() =>
        ouvrirAgent({
          projectId: demande.projectId,
          portee: demande.portee,
          cible: demande.cible,
          ...(demande.vue ? { vue: demande.vue } : {}),
          ...(demande.episodeId != null ? { episodeId: demande.episodeId } : {}),
          ...(demande.planUuid ? { planUuid: demande.planUuid } : {}),
        })
      }
      title={`Demander à l'agent — portée : ${portee.toLowerCase()} (tu peux l'élargir dans la fenêtre)`}
      aria-label={`Demander à l'agent, portée : ${portee.toLowerCase()}`}
    >
      Agent <span aria-hidden="true">✦</span>
    </button>
  );
}
