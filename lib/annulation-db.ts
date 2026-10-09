import { and, desc, eq, inArray, isNull, ne, notInArray, or, sql } from "drizzle-orm";
import { db } from "../db";
import { agentRuns, assetGenerations, jobs, plans, propositions } from "../db/schema";
import { ERREUR_ANNULEE, statutPlanApresAnnulation } from "./annulation";
import { annulerEnAttenteDesLots, annulerLot } from "./agents/lots";
import { analyserCle } from "./taches";

// Accès base de l'annulation, partagé par l'action serveur (app/taches/actions.ts)
// et le worker. Les règles pures vivent dans lib/annulation.ts. Chaque UPDATE est
// gardé par le statut attendu : une tâche que le worker vient de prendre (ou de
// finir) ne se laisse pas écraser par une annulation arrivée trop tard.

export type ResultatAnnulation = "annulee" | "demandee" | "deja" | "rien";

/** « Vider la file » : annule TOUT ce qui attend (images, sons, vidéos, appels d'agent, sous-tâches
 * de lots). Ce qui tourne continue : on n'interrompt rien, on retire seulement ce qui n'a pas
 * commencé (rien n'est perdu, tout se relance). Une vidéo retirée remet son plan dans son état
 * précédent. Renvoie le nombre de tâches annulées. */
export async function viderFile(): Promise<number> {
  const maintenant = new Date();
  const images = await db
    .update(assetGenerations)
    .set({ statut: "annulee", finishedAt: maintenant, erreur: null })
    .where(eq(assetGenerations.statut, "en_attente"))
    .returning({ id: assetGenerations.id });
  const videos = await db
    .update(jobs)
    .set({ statut: "echoue", erreur: ERREUR_ANNULEE, finishedAt: maintenant })
    .where(eq(jobs.statut, "en_attente"))
    .returning({ planId: jobs.planId });
  for (const v of videos) await restaurerStatutPlan(v.planId);
  // Les sous-tâches de lots passent par leur propre logique (statut du lot recalculé) ; les autres
  // appels d'agent, directement.
  const lots = await annulerEnAttenteDesLots();
  const lotsIds = (await db.select({ id: propositions.id }).from(propositions).where(eq(propositions.lot, true))).map((p) => p.id);
  const seuls = await db
    .update(agentRuns)
    .set({ statut: "annulee", finishedAt: maintenant, erreur: null })
    .where(
      and(
        eq(agentRuns.statut, "en_attente"),
        lotsIds.length > 0 ? or(isNull(agentRuns.propositionId), notInArray(agentRuns.propositionId, lotsIds)) : sql`true`,
      ),
    )
    .returning({ id: agentRuns.id });
  return images.length + videos.length + lots + seuls.length;
}

/** Demande l'annulation d'une tâche (`image:<uuid>` / `video:<id>`). Idempotente :
 * redemander ne change rien. En attente → annulée tout de suite ; en cours → le
 * drapeau est posé et le worker interrompt ComfyUI ; finie, échouée ou déjà
 * annulée → rien. */
export async function demanderAnnulation(cle: string): Promise<ResultatAnnulation> {
  const a = analyserCle(cle);
  if (!a) return "rien";
  const maintenant = new Date();

  // La création d'un projet s'arrête par l'installateur (app/taches/actions.ts : annulerTache), jamais ici.
  if (a.genre === "creation") return "rien";

  // Un lot d'agent : toutes ses sous-tâches en attente sont annulées, celle qui tourne est interrompue.
  if (a.genre === "lot") {
    const r = await annulerLot(a.ref);
    return r === "annule" ? "annulee" : r === "demande" ? "demandee" : "rien";
  }

  if (a.genre === "image") {
    const directe = await db
      .update(assetGenerations)
      .set({ statut: "annulee", finishedAt: maintenant, erreur: null })
      .where(and(eq(assetGenerations.uuid, a.ref), eq(assetGenerations.statut, "en_attente")))
      .returning({ id: assetGenerations.id });
    if (directe.length > 0) return "annulee";
    const pose = await db
      .update(assetGenerations)
      .set({ annulationDemandeeAt: maintenant })
      .where(and(eq(assetGenerations.uuid, a.ref), eq(assetGenerations.statut, "en_cours"), isNull(assetGenerations.annulationDemandeeAt)))
      .returning({ id: assetGenerations.id });
    if (pose.length > 0) return "demandee";
    const [g] = await db.select({ statut: assetGenerations.statut, drapeau: assetGenerations.annulationDemandeeAt }).from(assetGenerations).where(eq(assetGenerations.uuid, a.ref));
    return g?.statut === "en_cours" && g.drapeau ? "deja" : "rien";
  }

  if (a.genre === "llm") {
    const directe = await db
      .update(agentRuns)
      .set({ statut: "annulee", finishedAt: maintenant, erreur: null })
      .where(and(eq(agentRuns.uuid, a.ref), eq(agentRuns.statut, "en_attente")))
      .returning({ id: agentRuns.id });
    if (directe.length > 0) return "annulee";
    const pose = await db
      .update(agentRuns)
      .set({ annulationDemandeeAt: maintenant })
      .where(and(eq(agentRuns.uuid, a.ref), eq(agentRuns.statut, "en_cours"), isNull(agentRuns.annulationDemandeeAt)))
      .returning({ id: agentRuns.id });
    if (pose.length > 0) return "demandee";
    const [r] = await db.select({ statut: agentRuns.statut, drapeau: agentRuns.annulationDemandeeAt }).from(agentRuns).where(eq(agentRuns.uuid, a.ref));
    return r?.statut === "en_cours" && r.drapeau ? "deja" : "rien";
  }

  const id = Number(a.ref);
  if (!Number.isInteger(id)) return "rien";
  const directe = await db
    .update(jobs)
    .set({ statut: "echoue", erreur: ERREUR_ANNULEE, finishedAt: maintenant })
    .where(and(eq(jobs.id, id), eq(jobs.statut, "en_attente")))
    .returning({ planId: jobs.planId });
  if (directe.length > 0) {
    await restaurerStatutPlan(directe[0]!.planId);
    return "annulee";
  }
  const pose = await db
    .update(jobs)
    .set({ annulationDemandeeAt: maintenant })
    .where(and(eq(jobs.id, id), eq(jobs.statut, "en_cours"), isNull(jobs.annulationDemandeeAt)))
    .returning({ id: jobs.id });
  if (pose.length > 0) return "demandee";
  const [j] = await db.select({ statut: jobs.statut, drapeau: jobs.annulationDemandeeAt }).from(jobs).where(eq(jobs.id, id));
  return j?.statut === "en_cours" && j.drapeau ? "deja" : "rien";
}

