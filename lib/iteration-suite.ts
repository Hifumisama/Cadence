import { and, eq, inArray, lt, max, notInArray, sql } from "drizzle-orm";
import { db } from "../db";
import { agentConversations, agentRuns, jobs, plans, propositions } from "../db/schema";
import { appliquerSelection, cocherChangements, genererPromptsAssetsCrees, genererReecriturePlan, propositionParUuid } from "./agents/service";
import { decisionIteration } from "./fiche-plan";
import { creerJobRelance } from "./job-relance";
import { DUREE_GENERATION_MAX, DUREE_GENERATION_MIN } from "./plan-checks";
import { lireProposition } from "./queries-agents";

/** L'ENCHAÎNEMENT d'« Itérer », côté serveur (2026-10-17). Avant, c'était la page (IntentionPlan) qui enchaînait : l'agent
 * d'itération répond, puis (consigne qui change le plan) plan-h3 réécrit la fiche, puis la correction est appliquée et l'essai
 * créé. Quitter la page entre deux, c'était perdre la suite sans message (ex. le 16 octobre : proposition « prête » restée
 * sans plan-h3 derrière).
 *
 * Désormais « Itérer » marque son run d'une `chaine` (dans `agent_runs.options`) : ce qu'il faut pour finir (consigne, essai
 * de départ, réglages retouchés à la main). Chaque maillon (iteration-plan, puis plan-h3 d'une réécriture) est SUIVI par
 * `suiteIteration`, qui prend la chaîne (une seule fois, de façon atomique) et fait l'étape d'après. Deux appelants : la page
 * quand elle est encore là (elle y gagne le résultat à afficher), et le worker (`piloterIterations`) quand elle n'y est plus. */

export type Reglages = { dureeGenerationSecondes?: number; fps?: number; seed?: string };
export type Chaine = {
  etat: "attente" | "prise" | "fait";
  consigne: string;
  depuisNumero: number | null;
  reglages: Reglages;
  /** Ce qui s'est passé à la fin de ce maillon (message à montrer si la page revient). */
  issue?: string;
};

/** Applique la correction de l'agent ET crée l'essai, dans une seule transaction : si l'un échoue, rien n'est écrit.
 * Les règles sont celles de l'action `appliquerIterationEtGenerer` (app/plans/actions.ts), qui l'enveloppe. */
export async function appliquerIterationEtGenererCore(
  planId: number,
  propositionUuid: string,
  essai: { consigne: string | null; depuisNumero: number | null },
  /** Réglages retouchés à la main dans la page (durée, FPS, seed), écrits dans la même transaction que l'essai. */
  reglages: Reglages = {},
): Promise<{ ok: true; numeroRendu: number; notes: string[] } | { ok: false; erreur: string }> {
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
        await creerJobRelance(planId, false, false, { consigne: essai.consigne, depuisNumero: essai.depuisNumero, alertesIteration: decision.notes }, tx);
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
  const [dernier] = await db.select({ n: max(jobs.numeroRendu) }).from(jobs).where(eq(jobs.planId, planId));
  return { ok: true, numeroRendu: dernier?.n ?? 1, notes };
}

export type ResultatSuite =
  | { ok: true; etape: "essai"; numeroRendu: number; notes: string[] }
  | { ok: true; etape: "reecriture"; propositionUuid: string; runUuid: string }
  | { ok: true; etape: "attendre" }
  | { ok: false; erreur: string };

const ENCOURS = ["en_attente", "en_cours"];

/** Change l'état de la chaîne d'un run (et la phrase qui dit ce qui s'est passé), sans toucher au reste de ses options. */
async function majChaine(runId: number, etat: Chaine["etat"], issue?: string): Promise<void> {
  const patch = JSON.stringify(issue ? { etat, issue } : { etat });
  await db
    .update(agentRuns)
    .set({ options: sql`${agentRuns.options} || jsonb_build_object('chaine', (${agentRuns.options}->'chaine') || ${patch}::jsonb)` })
    .where(eq(agentRuns.id, runId));
}

/** Fait l'étape d'après pour un run marqué d'une chaîne, une seule fois (la prise est atomique : la page et le worker ne
 * peuvent pas la faire en double). Rend `attendre` quand ce n'est pas le moment (run en cours, conversation occupée, déjà
 * prise) : la chaîne reste à prendre ou est entre les mains de l'autre appelant. */
