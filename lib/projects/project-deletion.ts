import { and, count, eq, inArray, ne } from "drizzle-orm";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { db } from "@/db";
import {
  agentRuns,
  agentTraces,
  assetGenerations,
  assets,
  episodes,
  jobs,
  plans,
  projects,
} from "@/db/schema";
import { MEDIA_ROOT, cheminAssetMedia, cheminPosterMedia } from "@/lib/media";

/** What the deletion of a project carries away — shown in the confirmation. */
export type InventaireSuppression = {
  nom: string;
  episodes: number;
  plans: number;
  assets: number;
  rendus: number;
  generations: number;
  appelsLlm: number;
  /** Tasks still in progress (renders, asset generations, LLM calls): they will fail. */
  tachesEnCours: number;
};

type Identifiants = {
  episodes: number[];
  plans: number[];
  assets: number[];
};

/** Folders (relative to MEDIA_ROOT) that belong only to the project: one per entity, stored under
 * the internal id (see lib/media.ts). Pure — tested without database. `assets/<fichier>` is separate: the folder
 * is shared by all projects. */
export function dossiersDuProjet(projectId: number, ids: Identifiants): string[] {
  return [
    cheminPosterMedia("projects", projectId, "").replace(/\/$/, ""),
    ...ids.episodes.map((id) => cheminPosterMedia("episodes", id, "").replace(/\/$/, "")),
    ...ids.plans.map((id) => `plans/${id}`),
    ...ids.assets.flatMap((id) => [`voix/${id}`, `generations/${id}`]),
  ];
}

async function identifiants(projectId: number): Promise<Identifiants> {
  const [episodesProjet, plansProjet, assetsProjet] = await Promise.all([
    db.select({ id: episodes.id }).from(episodes).where(eq(episodes.projectId, projectId)),
    db.select({ id: plans.id }).from(plans).where(eq(plans.projectId, projectId)),
    db.select({ id: assets.id }).from(assets).where(eq(assets.projectId, projectId)),
  ]);
  return {
    episodes: episodesProjet.map((e) => e.id),
    plans: plansProjet.map((p) => p.id),
    assets: assetsProjet.map((a) => a.id),
  };
}

export async function inventaireProjet(projectId: number): Promise<InventaireSuppression | null> {
  const [projet] = await db.select({ nom: projects.nom }).from(projects).where(eq(projects.id, projectId));
  if (!projet) return null;
  const ids = await identifiants(projectId);

  const nbRendus = ids.plans.length
    ? (await db.select({ n: count() }).from(jobs).where(inArray(jobs.planId, ids.plans)))[0]?.n ?? 0
    : 0;
  const nbGenerations = ids.assets.length
    ? (await db.select({ n: count() }).from(assetGenerations).where(inArray(assetGenerations.assetId, ids.assets)))[0]?.n ?? 0
    : 0;
  const [appels] = await db.select({ n: count() }).from(agentRuns).where(eq(agentRuns.projectId, projectId));

  const enCoursRendus = ids.plans.length
    ? (await db.select({ n: count() }).from(jobs).where(and(inArray(jobs.planId, ids.plans), eq(jobs.statut, "en_cours"))))[0]?.n ?? 0
    : 0;
  const enCoursGen = ids.assets.length
    ? (await db.select({ n: count() }).from(assetGenerations).where(and(inArray(assetGenerations.assetId, ids.assets), eq(assetGenerations.statut, "en_cours"))))[0]?.n ?? 0
    : 0;
  const [enCoursLlm] = await db.select({ n: count() }).from(agentRuns).where(and(eq(agentRuns.projectId, projectId), eq(agentRuns.statut, "en_cours")));

  return {
    nom: projet.nom,
    episodes: ids.episodes.length,
    plans: ids.plans.length,
    assets: ids.assets.length,
    rendus: nbRendus,
    generations: nbGenerations,
    appelsLlm: appels?.n ?? 0,
    tachesEnCours: enCoursRendus + enCoursGen + (enCoursLlm?.n ?? 0),
  };
}

/** Deletes the project and EVERYTHING attached to it: the database (schema cascade, plus the traces and
 * LLM calls, which do not cascade: `set null`) then the files. The files go after the
 * transaction: a database that fails must not leave a project without its media. */
export async function supprimerProjetComplet(projectId: number): Promise<void> {
  const ids = await identifiants(projectId);
  const fichiersAssets = ids.assets.length
    ? (await db.select({ fichier: assets.fichier }).from(assets).where(inArray(assets.id, ids.assets)))
        .map((a) => a.fichier)
        .filter((f): f is string => !!f)
    : [];
  // assets/ is a shared folder: a file name also used by another project is kept.
  const partages = fichiersAssets.length
    ? new Set(
        (await db
          .select({ fichier: assets.fichier })
          .from(assets)
          .where(and(inArray(assets.fichier, fichiersAssets), ne(assets.projectId, projectId)))).map((a) => a.fichier),
      )
    : new Set<string | null>();

  await db.transaction(async (tx) => {
    await tx.delete(agentTraces).where(eq(agentTraces.projectId, projectId));
    await tx.delete(agentRuns).where(eq(agentRuns.projectId, projectId));
    await tx.delete(projects).where(eq(projects.id, projectId));
  });

  const aSupprimer = [
    ...dossiersDuProjet(projectId, ids),
    ...fichiersAssets.filter((f) => !partages.has(f)).map((f) => cheminAssetMedia(f)),
  ];
  await Promise.all(aSupprimer.map((rel) => rm(join(MEDIA_ROOT, rel), { recursive: true, force: true }).catch(() => undefined)));
}
