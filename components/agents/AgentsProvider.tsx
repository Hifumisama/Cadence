"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { AgentDialogue } from "@/components/agents/AgentDialogue";
import type { CibleDemandee, Portee, Profondeur } from "@/lib/agents/types";

/** Ce que l'on demande d'ouvrir. Soit une CIBLE (portée + cible : la conversation du
 * (projet, portée, cible) est reprise ou créée), soit une conversation EXISTANTE par son
 * uuid (le panneau du header y renvoie). */
export type DemandeAgent = {
  projectId?: number;
  portee?: Portee;
  cible?: CibleDemandee | null;
  profondeur?: Profondeur;
  /** Chip de portée affiché dans l'en-tête (« Épisode 1 · Le sel », « CHAR_maya »…). */
  libelle?: string;
  /** Épisode concerné : sert au sélecteur de position d'un nouveau plan. */
  episodeId?: number;
  /** Plan courant (portée `plan`) : position par défaut = juste après lui. */
  planUuid?: string;
  conversationUuid?: string;
  /** Vue directe : « registre » ouvre le sélecteur de la création du registre d'assets (depuis la
   * page des assets), sans passer par les étapes d'une conversation. */
  vue?: "registre";
};

type Contexte = {
  ouvrirAgent: (demande: DemandeAgent) => void;
  fermerAgent: () => void;
};

const AgentsContext = createContext<Contexte>({ ouvrirAgent: () => undefined, fermerAgent: () => undefined });

export function useAgents(): Contexte {
  return useContext(AgentsContext);
}

/** Monte UNE popup d'agent pour toute l'application (layout) : les points d'entrée
 * (boutons « Demander à l'agent ») et le panneau du header l'ouvrent par ce contexte, sans
 * changer de page. Fermer la popup n'interrompt aucune tâche. */
export function AgentsProvider({ children }: { children: ReactNode }) {
  const [demande, setDemande] = useState<DemandeAgent | null>(null);
  // Une clé qui change à chaque ouverture remonte la popup à neuf (état propre).
  const [ouverture, setOuverture] = useState(0);

  const ouvrirAgent = useCallback((d: DemandeAgent) => {
    setDemande(d);
    setOuverture((n) => n + 1);
  }, []);
  const fermerAgent = useCallback(() => setDemande(null), []);

  const valeur = useMemo(() => ({ ouvrirAgent, fermerAgent }), [ouvrirAgent, fermerAgent]);

  return (
    <AgentsContext.Provider value={valeur}>
      {children}
      {demande ? <AgentDialogue key={ouverture} demande={demande} onFermer={fermerAgent} /> : null}
    </AgentsContext.Provider>
  );
}
