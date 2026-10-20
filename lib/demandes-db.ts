import { and, eq } from "drizzle-orm";
import { db } from "../db";
import { agentConversations, agentRuns, demandes, jobs, propositions } from "../db/schema";
import { conversationParUuid, genererIteration, genererReecriturePlan } from "./agents/service";
import { demanderAnnulation } from "./annulation-db";
import {
  avancerEtapes,
  deciderIteration,
  etapeCouranteDemande,
  etapesIterationPlan,
  type CleEtapeIteration,
  type ContexteIteration,
  type EtapeDemande,
  type ObservationIteration,
  type StatutDemande,
} from "./demandes";
import { decisionIteration } from "./fiche-plan";
import { appliquerIterationEtGenererCore } from "./iteration-application";
import { lireProposition } from "./queries-agents";
import { cleLlm, cleVideo } from "./taches";
import type { Resultat } from "./agents/types";

/** Le PILOTE des demandes (règles dans lib/demandes.ts). `piloterDemandes` est appelé à chaque tour de la boucle « installateur » du
 * worker : une transition au plus par demande en cours, état dans `demandes` (reprise sur redémarrage, rien en mémoire). Une seule
 * boucle le fait tourner, donc pas de course entre deux pilotes. Ne touche jamais au GPU : il pose des tâches, les voies les prennent. */

export type LigneDemande = typeof demandes.$inferSelect;
const ERR = (erreur: string) => ({ ok: false as const, erreur });

const lireEtapes = (d: LigneDemande): EtapeDemande[] => (Array.isArray(d.etapes) ? (d.etapes as EtapeDemande[]) : []);
const lireContexte = (d: LigneDemande): ContexteIteration => d.contexte as ContexteIteration;

/** « Itérer » un plan : UNE demande (consigne → agent → réécriture si besoin → rendu). Refusée si le plan en a déjà une en cours. */
export async function lancerDemandeIteration(
  conversationUuid: string,
  options: { retour: string; renduId?: number | null; planche?: boolean; depuisNumero: number | null; reglages?: ContexteIteration["reglages"] },
): Promise<Resultat<{ demandeId: number; demandeUuid: string; runUuid: string; propositionUuid: string }>> {
  const conv = await conversationParUuid(conversationUuid);
  if (!conv) return ERR("Conversation introuvable.");
  if (conv.portee !== "plan" || conv.cibleId == null) return ERR("« Itérer » se demande depuis la page d'un plan.");
  const contexte: ContexteIteration = { consigne: options.retour.trim(), depuisNumero: options.depuisNumero, reglages: options.reglages ?? {} };
  let demande: { id: number; uuid: string };
  try {
    const [d] = await db
      .insert(demandes)
      .values({ projectId: conv.projectId, type: "iteration-plan", cibleType: "plan", cibleId: conv.cibleId, etapes: etapesIterationPlan(), contexte })
      .returning({ id: demandes.id, uuid: demandes.uuid });
    demande = d!;
  } catch {
    // L'index unique partiel : une demande est déjà en cours sur ce plan.
    return ERR("Une itération est déjà en cours sur ce plan : attends qu'elle finisse (ou annule-la depuis le panneau des tâches).");
  }
  const g = await genererIteration(conversationUuid, { retour: options.retour, renduId: options.renduId, planche: options.planche, demandeId: demande.id });
  if (!g.ok) {
    await db.delete(demandes).where(eq(demandes.id, demande.id)); // rien n'est parti : la demande n'a jamais existé
    return g;
  }
  await db.update(demandes).set({ contexte: { ...contexte, runUuid: g.runUuid }, updatedAt: new Date() }).where(eq(demandes.id, demande.id));
  return { ok: true, demandeId: demande.id, demandeUuid: demande.uuid, runUuid: g.runUuid, propositionUuid: g.propositionUuid };
}

