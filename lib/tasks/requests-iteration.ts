import { type ContexteIteration, etapesIterationEnAttente, etapesIterationPlan, etapeCouranteDemande, type CleEtapeIteration, type ObservationIteration, type EtapeDemande } from "./requests";
import type { Resultat } from "../agents/types";
import { conversationParUuid, ouvrirConversation } from "../agents/service-conversation";
import { db } from "../../db";
import { demandes, plans, jobs, agentRuns, propositions, agentConversations } from "../../db/schema";
import { and, eq, inArray, asc, desc } from "drizzle-orm";
import { genererIteration, genererReecriturePlan } from "../agents/service-clips";
import { precedentsDansLaChaine, choisirProchaineIteration } from "../clips/chains";
import { decisionIteration } from "../clips/clip-sheet";
import { lireProposition } from "../agents/queries-agents";
import { referencesApresDecisions } from "../h3ir/brief-clip";
import { ERR, LigneDemande, echouer, ecrire, lireContexte, lireEtapes } from "./requests-shared";
import { avancerPromptsImages } from "./requests-sheets";

const MAX_CONSIGNE = 4000;

/** « Itérer » a plan: ONE request (instruction → agent → rewrite if needed → render). A single iteration holds the place at a time (the GPU is shared):
 * if none is in progress it leaves at once, otherwise it waits (`en_attente`) in arrival order, its instruction editable until it leaves
 * (`modifierConsigneIteration`). Refused if the plan already has an iteration in progress or waiting. */
export async function lancerDemandeIteration(
  conversationUuid: string,
  options: { retour: string; renduId?: number | null; planche?: boolean; depuisNumero: number | null; reglages?: ContexteIteration["reglages"] },
): Promise<Resultat<{ demandeId: number; demandeUuid: string; runUuid: string | null; propositionUuid: string | null; enAttente: boolean }>> {
  const conv = await conversationParUuid(conversationUuid);
  if (!conv) return ERR("Conversation introuvable.");
  if (conv.portee !== "plan" || conv.cibleId == null) return ERR("« Itérer » se demande depuis la page d'un plan.");
  const consigne = options.retour.trim();
  if (consigne.length > MAX_CONSIGNE) return ERR(`Ta consigne est trop longue (${MAX_CONSIGNE} caractères au plus).`);
  const contexte: ContexteIteration = { consigne, depuisNumero: options.depuisNumero, reglages: options.reglages ?? {} };

  const iterations = await db
    .select({ id: demandes.id, statut: demandes.statut, cibleId: demandes.cibleId })
    .from(demandes)
    .where(and(eq(demandes.type, "iteration-plan"), inArray(demandes.statut, ["en_cours", "en_attente"])));
  const dejaSurCePlan = iterations.find((d) => d.cibleId === conv.cibleId);
  if (dejaSurCePlan) {
    return ERR(
      dejaSurCePlan.statut === "en_attente"
        ? "Une itération de ce plan attend déjà son tour : modifie sa consigne depuis le panneau des tâches, ou annule-la."
        : "Une itération est déjà en cours sur ce plan : attends qu'elle finisse (ou annule-la depuis le panneau des tâches).",
    );
  }

  // Someone already holds the place: the request waits, with no task posted. Everything needed to start it is kept in its context.
  if (iterations.length > 0) {
    const [d] = await db
      .insert(demandes)
      .values({
        projectId: conv.projectId,
        type: "iteration-plan",
        cibleType: "plan",
        cibleId: conv.cibleId,
        statut: "en_attente",
        etapes: etapesIterationEnAttente(),
        contexte: { ...contexte, conversationUuid, renduId: options.renduId ?? null, planche: options.planche === true },
      })
      .returning({ id: demandes.id, uuid: demandes.uuid });
    return { ok: true, demandeId: d!.id, demandeUuid: d!.uuid, runUuid: null, propositionUuid: null, enAttente: true };
  }

  let demande: { id: number; uuid: string };
  try {
    const [d] = await db
      .insert(demandes)
      .values({ projectId: conv.projectId, type: "iteration-plan", cibleType: "plan", cibleId: conv.cibleId, etapes: etapesIterationPlan(), contexte })
      .returning({ id: demandes.id, uuid: demandes.uuid });
    demande = d!;
  } catch {
    // The partial unique index: a request (of another type) is already in progress on this plan.
    return ERR("Une demande est déjà en cours sur ce plan : attends qu'elle finisse (ou annule-la depuis le panneau des tâches).");
  }
  const g = await genererIteration(conversationUuid, { retour: options.retour, renduId: options.renduId, planche: options.planche, demandeId: demande.id });
  if (!g.ok) {
    await db.delete(demandes).where(eq(demandes.id, demande.id)); // nothing was sent: the request never existed
    return g;
  }
  await db.update(demandes).set({ contexte: { ...contexte, runUuid: g.runUuid }, updatedAt: new Date() }).where(eq(demandes.id, demande.id));
  return { ok: true, demandeId: demande.id, demandeUuid: demande.uuid, runUuid: g.runUuid, propositionUuid: g.propositionUuid, enAttente: false };
}

