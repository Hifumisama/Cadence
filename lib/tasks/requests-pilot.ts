import { db } from "../../db";
import { demandes, plans } from "../../db/schema";
import { eq, and } from "drizzle-orm";
import { etapeCouranteDemande, avancerEtapes, type CleEtapeIteration, deciderIteration, insererEtapesImagesIteration, type StatutDemande, type EtapeDemande } from "./requests";
import { appliquerIterationEtGenererCore } from "../clips/iteration-application";
import { creerAssetsManquants, genererReecriturePlan } from "../agents/service-clips";
import type { DecisionsIteration, DecisionsAffichees } from "../agents/types";
import { referencesApresDecisions } from "../h3ir/brief-clip";
import { demanderAnnulation } from "./cancellation-db";
import { cleVideo, cleLlm } from "./tasks";
import { annulerLot } from "../agents/batches";
import { avancerImagesIteration, demarrerProchaineIteration, observer } from "./requests-iteration";
import { LigneDemande, ecrire, lireContexte, lireEtapes } from "./requests-shared";
import { avancerFichePlan } from "./requests-sheets";
import { avancerAjoutPlan, avancerAjoutScene } from "./requests-additions";

/** One turn of the pilot: moves each ongoing request by one transition. Never rejects (a request that crashes ends in failure
 * with its message, the others continue). Returns how many requests are in progress and how many have moved. */
export async function piloterDemandes(): Promise<{ actives: number; touchees: number }> {
  let touchees = 0;
  try {
    if (await demarrerProchaineIteration()) touchees += 1;
  } catch (err) {
    console.error(`[worker] Démarrage d'une itération en attente : ${err instanceof Error ? err.message : String(err)}`);
  }
  const lignes = await db.select().from(demandes).where(eq(demandes.statut, "en_cours"));
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

async function avancer(d: LigneDemande): Promise<boolean> {
  if (d.type === "fiche-plan") return avancerFichePlan(d);
  if (d.type === "ajout-plan") return avancerAjoutPlan(d);
  if (d.type === "ajout-scene") return avancerAjoutScene(d);
  if (d.type !== "iteration-plan") return false;
  const etapes = lireEtapes(d);
  const ctx = lireContexte(d);
  const cur = etapeCouranteDemande(etapes);
  if (!cur) {
    await ecrire(d, { statut: "termine" });
    return true;
  }
  // Assets created, prompts and images expected before the recompilation (wave 4a): same mechanism as a clip's sheet.
  if (cur.cle === "assets") {
    await ecrire(d, { etapes: avancerEtapes(etapes, "assets", "passe") });
    return true;
  }
  if (cur.cle === "prompts" || cur.cle === "images") return avancerImagesIteration(d, ctx, etapes, cur.cle);
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
      const r = await appliquerIterationEtGenererCore(d.cibleId, propositionUuid, { consigne: ctx.consigne, depuisNumero: ctx.depuisNumero, demandeId: d.id, notes: ctx.notesAgent ?? [] }, ctx.reglages ?? {});
      if (!r.ok) {
        await ecrire(d, { statut: "echoue", erreur: r.erreur });
        return true;
      }
      // Applied + render created: the correction did not need a rewrite if we were still at the « agent » step.
      await ecrire(d, { etapes: avancerEtapes(etapes, cle, "fait", cle === "agent" ? ["reecriture"] : []), contexte: { ...ctx, jobId: r.jobId, numeroRendu: r.numeroRendu, notes: r.notes } });
      return true;
    }
    case "reecrire": {
      if (!conversationUuid) {
        await ecrire(d, { statut: "echoue", erreur: "Conversation introuvable." });
        return true;
      }
      // Always recompile (2026-11-09): the agent's decisions (intent, duration, references, settings) go as an override to Open H3 IR and are only
      // written with the compiled sheet. Wave 4a: the missing assets decided (two at most) are created at once and added to the references;
      // if a final reference has no image, its prompts and images go first (inserted steps), the recompilation follows by itself.
      const vus = { ...ctx, decisions: decision.affichage, notesAgent: decision.notes };
      const { manquants, ...base } = decision.decisions;
      let crees: string[] = [];
      if (manquants?.length) {
        const c = await creerAssetsManquants(conversationUuid, manquants);
        if (!c.ok) {
          await ecrire(d, { statut: "echoue", erreur: c.erreur, contexte: vus });
          return true;
        }
        crees = c.crees;
      }
      const ajouter = [...new Set([...(base.references?.ajouter ?? []), ...crees])];
      const aRecompiler: DecisionsIteration = ajouter.length || base.references?.retirer.length ? { ...base, references: { ajouter, retirer: base.references?.retirer ?? [] } } : base;
      const [plan] = await db.select({ uuid: plans.uuid }).from(plans).where(eq(plans.id, d.cibleId));
      const finales = plan ? await referencesApresDecisions(d.projectId, plan.uuid, aRecompiler.references ?? {}) : null;
      if (finales && finales.inconnus.length === 0 && finales.sansImage.length > 0) {
        const e = avancerEtapes(insererEtapesImagesIteration(etapes, crees.length), "agent", "fait");
        await ecrire(d, { etapes: e, contexte: { ...vus, decisionsARecompiler: aRecompiler, preparation: { assetsCrees: crees } } });
        return true;
      }
      const g = await genererReecriturePlan(conversationUuid, { consigne: ctx.consigne, decisions: aRecompiler, demandeId: d.id, depuisNumero: ctx.depuisNumero });
      if (!g.ok) {
        if (/déjà en cours/i.test(g.erreur)) return false; // the conversation is taken by something else: at the next turn
        await ecrire(d, { statut: "echoue", erreur: g.erreur, contexte: vus });
        return true;
      }
      await ecrire(d, { etapes: avancerEtapes(etapes, "agent", "fait"), contexte: { ...vus, runUuid: g.runUuid } });
      return true;
    }
  }
}