export async function annulationDemandeeImage(generationId: number): Promise<boolean> {
  const [g] = await db.select({ d: assetGenerations.annulationDemandeeAt }).from(assetGenerations).where(eq(assetGenerations.id, generationId));
  return g?.d != null;
}

export async function annulationDemandeeLlm(runId: number): Promise<boolean> {
  const [r] = await db.select({ d: agentRuns.annulationDemandeeAt }).from(agentRuns).where(eq(agentRuns.id, runId));
  return r?.d != null;
}

/** Marque un appel LLM annulé (le worker a coupé la connexion) : ni erreur ni relance. */
export async function finirAnnulationLlm(runId: number): Promise<void> {
  await db
    .update(agentRuns)
    .set({ statut: "annulee", erreur: null, finishedAt: new Date(), progressionJetons: null })
    .where(and(eq(agentRuns.id, runId), inArray(agentRuns.statut, ["en_attente", "en_cours"])));
}

export async function annulationDemandeeVideo(jobId: number): Promise<boolean> {
  const [j] = await db.select({ d: jobs.annulationDemandeeAt }).from(jobs).where(eq(jobs.id, jobId));
  return j?.d != null;
}

/** Marque une génération d'image annulée (le worker a fini d'interrompre) et
 * remet à zéro progression et aperçu. Ni rejeu, ni message d'erreur. */
export async function finirAnnulationImage(generationId: number): Promise<void> {
  await db
    .update(assetGenerations)
    .set({
      statut: "annulee",
      erreur: null,
      finishedAt: new Date(),
      progressionValeur: null,
      progressionMax: null,
      etapeLibelle: null,
      apercuFichier: null,
      apercuAt: null,
    })
    .where(and(eq(assetGenerations.id, generationId), inArray(assetGenerations.statut, ["en_attente", "en_cours"])));
}

/** Marque un job vidéo annulé : `echoue` + « Annulée », SANS toucher à la tentative
 * (F04 : seul un échec de rendu en consomme une, et une annulation ne se rejoue
 * pas) ; le plan revient à l'état de sa dernière réussite. */
export async function finirAnnulationVideo(jobId: number): Promise<void> {
  const fini = await db
    .update(jobs)
    .set({ statut: "echoue", erreur: ERREUR_ANNULEE, finishedAt: new Date() })
    .where(and(eq(jobs.id, jobId), inArray(jobs.statut, ["en_attente", "en_cours"])))
    .returning({ planId: jobs.planId });
  if (fini.length > 0) await restaurerStatutPlan(fini[0]!.planId);
}

/** Le plan reprend l'état de sa dernière réussite, sauf si un autre job du plan
 * est encore actif (il garde alors la main sur le statut). */
export async function restaurerStatutPlan(planId: number): Promise<void> {
  const actifs = await db
    .select({ id: jobs.id })
    .from(jobs)
    .where(and(eq(jobs.planId, planId), inArray(jobs.statut, ["en_attente", "en_cours"])));
  if (actifs.length > 0) return;
  const precedents = await db
    .select({ statut: jobs.statut, activerUpscale: jobs.activerUpscale })
    .from(jobs)
    .where(and(eq(jobs.planId, planId), ne(jobs.erreur, ERREUR_ANNULEE)))
    .orderBy(desc(jobs.id));
  const statut = statutPlanApresAnnulation(precedents);
  await db
    .update(plans)
    .set({ statut, updatedAt: new Date() })
    .where(and(eq(plans.id, planId), inArray(plans.statut, ["en_attente", "en_cours", "rejoue"])));
}
