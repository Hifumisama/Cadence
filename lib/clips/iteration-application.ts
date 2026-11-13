import { and, eq, inArray, max } from "drizzle-orm";
import { db } from "../../db";
import { jobs, plans } from "../../db/schema";
import { appliquerSelection, propositionParUuid } from "../agents/service-proposals";
import { genererPromptsAssetsCrees } from "../agents/service-assets";
import { decisionIteration } from "./clip-sheet";
import { SKILL_H3IR } from "../h3ir/result";
import { creerJobRelance } from "../renders/job-retry";
import { DUREE_GENERATION_MAX, DUREE_GENERATION_MIN } from "./clip-checks";
import { lireProposition } from "../agents/queries-agents";

export type Reglages = { dureeGenerationSecondes?: number; fps?: number; seed?: string };

/** Apply the « Itérer » correction AND create the attempt (2026-10-17: moved out of the page action so that the request pilot, worker-side,
 * calls it without Next; the `appliquerIterationEtGenerer` action of app/plans/actions.ts wraps it and revalidates). */

/** Applies the agent's correction AND creates the attempt, in a single transaction: if one fails, nothing is written.
 * The rules are those of the action `appliquerIterationEtGenerer` (app/plans/actions.ts), which wraps it. */
export async function appliquerIterationEtGenererCore(
  planId: number,
  propositionUuid: string,
  /** `notes`: what the iteration agent flagged (its decisions), kept on the attempt before those of the application. */
  essai: { consigne: string | null; depuisNumero: number | null; demandeId?: number; notes?: string[] },
  /** Settings edited by hand on the page (duration, FPS, seed), written in the same transaction as the attempt. */
  reglages: Reglages = {},
): Promise<{ ok: true; numeroRendu: number; jobId: number; notes: string[] } | { ok: false; erreur: string }> {
  const { dureeGenerationSecondes: duree, fps, seed } = reglages;
  if (duree != null && (!Number.isInteger(duree) || duree < DUREE_GENERATION_MIN || duree > DUREE_GENERATION_MAX)) {
    return { ok: false, erreur: `Durée de génération : entre ${DUREE_GENERATION_MIN} et ${DUREE_GENERATION_MAX} s.` };
  }
  if (fps != null && (!Number.isInteger(fps) || fps < 1)) return { ok: false, erreur: "FPS invalide." };
  if (seed != null && !/^\d{1,15}$/.test(seed)) return { ok: false, erreur: "Seed invalide : 15 chiffres au plus." };
  const prop = await propositionParUuid(propositionUuid);
  // Since 2026-11-09, « Itérer » applies the sheet RECOMPILED by Open H3 IR (`plan-h3ir`, lib/agents/service-clips.ts, genererReecriturePlan) with the
  // agent's decisions; an `iteration-plan` proposal no longer carries a change (it gives « reecrire »).
  if (!prop || (prop.skill !== "iteration-plan" && prop.skill !== SKILL_H3IR) || prop.portee !== "plan" || prop.cibleId !== planId) return { ok: false, erreur: "Proposition introuvable pour ce plan." };
  const vue = await lireProposition(propositionUuid);
  const decision = decisionIteration(vue);
  if (decision.action === "attendre") return { ok: false, erreur: "L'agent n'a pas encore fini de répondre." };
  if (decision.action === "echec") return { ok: false, erreur: decision.erreur };
  if (decision.action === "rien") return { ok: false, erreur: decision.message };
  if (decision.action === "reecrire") return { ok: false, erreur: "Cette correction se recompile par Open H3 IR : relance-la depuis « Itérer »." };

  const enFile = await db.select({ id: jobs.id }).from(jobs).where(and(eq(jobs.planId, planId), inArray(jobs.statut, ["en_attente", "en_cours"]))).limit(1);
  if (enFile.length > 0) return { ok: false, erreur: "Un essai est déjà en file ou en cours sur ce plan : rien n'a été appliqué." };

  const notesEssai = [...(essai.notes ?? []), ...decision.notes.filter((n) => !(essai.notes ?? []).includes(n))];
  try {
    const r = await appliquerSelection(propositionUuid, {
      ids: decision.ids,
      // Lancer « Itérer » consent à écraser le prompt actuel : il reste dans l'essai précédent.
      confirmeEcrasement: true,
      dansTransaction: async (tx) => {
        if (fps != null || duree != null || seed != null) {
          await tx
            .update(plans)
            .set({ ...(fps != null ? { fps } : {}), ...(duree != null ? { dureeGenerationSecondes: duree, dureeMontageSecondes: duree } : {}), ...(seed != null ? { seed } : {}), updatedAt: new Date() })
            .where(eq(plans.id, planId));
        }
        await creerJobRelance(planId, false, false, { consigne: essai.consigne, depuisNumero: essai.depuisNumero, alertesIteration: notesEssai, demandeId: essai.demandeId }, tx);
      },
    });
    if (!r.ok) return { ok: false, erreur: r.erreur };
  } catch (e) {
    return { ok: false, erreur: `Rien n'a été appliqué ni généré : ${e instanceof Error ? e.message : "erreur inattendue"}.` };
  }
  const notes = [...notesEssai];
  // The assets created with the correction have neither prompt nor image: their prompts are written separately (a proposal to review in the project's
  // conversation), without delaying the attempt already queued. A failure cancels nothing: the « écrire les prompts » button stays on the proposal.
  const idsCreations = new Set(vue!.groupes.flatMap((g) => g.changements).filter((x) => x.cibleType === "asset").map((x) => x.id));
  if (decision.ids.some((id) => idsCreations.has(id))) {
    const g = await genererPromptsAssetsCrees(propositionUuid).catch((e: unknown) => ({ ok: false as const, erreur: e instanceof Error ? e.message : "erreur inattendue" }));
    notes.push(g.ok ? "Les prompts d'image des assets créés s'écrivent dans la conversation du projet : relis-les, puis génère les images." : `Les prompts d'image des assets créés n'ont pas été lancés (${g.erreur}) : lance-les depuis la proposition.`);
  }
  const [dernier] = await db.select({ n: max(jobs.numeroRendu), id: max(jobs.id) }).from(jobs).where(eq(jobs.planId, planId));
  return { ok: true, numeroRendu: dernier?.n ?? 1, jobId: dernier?.id ?? 0, notes };
}