/** Changes the instruction of an iteration waiting its turn (once started, the instruction has gone to the agent: no longer editable). */
export async function modifierConsigneIteration(demandeId: number, texte: string): Promise<Resultat<object>> {
  const t = texte.trim();
  if (!t) return ERR("Écris d'abord ce que tu veux changer.");
  if (t.length > MAX_CONSIGNE) return ERR(`Ta consigne est trop longue (${MAX_CONSIGNE} caractères au plus).`);
  const [d] = await db.select().from(demandes).where(eq(demandes.id, demandeId));
  if (!d || d.type !== "iteration-plan") return ERR("Cette itération n'existe plus.");
  if (d.statut !== "en_attente") return ERR("Cette itération a déjà démarré : sa consigne est partie à l'agent, elle n'est plus modifiable.");
  // The condition on the status closes the window where the pilot starts it between the read and the write.
  const r = await db
    .update(demandes)
    .set({ contexte: { ...lireContexte(d), consigne: t }, updatedAt: new Date() })
    .where(and(eq(demandes.id, demandeId), eq(demandes.statut, "en_attente")))
    .returning({ id: demandes.id });
  return r.length ? { ok: true } : ERR("Cette itération vient de démarrer : sa consigne n'est plus modifiable.");
}

/** The active iteration of this plan (in progress or waiting), if there is one: its instruction and its step. The plan's page shows them IN ALL CIRCUMSTANCES,
 * from the validation of « Itérer » to the end of the render (the attempt does not exist yet during the agent and the recompilation; only the request carries the instruction). */
export async function iterationDuPlan(planId: number): Promise<{ demandeId: number; statut: "en_cours" | "en_attente"; consigne: string; etape: string | null } | null> {
  const [d] = await db
    .select()
    .from(demandes)
    .where(and(eq(demandes.type, "iteration-plan"), eq(demandes.cibleType, "plan"), eq(demandes.cibleId, planId), inArray(demandes.statut, ["en_cours", "en_attente"])))
    .orderBy(asc(demandes.statut), desc(demandes.id)) // « en_attente » before « en_cours » alphabetically: only one can be in progress, we prefer that one if both exist
    .limit(2);
  if (!d) return null;
  return { demandeId: d.id, statut: d.statut as "en_cours" | "en_attente", consigne: lireContexte(d).consigne, etape: d.statut === "en_cours" ? (etapeCouranteDemande(lireEtapes(d))?.libelle ?? null) : null };
}

/** The iteration of this plan waiting its turn, if there is one: the plan's page leads back to it (the instruction is corrected there, until it leaves). */
export async function iterationEnAttenteDuPlan(planId: number): Promise<{ demandeId: number; consigne: string } | null> {
  const [d] = await db
    .select()
    .from(demandes)
    .where(and(eq(demandes.type, "iteration-plan"), eq(demandes.cibleType, "plan"), eq(demandes.cibleId, planId), eq(demandes.statut, "en_attente")))
    .limit(1);
  return d ? { demandeId: d.id, consigne: lireContexte(d).consigne } : null;
}

/** Moves up (−1) or down (+1) a waiting iteration in the queue by swapping its arrival date with its neighbour: the queue's order (the worker's pilot as well as the panel) is that of
 * `created_at`, so there is nothing else to store. No effect at the end of the queue or if one of the two has started. */
export async function deplacerIterationEnAttente(demandeId: number, sens: -1 | 1): Promise<Resultat<object>> {
  return db.transaction(async (tx) => {
    const file = await tx
      .select({ id: demandes.id, createdAt: demandes.createdAt })
      .from(demandes)
      .where(and(eq(demandes.type, "iteration-plan"), eq(demandes.statut, "en_attente")))
      .orderBy(asc(demandes.createdAt), asc(demandes.id));
    const i = file.findIndex((x) => x.id === demandeId);
    if (i < 0) return ERR("Cette itération a déjà démarré ou n'est plus en file.");
    const voisine = file[i + sens];
    if (!voisine) return { ok: true as const };
    const moi = file[i]!;
    // Identical dates (same instant): we shift by one millisecond so that the swap really changes the order.
    const dateMoi = moi.createdAt.getTime() === voisine.createdAt.getTime() ? new Date(voisine.createdAt.getTime() + sens) : voisine.createdAt;
    await tx.update(demandes).set({ createdAt: dateMoi }).where(and(eq(demandes.id, moi.id), eq(demandes.statut, "en_attente")));
    await tx.update(demandes).set({ createdAt: moi.createdAt }).where(and(eq(demandes.id, voisine.id), eq(demandes.statut, "en_attente")));
    return { ok: true as const };
  });
}

/** Starts the oldest waiting iteration when none is in progress any more: this is where the agent's task is posted, with the
 * instruction as it IS AT THIS MOMENT (editable until then). A failure (plan without a render…) ends it in error without blocking the following ones. */
