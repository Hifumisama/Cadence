"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { agentRuns, assetGenerations, creationsProjet, jobs, propositions } from "@/db/schema";
import { and, eq, inArray, isNull, notInArray, sql } from "drizzle-orm";
import { arreterCreation, idsRunsDeCreation } from "@/lib/agents/creation-db";
import { demanderAnnulation, viderFile as viderFileDb, type ResultatAnnulation } from "@/lib/annulation-db";
import { analyserCle } from "@/lib/taches";

// « Vu » : l'utilisateur a pris connaissance d'une tâche terminée ou échouée
// (indicateur du header). Ces actions ne rechargent aucune page : l'indicateur se
// remet à jour par son propre sondage. Jamais appelées pendant un rendu.

/** Marque des tâches comme vues (`image:<uuid>` / `video:<id>` / `llm:<uuid>`). Les
 * clés inconnues sont ignorées. */
export async function marquerVu(cles: string[]): Promise<{ ok: true }> {
  const maintenant = new Date();
  const uuids: string[] = [];
  const uuidsLlm: string[] = [];
  const uuidsLots: string[] = [];
  const idsRuns: number[] = [];
  const ids: number[] = [];
  for (const cle of cles.slice(0, 100)) {
    const a = analyserCle(cle);
    if (!a) continue;
    if (a.genre === "image") uuids.push(a.ref);
    else if (a.genre === "llm") uuidsLlm.push(a.ref);
    else if (a.genre === "lot") uuidsLots.push(a.ref);
    else if (a.genre === "creation") idsRuns.push(...(await idsRunsDeCreation(Number(a.ref))));
    else if (Number.isInteger(Number(a.ref))) ids.push(Number(a.ref));
  }
  if (idsRuns.length > 0) {
    // La création d'un projet est « vue » quand toutes ses tâches d'agent le sont.
    await db.update(agentRuns).set({ vuAt: maintenant }).where(and(inArray(agentRuns.id, idsRuns), isNull(agentRuns.vuAt)));
  }
  if (uuids.length > 0) {
    await db
      .update(assetGenerations)
      .set({ vuAt: maintenant })
      .where(and(inArray(assetGenerations.uuid, uuids), isNull(assetGenerations.vuAt)));
  }
  if (uuidsLlm.length > 0) {
    await db.update(agentRuns).set({ vuAt: maintenant }).where(and(inArray(agentRuns.uuid, uuidsLlm), isNull(agentRuns.vuAt)));
  }
  if (uuidsLots.length > 0) {
    // Un lot est « vu » quand toutes ses sous-tâches le sont.
    const props = await db.select({ id: propositions.id }).from(propositions).where(inArray(propositions.uuid, uuidsLots));
    if (props.length > 0) {
      await db
        .update(agentRuns)
        .set({ vuAt: maintenant })
        .where(and(inArray(agentRuns.propositionId, props.map((p) => p.id)), isNull(agentRuns.vuAt)));
    }
  }
  if (ids.length > 0) {
    await db.update(jobs).set({ vuAt: maintenant }).where(and(inArray(jobs.id, ids), isNull(jobs.vuAt)));
  }
  return { ok: true };
}

/** « Tout marquer comme vu » : toutes les tâches finies pas encore vues. Les
 * tâches actives restent non vues : elles le seront à leur fin. */
export async function marquerToutVu(): Promise<{ ok: true }> {
  const maintenant = new Date();
  await db
    .update(assetGenerations)
    .set({ vuAt: maintenant })
    .where(and(isNull(assetGenerations.vuAt), notInArray(assetGenerations.statut, ["en_attente", "en_cours"])));
  await db
    .update(jobs)
    .set({ vuAt: maintenant })
    .where(and(isNull(jobs.vuAt), notInArray(jobs.statut, ["en_attente", "en_cours"])));
  await db
    .update(agentRuns)
    .set({ vuAt: maintenant })
    .where(and(isNull(agentRuns.vuAt), notInArray(agentRuns.statut, ["en_attente", "en_cours"])));
  return { ok: true };
}

/** Annule une tâche (`image:<uuid>` / `video:<id>` / `llm:<uuid>` / `lot:<uuid de la proposition>`). En attente :
 * annulée tout de suite. En cours : le drapeau est posé ; le worker interrompt
 * ComfyUI (après avoir vérifié dans /queue que c'est bien ce prompt) ou coupe la
 * connexion au serveur LLM, puis marque la tâche annulée.
 * Finie, échouée ou déjà annulée : sans effet. Idempotente. */
export async function annulerTache(cle: string): Promise<{ ok: true; resultat: ResultatAnnulation }> {
  // La ligne « Conception » du header regroupe toute la création d'un projet : l'annuler, c'est arrêter l'installateur
  // (sinon il relancerait aussitôt la tâche coupée). Ce qui est déjà écrit n'est pas défait.
  const a = analyserCle(cle);
  if (a?.genre === "creation") {
    const projectId = Number(a.ref);
    const r = await arreterCreation(projectId);
    revalidatePath(`/p/${projectId}/creation`);
    return { ok: true, resultat: r.ok ? "annulee" : "rien" };
  }
  return { ok: true, resultat: await demanderAnnulation(cle) };
}

