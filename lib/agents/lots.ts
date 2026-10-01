import { and, asc, count, eq, inArray, isNotNull } from "drizzle-orm";
import { db } from "../../db";
import { agentConversations, agentRuns, propositionChangements, propositions } from "../../db/schema";
import type { Tx } from "../ordre-plans";
import {
  comptesLot,
  dernieresSousTaches,
  erreurDuLot,
  episodeIdDeCle,
  statutPropositionDuLot,
  type RunLot,
  type StatutRun,
} from "./lots-pur";
import { resumeAutomatique } from "./proposition-db";
import type { CibleType, Operation, VueLot, VueSousTache } from "./types";

/** Lots du système d'agents côté base : lire les sous-tâches d'une proposition, décider de son
 * statut quand l'une d'elles se termine, annuler le lot. Les règles pures sont dans
 * lib/agents/lots-pur.ts. Utilisé par le service, le worker (post-traitement) et le header. */

type DbOuTx = typeof db | Tx;

export function versRunLot(r: typeof agentRuns.$inferSelect): RunLot {
  return {
    id: r.id,
    uuid: r.uuid,
    cle: r.cleSousTache!,
    libelle: r.libelleSousTache,
    statut: r.statut as StatutRun,
    progressionJetons: r.progressionJetons,
    erreur: r.erreur,
    createdAt: r.createdAt,
    startedAt: r.startedAt,
    finishedAt: r.finishedAt,
    vuAt: r.vuAt,
    annulationDemandeeAt: r.annulationDemandeeAt,
  };
}

/** Toutes les tâches (relances comprises) d'une proposition en lot, de la plus ancienne à la plus récente. */
export async function runsDuLot(d: DbOuTx, propositionId: number): Promise<RunLot[]> {
  const lignes = await d
    .select()
    .from(agentRuns)
    .where(and(eq(agentRuns.propositionId, propositionId), isNotNull(agentRuns.cleSousTache)))
    .orderBy(asc(agentRuns.id));
  return lignes.map(versRunLot);
}

/** Décide du statut de la proposition d'un lot d'après ses sous-tâches, et le pose. À appeler à
 * CHAQUE fin de sous-tâche (réussie, échouée, annulée) et au démarrage du worker. `runTermineId` :
 * la tâche dont le résultat est en train d'être écrit dans la transaction courante (son statut
 * « terminé » n'y est pas encore posé). Ne touche jamais une proposition appliquée ou rejetée. */
export async function finaliserLot(d: DbOuTx, propositionId: number, options: { runTermineId?: number } = {}): Promise<string | null> {
  const [prop] = await d.select().from(propositions).where(eq(propositions.id, propositionId));
  if (!prop || !prop.lot) return null;
  if (prop.statut !== "en_generation" && prop.statut !== "prete" && prop.statut !== "echouee") return prop.statut;

  const runs = (await runsDuLot(d, propositionId)).map((r) => (r.id === options.runTermineId ? { ...r, statut: "termine" as StatutRun } : r));
  const c = comptesLot(runs);
  const voulu = statutPropositionDuLot(c);

  if (voulu === "en_generation") {
    if (prop.statut !== "en_generation") await d.update(propositions).set({ statut: "en_generation", erreur: null }).where(eq(propositions.id, propositionId));
    return "en_generation";
  }

  if (voulu === "prete") {
    const lignes = await d
      .select({ operation: propositionChangements.operation, cibleType: propositionChangements.cibleType, refuseRaison: propositionChangements.refuseRaison })
      .from(propositionChangements)
      .where(eq(propositionChangements.propositionId, propositionId));
    const base = resumeAutomatique(lignes.map((l) => ({ operation: l.operation as Operation, cibleType: l.cibleType as CibleType, refuseRaison: l.refuseRaison })));
    const aRelancer = c.echecs + c.annulees;
    const resume = `${c.terminees} sous-tâche${c.terminees > 1 ? "s" : ""} sur ${c.total} terminée${c.terminees > 1 ? "s" : ""}. ${base}${aRelancer > 0 ? ` ${aRelancer} à relancer.` : ""}`;
    await d.update(propositions).set({ statut: "prete", erreur: null, resume }).where(eq(propositions.id, propositionId));
    if (prop.conversationId != null) {
      await d.update(agentConversations).set({ etape: "proposition", updatedAt: new Date() }).where(eq(agentConversations.id, prop.conversationId));
    }
    return "prete";
  }

  if (voulu === "rejetee") {
    await d.update(propositions).set({ statut: "rejetee", erreur: null }).where(eq(propositions.id, propositionId));
    await revenirApresLot(d, prop.conversationId, propositionId);
    return "rejetee";
  }

  await d.update(propositions).set({ statut: "echouee", erreur: erreurDuLot(runs) }).where(eq(propositions.id, propositionId));
  return "echouee";
}