export async function demarrerProchaineIteration(): Promise<boolean> {
  const [enCours] = await db.select({ id: demandes.id }).from(demandes).where(and(eq(demandes.type, "iteration-plan"), eq(demandes.statut, "en_cours"))).limit(1);
  if (enCours) return false;
  const file = await db.select().from(demandes).where(and(eq(demandes.type, "iteration-plan"), eq(demandes.statut, "en_attente"))).orderBy(asc(demandes.createdAt), asc(demandes.id));
  if (file.length === 0) return false;
  // Arrival order, except that a clip in « suite » starts again from its predecessor's render: if it is also queued, it goes after it (lib/clips/chains.ts).
  const plansEnFile = await db.select({ id: plans.id, episodeId: plans.episodeId, ordre: plans.ordre, liaison: plans.liaison }).from(plans).where(inArray(plans.episodeId, db.select({ e: plans.episodeId }).from(plans).where(inArray(plans.id, file.map((f) => f.cibleId)))));
  const precedentsDe = (planId: number) => {
    const p = plansEnFile.find((x) => x.id === planId);
    return p ? precedentsDansLaChaine(plansEnFile.filter((x) => x.episodeId === p.episodeId), planId) : [];
  };
  const d = choisirProchaineIteration(file.map((f) => ({ ...f, planId: f.cibleId })), precedentsDe);
  if (!d) return false;
  const ctx = lireContexte(d);
  // Taking the place first (condition on the status: a cancellation in the meantime wins); the partial unique index says whether the plan is taken by another request.
  let pris: { id: number }[];
  try {
    pris = await db
      .update(demandes)
      .set({ statut: "en_cours", etapes: etapesIterationPlan(), updatedAt: new Date() })
      .where(and(eq(demandes.id, d.id), eq(demandes.statut, "en_attente")))
      .returning({ id: demandes.id });
  } catch {
    return false; // the plan has another request in progress: we retry at the next turn
  }
  if (pris.length === 0) return false;
  const echec = async (erreur: string) => {
    await db.update(demandes).set({ statut: "echoue", erreur: erreur.slice(0, 500), finishedAt: new Date(), updatedAt: new Date() }).where(eq(demandes.id, d.id));
    return true;
  };
  if (!ctx.conversationUuid) return echec("Cette itération n'a pas gardé sa conversation : relance « Itérer ».");
  const g = await genererIteration(ctx.conversationUuid, { retour: ctx.consigne, renduId: ctx.renduId, planche: ctx.planche, demandeId: d.id });
  if (!g.ok) return echec(g.erreur);
  await db.update(demandes).set({ contexte: { ...ctx, runUuid: g.runUuid }, updatedAt: new Date() }).where(eq(demandes.id, d.id));
  return true;
}

export async function observer(d: LigneDemande, cle: CleEtapeIteration, ctx: ContexteIteration): Promise<{ obs: ObservationIteration; propositionUuid: string | null; conversationUuid: string | null }> {
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

/** « Itérer » waiting for images (wave 4a): prompts then images of the references the decisions will give the clip; once they are there, the
 * recompilation leaves with the kept decisions (`decisionsARecompiler`). A failed image stops the iteration, naming the asset; the clip stays
 * unchanged, the decisions stay visible. */
export async function avancerImagesIteration(d: LigneDemande, ctx: ContexteIteration, etapes: EtapeDemande[], cle: "prompts" | "images"): Promise<boolean> {
  const dec = ctx.decisionsARecompiler;
  if (!dec) return echouer(d, "Les décisions de l'agent sont introuvables : relance « Itérer ».");
  const [plan] = await db.select({ uuid: plans.uuid }).from(plans).where(eq(plans.id, d.cibleId));
  if (!plan) return echouer(d, "Plan introuvable.");
  const finales = await referencesApresDecisions(d.projectId, plan.uuid, dec.references ?? {});
  if (!finales) return echouer(d, "Plan introuvable.");
  const prep = ctx.preparation ?? {};
  return avancerPromptsImages(
    d,
    etapes,
    cle,
    finales.codes,
    prep,
    (maj) => ecrire(d, { ...(maj.etapes ? { etapes: maj.etapes } : {}), ...(maj.prep ? { contexte: { ...ctx, preparation: { ...prep, ...maj.prep } } } : {}) }),
    async (suite) => {
      const conv = await ouvrirConversation(d.projectId, "plan", { uuid: plan.uuid }, "courte");
      if (!conv.ok) return echouer(d, conv.erreur);
      const g = await genererReecriturePlan(conv.conversationUuid, { consigne: ctx.consigne, decisions: dec, demandeId: d.id, depuisNumero: ctx.depuisNumero });
      if (!g.ok) return /déjà en cours/i.test(g.erreur) ? false : echouer(d, g.erreur);
      await ecrire(d, { etapes: suite, contexte: { ...ctx, runUuid: g.runUuid } });
      return true;
    },
  );
}
