"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAgents } from "@/components/agents/AgentsProvider";
import { demandeDepuisChemin, porteesDepuisChemin } from "@/lib/agents/page-agent";
import { Icone } from "@/components/ui/Icone";

/** LE point d'accès à l'agent (bandeau, sur toutes les pages d'un projet) : la portée est déduite de la page où l'on se trouve,
 * toujours la plus petite qui s'y applique (un plan, un asset, un épisode, sinon le projet). On l'élargit dans la fenêtre
 * (`SelecteurPortee`), jamais besoin de choisir « une portée » à froid. Hors d'un projet : rien à demander. */
export function BoutonAgentGlobal() {
  const chemin = usePathname();
  const { ouvrirAgent } = useAgents();
  const demande = demandeDepuisChemin(chemin);
  if (!demande) return null;
  // La page du réalisateur EST l'agent : pas de second bouton par-dessus.
  if (chemin.startsWith(`/p/${demande.projectId}/realisateur`)) return null;
  // Sur une page d'épisode ou de plan (docs/FRICTIONS.md 2026-10-09, révision d'épisode), l'agent est le réalisateur : le bouton y mène,
  // avec le plan en amorce quand on vient d'un plan. Ailleurs (projet, asset, assets, voix), la popup d'agent est inchangée.
  if ((demande.portee === "episode" || demande.portee === "plan") && demande.episodeId != null) {
    const href = `/p/${demande.projectId}/realisateur/${demande.episodeId}${demande.planUuid ? `?plan=${demande.planUuid}` : ""}`;
    return (
      <Link href={href} className="btn btn-ghost btn-mini tq-agent" title="Réviser cet épisode avec le réalisateur" aria-label="Réviser cet épisode avec le réalisateur">
        Agent <Icone nom="agent" taille={14} />
      </Link>
    );
  }
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
      Agent <Icone nom="agent" taille={14} />
    </button>
  );
}