/** « Vider la file » : annule tout ce qui ATTEND (images, sons, vidéos, appels d'agent,
 * sous-tâches de lots). Ce qui tourne continue ; rien d'interrompu, tout se relance. Renvoie le
 * nombre de tâches retirées. */
export async function viderFile(): Promise<{ ok: true; annulees: number }> {
  return { ok: true, annulees: await viderFileDb() };
}

const ACTIFS = ["en_attente", "en_cours"] as const;

/** Retire des tâches TERMINÉES, ÉCHOUÉES ou ANNULÉES de la liste du panneau (✕). Rien n'est
 * supprimé : la tâche est seulement masquée (et marquée vue) ; le candidat d'une génération reste
 * relisible dans la popup de son asset. Les tâches actives ne se retirent pas (on les annule). */
export async function retirerTaches(cles: string[]): Promise<{ ok: true }> {
  const maintenant = new Date();
  const uuids: string[] = [];
  const uuidsLlm: string[] = [];
  const uuidsLots: string[] = [];
  const idsRuns: number[] = [];
  const ids: number[] = [];
  for (const cle of cles.slice(0, 100)) {
    const a = analyserCle(cle);
    if (!a) continue;
    if (a.genre === "image") uuids.push(a.ref);
    else if (a.genre === "llm") uuidsLlm.push(a.ref);
    else if (a.genre === "lot") uuidsLots.push(a.ref);
    else if (a.genre === "creation") idsRuns.push(...(await idsRunsDeCreation(Number(a.ref))));
    else if (Number.isInteger(Number(a.ref))) ids.push(Number(a.ref));
  }
  const marque = { masqueAt: maintenant, vuAt: sql`coalesce(vu_at, ${maintenant.toISOString()}::timestamp)` };
  if (idsRuns.length > 0) {
    // Les tâches de la création : masquées, comme celles d'un lot (rien n'est supprimé, la page d'avancée reste).
    await db.update(agentRuns).set(marque).where(and(inArray(agentRuns.id, idsRuns), notInArray(agentRuns.statut, [...ACTIFS])));
  }
  if (uuids.length > 0) {
    await db.update(assetGenerations).set(marque).where(and(inArray(assetGenerations.uuid, uuids), notInArray(assetGenerations.statut, [...ACTIFS])));
  }
  if (uuidsLlm.length > 0) {
    await db.update(agentRuns).set(marque).where(and(inArray(agentRuns.uuid, uuidsLlm), notInArray(agentRuns.statut, [...ACTIFS])));
  }
  if (uuidsLots.length > 0) {
    const props = await db.select({ id: propositions.id }).from(propositions).where(inArray(propositions.uuid, uuidsLots));
    if (props.length > 0) {
      await db
        .update(agentRuns)
        .set(marque)
        .where(and(inArray(agentRuns.propositionId, props.map((p) => p.id)), notInArray(agentRuns.statut, [...ACTIFS])));
    }
  }
  if (ids.length > 0) {
    await db.update(jobs).set(marque).where(and(inArray(jobs.id, ids), notInArray(jobs.statut, [...ACTIFS])));
  }
  return { ok: true };
}

/** « Vider la liste » : masque d'un coup toutes les tâches finies d'une catégorie, `terminees`
 * (réussies) ou `echecs` (échouées et annulées). Les tâches actives ne sont jamais touchées. */
export async function viderListe(categorie: "terminees" | "echecs"): Promise<{ ok: true }> {
  const maintenant = new Date();
  const marque = { masqueAt: maintenant, vuAt: sql`coalesce(vu_at, ${maintenant.toISOString()}::timestamp)` };
  const statutsGen = categorie === "terminees" ? ["termine"] : ["echoue", "annulee"];
  // `jobs.statut` est un enum Postgres sans « annulee » (une vidéo annulée est `echoue`).
  const statutsJob = categorie === "terminees" ? (["termine"] as const) : (["echoue"] as const);
  await db.update(assetGenerations).set(marque).where(and(isNull(assetGenerations.masqueAt), inArray(assetGenerations.statut, statutsGen)));
  await db.update(agentRuns).set(marque).where(and(isNull(agentRuns.masqueAt), inArray(agentRuns.statut, statutsGen)));
  // La ligne « Conception » part avec toutes ses tâches (y compris les réussies d'une création en échec ou arrêtée).
  const creations = await db
    .select({ projectId: creationsProjet.projectId })
    .from(creationsProjet)
    .where(inArray(creationsProjet.statut, categorie === "terminees" ? ["termine"] : ["echoue", "arretee"]));
  const idsRuns = (await Promise.all(creations.map((c) => idsRunsDeCreation(c.projectId)))).flat();
  if (idsRuns.length > 0) await db.update(agentRuns).set(marque).where(and(inArray(agentRuns.id, idsRuns), notInArray(agentRuns.statut, [...ACTIFS])));
  await db.update(jobs).set(marque).where(and(isNull(jobs.masqueAt), inArray(jobs.statut, [...statutsJob])));
  return { ok: true };
}