export async function suiteIteration(runUuid: string): Promise<ResultatSuite> {
  const [run] = await db.select().from(agentRuns).where(eq(agentRuns.uuid, runUuid));
  if (!run) return { ok: false, erreur: "Tâche introuvable." };
  const chaine = (run.options as { chaine?: Chaine } | null)?.chaine;
  if (!chaine) return { ok: false, erreur: "Cette tâche n'a pas de suite à donner." };
  if (ENCOURS.includes(run.statut)) return { ok: true, etape: "attendre" };
  if (chaine.etat === "fait") return { ok: false, erreur: chaine.issue ?? "La suite a déjà été donnée à cette tâche." };

  // Prise atomique : une seule ligne passe de « attente » à « prise ».
  const pris = await db
    .update(agentRuns)
    .set({ options: sql`${agentRuns.options} || jsonb_build_object('chaine', (${agentRuns.options}->'chaine') || '{"etat":"prise"}'::jsonb)` })
    .where(and(eq(agentRuns.id, run.id), sql`${agentRuns.options}->'chaine'->>'etat' = 'attente'`, notInArray(agentRuns.statut, ENCOURS)))
    .returning({ id: agentRuns.id });
  if (pris.length === 0) return { ok: true, etape: "attendre" };

  const fini = async (issue: string): Promise<ResultatSuite> => {
    await majChaine(run.id, "fait", issue);
    return { ok: false, erreur: issue };
  };
  try {
    if (!run.propositionId) return await fini("Cette tâche n'a pas de proposition.");
    const [prop] = await db.select({ uuid: propositions.uuid, cibleId: propositions.cibleId, portee: propositions.portee }).from(propositions).where(eq(propositions.id, run.propositionId));
    if (!prop || prop.portee !== "plan" || prop.cibleId == null) return await fini("Proposition introuvable.");
    const decision = decisionIteration(await lireProposition(prop.uuid));
    if (decision.action === "attendre") {
      await majChaine(run.id, "attente");
      return { ok: true, etape: "attendre" };
    }
    if (decision.action === "echec") return await fini(decision.erreur);
    if (decision.action === "rien") return await fini(decision.message);

    if (decision.action === "appliquer") {
      const r = await appliquerIterationEtGenererCore(prop.cibleId, prop.uuid, { consigne: chaine.consigne, depuisNumero: chaine.depuisNumero }, chaine.reglages ?? {});
      if (!r.ok) return await fini(r.erreur);
      await majChaine(run.id, "fait", `Essai n°${r.numeroRendu} lancé.`);
      return { ok: true, etape: "essai", numeroRendu: r.numeroRendu, notes: r.notes };
    }
    // reecrire : la fiche est réécrite par plan-h3 depuis la nouvelle description ; ce nouveau run porte la chaîne à son tour.
    if (!run.conversationId) return await fini("Conversation introuvable.");
    const [conv] = await db.select({ uuid: agentConversations.uuid }).from(agentConversations).where(eq(agentConversations.id, run.conversationId));
    if (!conv) return await fini("Conversation introuvable.");
    const g = await genererReecriturePlan(conv.uuid, {
      consigne: chaine.consigne,
      description: decision.description,
      ...(decision.dureeSecondes ? { dureeSecondes: decision.dureeSecondes } : {}),
      chaine: { consigne: chaine.consigne, depuisNumero: chaine.depuisNumero, reglages: chaine.reglages ?? {} },
    });
    if (!g.ok) {
      if (/déjà en cours/i.test(g.erreur)) {
        // La conversation est prise par autre chose : on réessaiera au prochain tour.
        await majChaine(run.id, "attente");
        return { ok: true, etape: "attendre" };
      }
      return await fini(g.erreur);
    }
    await majChaine(run.id, "fait", "Fiche en cours de réécriture.");
    return { ok: true, etape: "reecriture", propositionUuid: g.propositionUuid, runUuid: g.runUuid };
  } catch (e) {
    return await fini(e instanceof Error ? e.message : "erreur inattendue");
  }
}

/** Un run dont la chaîne attend est laissé à la page ce temps-là (elle a le résultat à afficher), puis repris par le worker. */
const DELAI_PAGE_MS = 20_000;

/** Un tour du worker : donne la suite aux chaînes que personne n'a prises. Renvoie le nombre de chaînes touchées. */
export async function piloterIterations(): Promise<number> {
  const limite = new Date(Date.now() - DELAI_PAGE_MS);
  const lignes = await db
    .select({ uuid: agentRuns.uuid })
    .from(agentRuns)
    .where(and(sql`${agentRuns.options}->'chaine'->>'etat' = 'attente'`, notInArray(agentRuns.statut, ENCOURS), lt(agentRuns.finishedAt, limite)));
  let touchees = 0;
  for (const l of lignes) {
    try {
      const r = await suiteIteration(l.uuid);
      if (!r.ok || r.etape !== "attendre") touchees += 1;
    } catch (err) {
      console.error(`[worker] Suite d'itération ${l.uuid} :`, err);
    }
  }
  return touchees;
}