/** Cancels the request: it goes to « annulée » at once (the pilot no longer touches it) and the task in progress is cancelled with it
 * (queued: removed; in progress: the worker interrupts it). What has already been written is not undone. */
export async function annulerDemande(demandeId: number): Promise<"annulee" | "rien"> {
  const [d] = await db.select().from(demandes).where(eq(demandes.id, demandeId));
  if (d?.statut === "en_attente") {
    // It posted no task: there is nothing to interrupt.
    await db.update(demandes).set({ statut: "annulee", erreur: null, finishedAt: new Date(), updatedAt: new Date() }).where(and(eq(demandes.id, d.id), eq(demandes.statut, "en_attente")));
    return "annulee";
  }
  if (!d || d.statut !== "en_cours") return "rien";
  await ecrire(d, { statut: "annulee", erreur: null });
  const ctx = lireContexte(d);
  const cur = etapeCouranteDemande(lireEtapes(d));
  const lotPrompts = (d.contexte as { preparation?: { promptsPropositionUuid?: string } }).preparation?.promptsPropositionUuid;
  if (cur?.cle === "rendu" && ctx.jobId != null) await demanderAnnulation(cleVideo(ctx.jobId));
  else if (cur?.cle === "prompts" && lotPrompts) await annulerLot(lotPrompts);
  else if (ctx.runUuid) await demanderAnnulation(cleLlm(ctx.runUuid));
  return "annulee";
}

/** What a clip's page reads to follow its request (polling). */
export type VueDemande = {
  statut: StatutDemande;
  etapes: EtapeDemande[];
  /** Current step (label), null when it is finished. */
  etapeLibelle: string | null;
  erreur: string | null;
  /** The render created (`rendu` step reached): the page can acknowledge the launch. */
  numeroRendu: number | null;
  notes: string[];
  /** « Itérer »: what the agent decided to change (before → after), as soon as it has answered. */
  decisions: DecisionsAffichees | null;
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
    decisions: d.type === "iteration-plan" ? (ctx.decisions ?? null) : null,
  };
}