async function ecrire(d: LigneDemande, maj: { etapes?: EtapeDemande[]; contexte?: ContexteIteration; statut?: StatutDemande; erreur?: string | null }): Promise<void> {
  const fin = maj.statut && maj.statut !== "en_cours";
  await db
    .update(demandes)
    .set({
      ...(maj.etapes ? { etapes: maj.etapes } : {}),
      ...(maj.contexte ? { contexte: maj.contexte } : {}),
      ...(maj.statut ? { statut: maj.statut } : {}),
      ...(maj.erreur !== undefined ? { erreur: maj.erreur } : {}),
      ...(fin ? { finishedAt: new Date() } : {}),
      updatedAt: new Date(),
    })
    .where(and(eq(demandes.id, d.id), eq(demandes.statut, "en_cours"))); // une demande annulée entre-temps ne se rouvre pas
}

/** Un tour du pilote : fait avancer chaque demande en cours d'une transition. Ne rejette jamais (une demande qui plante passe en échec
 * avec son message, les autres continuent). Renvoie combien de demandes sont en cours et combien ont bougé. */
export async function piloterDemandes(): Promise<{ actives: number; touchees: number }> {
  const lignes = await db.select().from(demandes).where(eq(demandes.statut, "en_cours"));
  let touchees = 0;
  for (const d of lignes) {
    try {
      if (await avancer(d)) touchees += 1;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[worker] Demande ${d.id} (${d.type}) : ${message}`);
      await ecrire(d, { statut: "echoue", erreur: message.slice(0, 500) });
      touchees += 1;
    }
  }
  return { actives: lignes.length, touchees };
}

async function observer(d: LigneDemande, cle: CleEtapeIteration, ctx: ContexteIteration): Promise<{ obs: ObservationIteration; propositionUuid: string | null; conversationUuid: string | null }> {
  if (cle === "rendu") {
    const [j] = ctx.jobId != null ? await db.select({ statut: jobs.statut, erreur: jobs.erreur }).from(jobs).where(eq(jobs.id, ctx.jobId)) : [];
    return { obs: { tache: j ? { genre: "job", statut: j.statut, erreur: j.erreur } : null, decision: null }, propositionUuid: null, conversationUuid: null };
  }
  const [r] = ctx.runUuid ? await db.select().from(agentRuns).where(eq(agentRuns.uuid, ctx.runUuid)) : [];
  if (!r) return { obs: { tache: null, decision: null }, propositionUuid: null, conversationUuid: null };
  const tache = { genre: "run" as const, statut: r.statut, erreur: r.erreur };
  const [prop] = r.propositionId ? await db.select({ uuid: propositions.uuid }).from(propositions).where(eq(propositions.id, r.propositionId)) : [];
  const [conv] = r.conversationId ? await db.select({ uuid: agentConversations.uuid }).from(agentConversations).where(eq(agentConversations.id, r.conversationId)) : [];
  const decision = r.statut === "termine" && prop ? decisionIteration(await lireProposition(prop.uuid)) : null;
  return { obs: { tache, decision }, propositionUuid: prop?.uuid ?? null, conversationUuid: conv?.uuid ?? null };
}

async function avancer(d: LigneDemande): Promise<boolean> {
  if (d.type !== "iteration-plan") return false;
  const etapes = lireEtapes(d);
  const ctx = lireContexte(d);
  const cur = etapeCouranteDemande(etapes);
  if (!cur) {
    await ecrire(d, { statut: "termine" });
    return true;
  }
  const cle = cur.cle as CleEtapeIteration;
  const { obs, propositionUuid, conversationUuid } = await observer(d, cle, ctx);
  const decision = deciderIteration(cle, obs);

  switch (decision.type) {
    case "attendre":
      return false;
    case "annuler":
      await ecrire(d, { statut: "annulee", erreur: null });
      return true;
    case "echouer":
      await ecrire(d, { statut: "echoue", erreur: decision.erreur });
      return true;
    case "terminer":
      await ecrire(d, { statut: "termine", etapes: avancerEtapes(etapes, "rendu", "fait"), erreur: null });
      return true;
    case "appliquer": {
      if (!propositionUuid) {
        await ecrire(d, { statut: "echoue", erreur: "La proposition de cette étape est introuvable." });
        return true;
      }
      const r = await appliquerIterationEtGenererCore(d.cibleId, propositionUuid, { consigne: ctx.consigne, depuisNumero: ctx.depuisNumero, demandeId: d.id }, ctx.reglages ?? {});
      if (!r.ok) {
        await ecrire(d, { statut: "echoue", erreur: r.erreur });
        return true;
      }
      // Appliquée + rendu créé : la correction n'a pas eu besoin de réécriture si on était encore à l'étape « agent ».
      await ecrire(d, { etapes: avancerEtapes(etapes, cle, "fait", cle === "agent" ? ["reecriture"] : []), contexte: { ...ctx, jobId: r.jobId, numeroRendu: r.numeroRendu, notes: r.notes } });
      return true;
    }
    case "reecrire": {
      if (!conversationUuid) {
        await ecrire(d, { statut: "echoue", erreur: "Conversation introuvable." });
        return true;
      }
      const g = await genererReecriturePlan(conversationUuid, {
        consigne: ctx.consigne,
        description: decision.description,
        ...(decision.dureeSecondes ? { dureeSecondes: decision.dureeSecondes } : {}),
        demandeId: d.id,
      });
      if (!g.ok) {
        if (/déjà en cours/i.test(g.erreur)) return false; // la conversation est prise par autre chose : au prochain tour
        await ecrire(d, { statut: "echoue", erreur: g.erreur });
        return true;
      }
      await ecrire(d, { etapes: avancerEtapes(etapes, "agent", "fait"), contexte: { ...ctx, runUuid: g.runUuid } });
      return true;
    }
  }
}

/** Annule la demande : elle passe à « annulée » tout de suite (le pilote ne la touche plus) et la tâche en cours est annulée avec elle
 * (en file : retirée ; en cours : le worker l'interrompt). Ce qui est déjà écrit n'est pas défait. */
export async function annulerDemande(demandeId: number): Promise<"annulee" | "rien"> {
  const [d] = await db.select().from(demandes).where(eq(demandes.id, demandeId));
  if (!d || d.statut !== "en_cours") return "rien";
  await ecrire(d, { statut: "annulee", erreur: null });
  const ctx = lireContexte(d);
  const cur = etapeCouranteDemande(lireEtapes(d));
  if (cur?.cle === "rendu" && ctx.jobId != null) await demanderAnnulation(cleVideo(ctx.jobId));
  else if (ctx.runUuid) await demanderAnnulation(cleLlm(ctx.runUuid));
  return "annulee";
}

/** Ce que la page d'un plan lit pour suivre sa demande (sondage). */
export type VueDemande = {
  statut: StatutDemande;
  etapes: EtapeDemande[];
  /** Étape en cours (libellé), null quand c'est fini. */
  etapeLibelle: string | null;
  erreur: string | null;
  /** Le rendu créé (étape « rendu » atteinte) : la page peut accuser le lancement. */
  numeroRendu: number | null;
  notes: string[];
};

export async function lireDemandeVue(demandeId: number): Promise<VueDemande | null> {
  const [d] = await db.select().from(demandes).where(eq(demandes.id, demandeId));
  if (!d) return null;
  const ctx = lireContexte(d);
  const etapes = lireEtapes(d);
  return {
    statut: d.statut as StatutDemande,
    etapes,
    etapeLibelle: etapeCouranteDemande(etapes)?.libelle ?? null,
    erreur: d.erreur,
    numeroRendu: ctx.jobId != null ? (ctx.numeroRendu ?? null) : null,
    notes: ctx.notes ?? [],
  };
}

