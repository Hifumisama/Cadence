"use client";

import type { EtapeFil } from "@/lib/agents-affichage";
import type { Etape } from "@/lib/agents/types";

/** Le fil d'étapes de la popup. Les étapes déjà atteintes sont cliquables pour revenir en
 * arrière ; on ne saute jamais en avant (c'est le serveur qui fait avancer l'étape). */
export function FilEtapes({ etapes, onAller }: { etapes: EtapeFil[]; onAller: (e: Etape) => void }) {
  return (
    <ol className="ag-fil" aria-label="Étapes">
      {etapes.map((e, i) => (
        <li key={e.etape} className={`ag-etape ag-etape-${e.etat}`} aria-current={e.etat === "courante" ? "step" : undefined}>
          {e.cliquable ? (
            <button type="button" onClick={() => onAller(e.etape)} title={`Revenir à : ${e.libelle}`}>
              <span className="ag-etape-n num">{i + 1}</span>
              {e.libelle}
            </button>
          ) : (
            <span>
              <span className="ag-etape-n num">{i + 1}</span>
              {e.libelle}
            </span>
          )}
        </li>
      ))}
    </ol>
  );
}
