"use server";

/**
 * SERVER API OF THE AGENT SYSTEM — what the interface (step-by-step popup) calls.
 * Types: lib/agents/types.ts. Reads: lib/agents/queries-agents.ts. Design:
 * docs/CONCEPTION_AGENTS.md §14.
 *
 * Principles (decisions of 2026-10-02):
 * - Nothing is written to the business tables without `appliquerSelection`. Everything else
 *   writes conversations, briefs (draft) and proposals.
 * - Two depths: `courte` (Consigne → Proposition → Appliqué) and `complete`
 *   (Conversation → Brief → Proposition → Appliqué).
 * - One conversation per (project, scope, target). `ouvrirConversation` resumes,
 *   `nouvelleConversation` overwrites the previous one.
 * - Model calls are TASKS in the queue (agent_runs, single GPU resource): the actions that
 *   launch them return immediately (`runUuid`); the UI polls
 *   `lireConversation` / `lireProposition` (field `tache`) or the header panel
 *   (/api/taches) until completion. Closing the popup interrupts nothing.
 * - Each action returns `{ ok: true, ... } | { ok: false, erreur }`: never an exception
 *   for a business case.
 *
 * Typical flow — creating a project (complete depth):
 *   const { conversationUuid } = await ouvrirConversation(projectId, "projet", null, "complete");
 *   await envoyerMessage(conversationUuid, "Un phare où le sel recouvre tout…"); // task « tour »
 *   // … lireConversation(conversationUuid).tache switches to "termine", messages gets the reply;
 *   // briefPret = true → the notes sheet is complete: a brief DRAFT already exists, the UI offers « Voir le briefing »
 *   await genererBrief(conversationUuid);                    // freezes the sheet as a draft (immediate), even if incomplete
 *   // lireBrief(projectId); modifierChampBrief(projectId, "arc", "…") marks the section « fourni »
 *   const { propositionUuid } = await genererProposition(conversationUuid); // skeleton: immediate, no LLM
 *   // lireProposition(propositionUuid): groups, counters, overwrites…
 *   await cocherChangements(propositionUuid, { groupe: "episodes" }, false);
 *   await appliquerSelection(propositionUuid);               // transaction: all or nothing
 *
 * Typical flow — short iteration (asset prompt):
 *   const { conversationUuid } = await ouvrirConversation(pid, "asset", { code: "CHAR_maya" }, "courte");
 *   await genererProposition(conversationUuid, { consigne: "Regard plus dur, cheveux courts" }); // task
 *   await affiner(propositionUuid, "Garde le regard, rends les cheveux plus courts");
 *   await appliquerSelection(propositionUuid, { confirmeEcrasement: true });
 *
 * Server-side safeguards (the UI does not need to redo them, only display them):
 * - scope lock: a change outside the requested scope is refused
 *   (`refuseRaison`, warning `hors_portee`);
 * - overwriting a validated item requires `confirmeEcrasement: true`;
 * - a `bloque` change (mechanical check) is not applied until it is
 *   fixed (`corrigerChangement`);
 * - the selection is applied in ONE transaction (all or nothing), then the proposal becomes
 *   `appliquee` (all its changes applied) or `partielle` (some discarded, blocked or
 *   refused outright);
 * - a short scope without instruction, a brief already validated, a turn already running: clear error.
 */

import { revalidatePath } from "next/cache";
import * as service from "@/lib/agents/service-conversation";
import type { CibleDemandee, Profondeur, Portee, Resultat } from "@/lib/agents/types";

/** Writes invalidate the page cache: the popup then re-reads its data through
 * the reads of lib/agents/queries-agents.ts. */
async function rafraichir<T extends { ok: boolean }>(r: T): Promise<T> {
  if (r.ok) revalidatePath("/", "layout");
  return r;
}

// --- Conversation -----------------------------------------------------------

/** Opens the conversation for (project, scope, target): resumes it if it exists, creates it
 * otherwise. `cible` designates the existing target (episode: `{ id }`, clip: `{ uuid }`, asset:
 * `{ code }` or `{ id }`); null for the `projet` scope. `profondeur` is only taken into account
 * at creation (default: `complete` for a project, `courte` otherwise). `reprise` says whether a
 * conversation already existed (the UI shows « conversation en cours reprise »). */
export async function ouvrirConversation(
  projectId: number,
  portee: Portee,
  cible: CibleDemandee | null,
  profondeur?: Profondeur,
): Promise<Resultat<{ conversationUuid: string; reprise: boolean }>> {
  return rafraichir(await service.ouvrirConversation(projectId, portee, cible, profondeur));
}

/** DESIGNED project whose screenwriter hook failed: retries it (never a regeneration of a successful hook). */
export async function relancerAccroche(conversationUuid: string): Promise<Resultat> {
  return rafraichir(await service.relancerAccroche(conversationUuid));
}

/** Complete depth: adds the user's message and starts a conversation turn
 * (task). Refused if a turn is already running on this conversation. */
export async function envoyerMessage(conversationUuid: string, texte: string): Promise<Resultat<{ runUuid: string }>> {
  return rafraichir(await service.envoyerMessage(conversationUuid, texte));
}

/** Reply through a screenwriter choice card (selected labels): the text sent is formulated server-side. */
export async function repondreAuChoix(conversationUuid: string, libelles: string[]): Promise<Resultat<{ runUuid: string }>> {
  return rafraichir(await service.repondreAuChoix(conversationUuid, libelles));
}

// --- Brief ------------------------------------------------------------------

/** Manually corrects a brief section (top-level key: `arc`, `style`, `lieux`…).
 * The value is validated against the brief schema; the section switches to the `fourni` status.
 * Valid on a draft as well as on the project's validated brief. */
export async function modifierChampBrief(projectId: number, section: string, valeur: unknown): Promise<Resultat> {
  return rafraichir(await service.modifierChampBrief(projectId, section, valeur));
}

// --- Proposition ------------------------------------------------------------

