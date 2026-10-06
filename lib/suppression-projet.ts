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
  repliques,
  seasons,
} from "@/db/schema";
import { MEDIA_ROOT, cheminAssetMedia, cheminPosterMedia } from "@/lib/media";

/** Ce qu'emporte la suppression d'un projet — montré dans la confirmation. */
export type InventaireSuppression = {
  nom: string;
  saisons: number;
  episodes: number;
  plans: number;
  assets: number;
  repliques: number;
  rendus: number;
  generations: number;
  appelsLlm: number;
  /** Tâches encore en cours (rendus, générations d'assets, appels LLM) : elles échoueront. */
  tachesEnCours: number;
};

type Identifiants = {
  saisons: number[];
  episodes: number[];
  plans: number[];
  assets: number[];
  repliques: number[];
};

/** Dossiers (relatifs à MEDIA_ROOT) qui n'appartiennent qu'au projet : un par entité, rangés sous
 * l'id interne (voir lib/media.ts). Pur — testé sans base. `assets/<fichier>` est à part : le dossier
 * est commun à tous les projets. */
export function dossiersDuProjet(projectId: number, ids: Identifiants): string[] {
  return [
    cheminPosterMedia("projects", projectId, "").replace(/\/$/, ""),
    ...ids.saisons.map((id) => cheminPosterMedia("seasons", id, "").replace(/\/$/, "")),
    ...ids.episodes.map((id) => cheminPosterMedia("episodes", id, "").replace(/\/$/, "")),
    ...ids.plans.map((id) => `plans/${id}`),
    ...ids.repliques.map((id) => `repliques/${id}`),
    ...ids.assets.flatMap((id) => [`voix/${id}`, `generations/${id}`]),
  ];
}

async function identifiants(projectId: number): Promise<Identifiants> {
  const [saisons, plansProjet, assetsProjet, repliquesProjet] = await Promise.all([
    db.select({ id: seasons.id }).from(seasons).where(eq(seasons.projectId, projectId)),
    db.select({ id: plans.id }).from(plans).where(eq(plans.projectId, projectId)),
    db.select({ id: assets.id }).from(assets).where(eq(assets.projectId, projectId)),
    db.select({ id: repliques.id }).from(repliques).where(eq(repliques.projectId, projectId)),
  ]);
  const idsSaisons = saisons.map((s) => s.id);
  const episodesProjet = idsSaisons.length
    ? await db.select({ id: episodes.id }).from(episodes).where(inArray(episodes.seasonId, idsSaisons))
    : [];
  return {
    saisons: idsSaisons,
    episodes: episodesProjet.map((e) => e.id),
    plans: plansProjet.map((p) => p.id),
    assets: assetsProjet.map((a) => a.id),
    repliques: repliquesProjet.map((r) => r.id),
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
    saisons: ids.saisons.length,
    episodes: ids.episodes.length,
    plans: ids.plans.length,
    assets: ids.assets.length,
    repliques: ids.repliques.length,
    rendus: nbRendus,
    generations: nbGenerations,
    appelsLlm: appels?.n ?? 0,
    tachesEnCours: enCoursRendus + enCoursGen + (enCoursLlm?.n ?? 0),
  };
}

/** Supprime le projet et TOUT ce qui s'y rattache : la base (cascade du schéma, plus les traces et
 * appels LLM, qui ne cascadent pas : `set null`) puis les fichiers. Les fichiers partent après la
 * transaction : une base qui échoue ne doit pas laisser un projet sans ses médias. */
export async function supprimerProjetComplet(projectId: number): Promise<void> {
  const ids = await identifiants(projectId);
  const fichiersAssets = ids.assets.length
    ? (await db.select({ fichier: assets.fichier }).from(assets).where(inArray(assets.id, ids.assets)))
        .map((a) => a.fichier)
        .filter((f): f is string => !!f)
    : [];
  // assets/ est un dossier commun : un nom de fichier utilisé aussi par un autre projet reste.
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
