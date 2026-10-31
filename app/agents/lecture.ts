"use server";

import type { VueConversation, VueProposition } from "@/lib/agents/types";
import { lireConversation, lireProposition } from "@/lib/queries-agents";

// Enveloppes de LECTURE du système d'agents pour l'interface (le sondage des pages).
// lib/queries-agents.ts n'est pas appelable depuis un composant client : ces fonctions
// serveur le sont, sans rien écrire. Les écritures vivent dans app/agents/actions.ts.

export async function lireConversationVue(conversationUuid: string): Promise<VueConversation | null> {
  return lireConversation(conversationUuid);
}

export async function lirePropositionVue(propositionUuid: string): Promise<VueProposition | null> {
  return lireProposition(propositionUuid);
}

