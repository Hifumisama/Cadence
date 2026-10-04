"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { lancerCreationProjet } from "@/app/creation/actions";
import { useAgents } from "@/components/agents/AgentsProvider";

/** « Créer tout le projet » : lance l'installateur (lib/agents/creation.ts). Une seule demande enchaîne le brief, la
 * structure, les scénarios, le registre, l'inventaire des assets, les voix et les fiches de plan, sans revue
 * intermédiaire ; la page de l'installateur montre l'avancement. Le seul retour en arrière est de supprimer le projet. */
export function BoutonCreerTout({ projectId, className = "btn btn-gold", libelle = "Créer tout le projet", desactive = false }: { projectId: number; className?: string; libelle?: string; desactive?: boolean }) {
  const router = useRouter();
  const { fermerAgent } = useAgents();
  const [pending, startTransition] = useTransition();
  const [erreur, setErreur] = useState<string | null>(null);

  const lancer = () =>
    startTransition(async () => {
      setErreur(null);
      const r = await lancerCreationProjet(projectId);
      if (!r.ok) {
        setErreur(r.erreur);
        return;
      }
      fermerAgent();
      router.push(`/p/${projectId}/creation`);
    });

  return (
    <span className="ag-creer-tout">
      <button type="button" className={className} onClick={lancer} disabled={pending || desactive} title="Enchaîne toutes les étapes sans revue intermédiaire ; la progression se suit sur une page dédiée">
        {pending ? "…" : libelle}
      </button>
      {erreur ? (
        <span className="tiny-note ag-erreur" role="alert">
          {erreur}
        </span>
      ) : null}
    </span>
  );
}
