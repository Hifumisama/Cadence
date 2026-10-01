"use client";

import { useEffect, useState } from "react";
import { estimerGenerationVue } from "@/app/agents/lecture";
import { libelleEstimation } from "@/lib/agents-affichage";
import type { EstimationGeneration } from "@/lib/agents/types";

/** Le CADRAGE d'une génération, au niveau du bouton « Générer la proposition » (jamais dans
 * la conversation) : la portée (un simple chip prérempli) et l'estimation — fournisseur,
 * durée, jetons, coût (gratuit en local), tâches devant dans la file. */
export function CadrageGeneration({
  conversationUuid,
  libelle,
  rafraichissement,
}: {
  conversationUuid: string;
  libelle: string;
  /** Change quand l'état de la file change : l'estimation est relue. */
  rafraichissement?: string | number | null;
}) {
  const [estimation, setEstimation] = useState<EstimationGeneration | null | undefined>(undefined);

  useEffect(() => {
    let annule = false;
    estimerGenerationVue(conversationUuid)
      .then((e) => {
        if (!annule) setEstimation(e);
      })
      .catch(() => {
        if (!annule) setEstimation(null);
      });
    return () => {
      annule = true;
    };
  }, [conversationUuid, rafraichissement]);

  return (
    <div className="ag-cadrage" role="group" aria-label="Cadrage de la génération">
      <span className="ag-chip" title="La portée de la demande">
        Portée · {libelle}
      </span>
      <span className="ag-estimation tiny-note" role="status">
        {estimation === undefined ? "Estimation…" : estimation ? `${estimation.modele} · ${libelleEstimation(estimation)}` : "Estimation indisponible"}
      </span>
    </div>
  );
}
