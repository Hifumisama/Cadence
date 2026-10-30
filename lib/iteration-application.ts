import { and, eq, inArray, max } from "drizzle-orm";
import { db } from "../db";
import { jobs, plans } from "../db/schema";
import { appliquerSelection, cocherChangements, genererPromptsAssetsCrees, propositionParUuid } from "./agents/service";
import { decisionIteration } from "./fiche-plan";
import { creerJobRelance } from "./job-relance";
import { DUREE_GENERATION_MAX, DUREE_GENERATION_MIN } from "./plan-checks";
import { lireProposition } from "./queries-agents";

export type Reglages = { dureeGenerationSecondes?: number; fps?: number; seed?: string };

/** Appliquer la correction d'« Itérer » ET créer l'essai (2026-10-17 : sorti de l'action de page pour que le pilote des demandes, côté
 * worker, l'appelle sans Next ; l'action `appliquerIterationEtGenerer` de app/plans/actions.ts l'enveloppe et revalide). */

/** Applique la correction de l'agent ET crée l'essai, dans une seule transaction : si l'un échoue, rien n'est écrit.
 * Les règles sont celles de l'action `appliquerIterationEtGenerer` (app/plans/actions.ts), qui l'enveloppe. */
export async function appliquerIterationEtGenererCore(
  planId: number,
  propositionUuid: string,
  essai: { consigne: string | null; depuisNumero: number | null; demandeId?: number },
  /** Réglages retouchés à la main dans la page (durée, FPS, seed), écrits dans la même transaction que l'essai. */
  reglages: Reglages = {},
): Promise<{ ok: true; numeroRendu: number; jobId: number; notes: string[] } | { ok: false; erreur: string }> {
  const { dureeGenerationSecondes: duree, fps, seed } = reglages;
  if (duree != null && (!Number.isInteger(duree) || duree < DUREE_GENERATION_MIN || duree > DUREE_GENERATION_MAX)) {
    return { ok: false, erreur: `Durée de génération : entre ${DUREE_GENERATION_MIN} et ${DUREE_GENERATION_MAX} s.` };
  }
  if (fps != null && (!Number.isInteger(fps) || fps < 1)) return { ok: false, erreur: "FPS invalide." };
  if (seed != null && !/^\d{1,15}$/.test(seed)) return { ok: false, erreur: "Seed invalide : 15 chiffres au plus." };
  const prop = await propositionParUuid(propositionUuid);
  if (!prop || (prop.skill !== "iteration-plan" && prop.skill !== "plan-h3") || prop.portee !== "plan" || prop.cibleId !== planId) return { ok: false, erreur: "Proposition introuvable pour ce plan." };
  const vue = await lireProposition(propositionUuid);
  const decision = decisionIteration(vue);
  if (decision.action === "attendre") return { ok: false, erreur: "L'agent n'a pas encore fini de répondre." };
  if (decision.action === "echec") return { ok: false, erreur: decision.erreur };
  if (decision.action === "rien") return { ok: false, erreur: decision.message };
  if (decision.action === "reecrire") return { ok: false, erreur: "Cette correction change ce qui se passe dans le plan : sa fiche doit être réécrite, depuis « Itérer »." };

  const enFile = await db.select({ id: jobs.id }).from(jobs).where(and(eq(jobs.planId, planId), inArray(jobs.statut, ["en_attente", "en_cours"]))).limit(1);
  if (enFile.length > 0) return { ok: false, erreur: "Un essai est déjà en file ou en cours sur ce plan : rien n'a été appliqué." };

  const c = await cocherChangements(propositionUuid, { ids: decision.ids }, true);
  if (!c.ok) return { ok: false, erreur: c.erreur };
  try {
    const r = await appliquerSelection(propositionUuid, {
      // Lancer « Itérer » consent à écraser le prompt actuel : il reste dans l'essai précédent.
      confirmeEcrasement: true,
      dansTransaction: async (tx) => {
        if (fps != null || duree != null || seed != null) {
          await tx
            .update(plans)
            .set({ ...(fps != null ? { fps } : {}), ...(duree != null ? { dureeGenerationSecondes: duree, dureeMontageSecondes: duree } : {}), ...(seed != null ? { seed } : {}), updatedAt: new Date() })
            .where(eq(plans.id, planId));
        }
        await creerJobRelance(planId, false, false, { consigne: essai.consigne, depuisNumero: essai.depuisNumero, alertesIteration: decision.notes, demandeId: essai.demandeId }, tx);
      },
    });
    if (!r.ok) return { ok: false, erreur: r.erreur };
  } catch (e) {
    return { ok: false, erreur: `Rien n'a été appliqué ni généré : ${e instanceof Error ? e.message : "erreur inattendue"}.` };
  }
  const notes = [...decision.notes];
  // Les assets créés avec la correction n'ont ni prompt ni image : leurs prompts s'écrivent à part (une proposition à relire dans la conversation du
  // projet), sans retarder l'essai déjà en file. Un échec n'annule rien : le bouton « écrire les prompts » reste sur la proposition.
  const idsCreations = new Set(vue!.groupes.flatMap((g) => g.changements).filter((x) => x.cibleType === "asset").map((x) => x.id));
  if (decision.ids.some((id) => idsCreations.has(id))) {
    const g = await genererPromptsAssetsCrees(propositionUuid).catch((e: unknown) => ({ ok: false as const, erreur: e instanceof Error ? e.message : "erreur inattendue" }));
    notes.push(g.ok ? "Les prompts d'image des assets créés s'écrivent dans la conversation du projet : relis-les, puis génère les images." : `Les prompts d'image des assets créés n'ont pas été lancés (${g.erreur}) : lance-les depuis la proposition.`);
  }
  const [dernier] = await db.select({ n: max(jobs.numeroRendu), id: max(jobs.id) }).from(jobs).where(eq(jobs.planId, planId));
  return { ok: true, numeroRendu: dernier?.n ?? 1, jobId: dernier?.id ?? 0, notes };
}
