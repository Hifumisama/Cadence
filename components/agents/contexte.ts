import type { DemandeAgent } from "@/components/agents/AgentsProvider";
import type { Etape, ResultatApplication, VueBrief, VueConversation, VueProposition } from "@/lib/agents/types";

/** Tout ce qu'une étape de la popup reçoit de la popup elle-même (qui possède l'état,
 * le sondage et les appels serveur). Le serveur fait foi : une étape agit par `lancer`,
 * qui relit l'état ensuite ; elle ne garde jamais sa propre copie des données. */
export type ContexteEtape = {
  demande: DemandeAgent;
  conv: VueConversation;
  prop: VueProposition | null;
  brief: VueBrief | null;
  /** Un appel serveur est en cours (boutons désactivés). */
  occupe: boolean;
  /** Dernier résultat d'`appliquerSelection` (étape « Appliqué »). */
  dernierResultat: Extract<ResultatApplication, { ok: true }> | null;
  /** Exécute une action serveur, affiche son erreur au besoin, puis relit l'état. */
  lancer: <T extends { ok: boolean }>(action: () => Promise<T>, apres?: (r: T) => void) => Promise<void>;
  rafraichir: () => Promise<void>;
  /** Change la vue affichée (retour en arrière dans le fil d'étapes). */
  aller: (etape: Etape) => void;
  setErreur: (message: string | null) => void;
  setDernierResultat: (r: Extract<ResultatApplication, { ok: true }> | null) => void;
  /** Ouvre la confirmation « Réinitialiser » (la popup affiche ce qui sera perdu). */
  demanderReinitialisation: () => void;
};
