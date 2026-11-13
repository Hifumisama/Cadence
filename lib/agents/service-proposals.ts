import { db } from "../../db";
import { propositions, agentConversations, agentRuns, propositionChangements } from "../../db/schema";
import { and, eq, inArray } from "drizzle-orm";
import { annulerRunsDePropositions } from "./batches";
import type { Resultat, Avertissement, ResultatApplication } from "./types";
import { groupeAffiche, raisonNonCochable } from "./checking";
import { appliquerProposition } from "./proposal-db";
import { SKILL_REFERENCES_PLAN } from "./references-clip";
import { ecrireReferencesDuSkill } from "../h3ir/preparation-db";
import { ecrireReferencesApresApplication } from "./inventory-db";
import { ConversationRow } from "./service-conversation";
import { ERR } from "./service-shared";

// --- proposal ------------------------------------------------------------

export async function nouvelleProposition(conv: ConversationRow, p: { skill: string; consigne: string; contexte: unknown[]; parentId?: number | null; retour?: string | null; lot?: boolean }): Promise<number> {
  // A single current proposal: the previous one, if it is still waiting, is rejected — and if
  // it is still in generation, its tasks (a batch has several) are stopped.
  const enCours = await db
    .select({ id: propositions.id })
    .from(propositions)
    .where(and(eq(propositions.conversationId, conv.id), eq(propositions.statut, "en_generation")));
  await annulerRunsDePropositions(db, enCours.map((x) => x.id));
  await db
    .update(propositions)
    .set({ statut: "rejetee" })
    .where(and(eq(propositions.conversationId, conv.id), inArray(propositions.statut, ["en_generation", "prete"])));
  const [prop] = await db
    .insert(propositions)
    .values({
      conversationId: conv.id,
      projectId: conv.projectId,
      skill: p.skill,
      portee: conv.portee,
      cibleId: conv.cibleId,
      consigne: p.consigne,
      contexte: p.contexte,
      parentId: p.parentId ?? null,
      retour: p.retour ?? null,
      lot: p.lot ?? false,
    })
    .returning({ id: propositions.id });
  await db.update(agentConversations).set({ propositionId: prop!.id, consigne: p.consigne, etape: "proposition", updatedAt: new Date() }).where(eq(agentConversations.id, conv.id));
  return prop!.id;
}

export async function propositionParUuid(uuid: string) {
  if (!/^[0-9a-f-]{36}$/i.test(uuid)) return null;
  const [p] = await db.select().from(propositions).where(eq(propositions.uuid, uuid));
  return p ?? null;
}

/** A proposal "en génération" whose task failed or was cancelled no longer waits for anything:
 * its status is caught up here (worker resume, cancellation from the header…). */
export async function rafraichirStatut<T extends typeof propositions.$inferSelect>(p: T): Promise<T> {
  if (p.statut !== "en_generation" || p.runId == null) return p;
  const [run] = await db.select({ statut: agentRuns.statut, erreur: agentRuns.erreur }).from(agentRuns).where(eq(agentRuns.id, p.runId));
  if (run && (run.statut === "echoue" || run.statut === "annulee")) {
    const erreur = run.statut === "annulee" ? "Annulée." : (run.erreur ?? "La génération a échoué.");
    await db.update(propositions).set({ statut: "echouee", erreur }).where(eq(propositions.id, p.id));
    return { ...p, statut: "echouee", erreur };
  }
  return p;
}

export async function cocherChangements(propositionUuid: string, selection: { groupe?: string; ids?: number[] }, coche: boolean): Promise<Resultat<{ modifies: number }>> {
  const prop = await propositionParUuid(propositionUuid);
  if (!prop) return ERR("Proposition introuvable.");
  if (prop.statut !== "prete") return ERR("Cette proposition n'est plus modifiable.");
  const lignes = await db.select().from(propositionChangements).where(eq(propositionChangements.propositionId, prop.id));
  const cibles = lignes.filter((c) => {
    if (selection.ids && !selection.ids.includes(c.id)) return false;
    if (selection.groupe && groupeAffiche({ groupe: c.groupe, ecrase: c.ecrase, refuseRaison: c.refuseRaison }) !== selection.groupe) return false;
    return !raisonNonCochable({ avertissements: (c.avertissements ?? []) as Avertissement[], refuseRaison: c.refuseRaison });
  });
  if (cibles.length) await db.update(propositionChangements).set({ coche }).where(inArray(propositionChangements.id, cibles.map((c) => c.id)));
  return { ok: true, modifies: cibles.length };
}

export async function appliquerSelection(propositionUuid: string, options: Parameters<typeof appliquerProposition>[1] = {}): Promise<ResultatApplication> {
  const prop = await propositionParUuid(propositionUuid);
  if (!prop) return { ok: false, erreur: "Proposition introuvable." };
  // Asset inventory: the clip references that cite an asset created by the proposal are written in the same transaction, AFTER the
  // creations (lib/agents/inventory-db.ts). Those that cited only existing assets were already written by the post-processing.
  // Choice of a clip's references (preparation, wave 4a): the missing assets are created, then the skill's references (them included) are written onto the
  // clip in the same transaction.
  if (prop.skill === SKILL_REFERENCES_PLAN) {
    const suite = options.dansTransaction;
    return appliquerProposition(prop.id, {
      ...options,
      dansTransaction: async (tx) => {
        await ecrireReferencesDuSkill(tx, prop.id, prop.runId);
        if (suite) await suite(tx);
      },
    });
  }
  if (prop.skill === "inventaire-assets") {
    const suite = options.dansTransaction;
    return appliquerProposition(prop.id, {
      ...options,
      dansTransaction: async (tx) => {
        await ecrireReferencesApresApplication(tx, prop.id);
        if (suite) await suite(tx);
      },
    });
  }
  return appliquerProposition(prop.id, options);
}