/** La conversation quitte l'étape « proposition » d'un lot abandonné : retour à la consigne (courte)
 * ou à l'étape « appliqué » (complète : c'est là que se propose « Continuer »). */
async function revenirApresLot(d: DbOuTx, conversationId: number | null, propositionId: number): Promise<void> {
  if (conversationId == null) return;
  const [conv] = await d.select().from(agentConversations).where(eq(agentConversations.id, conversationId));
  if (!conv || conv.propositionId !== propositionId) return;
  await d
    .update(agentConversations)
    .set({ propositionId: null, etape: conv.profondeur === "complete" ? "applique" : "consigne", updatedAt: new Date() })
    .where(eq(agentConversations.id, conversationId));
}

/** Les propositions en lot encore « en génération » dont plus aucune tâche n'est active (worker
 * arrêté, tâche annulée entre-temps) : leur statut est rattrapé. Au démarrage du worker. */
export async function finaliserLotsOrphelins(d: DbOuTx = db): Promise<number> {
  const ouvertes = await d.select({ id: propositions.id }).from(propositions).where(and(eq(propositions.lot, true), eq(propositions.statut, "en_generation")));
  let n = 0;
  for (const p of ouvertes) {
    const avant = "en_generation";
    const apres = await finaliserLot(d, p.id);
    if (apres && apres !== avant) n++;
  }
  return n;
}

/** Arrête des tâches d'agent : celles en attente sont annulées, celles en cours reçoivent le drapeau
 * d'annulation (le worker coupe la connexion au serveur LLM). */
export async function annulerRunsDePropositions(d: DbOuTx, propositionIds: number[]): Promise<void> {
  if (propositionIds.length === 0) return;
  const maintenant = new Date();
  await d
    .update(agentRuns)
    .set({ statut: "annulee", finishedAt: maintenant, erreur: null })
    .where(and(inArray(agentRuns.propositionId, propositionIds), eq(agentRuns.statut, "en_attente")));
  await d
    .update(agentRuns)
    .set({ annulationDemandeeAt: maintenant })
    .where(and(inArray(agentRuns.propositionId, propositionIds), eq(agentRuns.statut, "en_cours")));
}

export type ResultatAnnulationLot = "annule" | "demande" | "rien";

/** Annule un lot : les sous-tâches en attente sont annulées tout de suite, celle qui tourne est
 * interrompue (drapeau). Ce qui est déjà terminé reste relisible : la proposition devient `prete`
 * s'il y a au moins un résultat, `rejetee` sinon. Idempotent. */
export async function annulerLot(propositionUuid: string): Promise<ResultatAnnulationLot> {
  if (!/^[0-9a-f-]{36}$/i.test(propositionUuid)) return "rien";
  const [prop] = await db.select().from(propositions).where(eq(propositions.uuid, propositionUuid));
  if (!prop || !prop.lot) return "rien";
  const runs = await runsDuLot(db, prop.id);
  const actifs = dernieresSousTaches(runs).filter((x) => x.run.statut === "en_attente" || x.run.statut === "en_cours");
  if (actifs.length === 0) return "rien";
  const enCours = actifs.some((x) => x.run.statut === "en_cours");
  await annulerRunsDePropositions(db, [prop.id]);
  // Sans sous-tâche en cours, plus rien n'attend : le statut se décide tout de suite.
  if (!enCours) await finaliserLot(db, prop.id);
  return enCours ? "demande" : "annule";
}

/** La vue d'un lot pour la popup : une ligne par sous-tâche (la dernière posée pour chaque clé). */
export async function vueLot(propositionId: number, positionsFile: Map<number, number>): Promise<VueLot | null> {
  const runs = await runsDuLot(db, propositionId);
  if (runs.length === 0) return null;
  const comptes = await db
    .select({ sousTache: propositionChangements.sousTache, n: count() })
    .from(propositionChangements)
    .where(eq(propositionChangements.propositionId, propositionId))
    .groupBy(propositionChangements.sousTache);
  const parCle = new Map(comptes.map((c) => [c.sousTache ?? "", Number(c.n)]));
  const sousTaches: VueSousTache[] = dernieresSousTaches(runs).map(({ run, relancee }) => ({
    cle: run.cle,
    libelle: run.libelle ?? run.cle,
    episodeId: episodeIdDeCle(run.cle),
    runUuid: run.uuid,
    statut: run.statut as VueSousTache["statut"],
    progressionJetons: run.statut === "en_cours" ? run.progressionJetons : null,
    erreur: run.statut === "echoue" ? run.erreur : null,
    positionFile: run.statut === "en_attente" ? (positionsFile.get(run.id) ?? null) : null,
    nbChangements: parCle.get(run.cle) ?? 0,
    relancee,
  }));
  const c = comptesLot(runs);
  return { sousTaches, total: c.total, terminees: c.terminees, echecs: c.echecs, annulees: c.annulees, actives: c.actives };
}
