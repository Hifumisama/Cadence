"use server";

import type { VueConversation } from "@/lib/agents/types";
import { lireConversation } from "@/lib/agents/queries-agents";
import { exiger, uuidSchema } from "@/lib/validation/args";

// READ wrappers of the agent system for the interface (page polling).
// lib/agents/queries-agents.ts cannot be called from a client component: these
// server functions can, without writing anything. Writes live in app/agents/actions.ts.

export async function lireConversationVue(conversationUuid: string): Promise<VueConversation | null> {
  exiger(uuidSchema, conversationUuid);
  return lireConversation(conversationUuid);
}

