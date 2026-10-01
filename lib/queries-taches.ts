import { db } from "../db";
import { assetGenerations, assets, jobs, plans } from "../db/schema";
import { eq, gte, isNull, or, inArray } from "drizzle-orm";
import { ERREUR_ANNULEE } from "./annulation";
import { generationMediaSrc } from "./media";
import {
  RETENTION_TERMINEES_JOURS,
  cleImage,
  cleVideo,
  ordonnerTaches,
  resumerTaches,
  type ResumeTaches,
  type Tache,
} from "./taches";

/** Toutes les tâches à montrer dans l'indicateur du header : générations
 * d'images et jobs vidéo (lecture seule), ordonnés comme le worker les prendra.
 * Côté serveur uniquement (accès disque pour les aperçus et vignettes). */
export async function listerTaches(maintenant: Date = new Date()): Promise<{ taches: Tache[]; resume: ResumeTaches }> {
  const depuis = new Date(maintenant.getTime() - RETENTION_TERMINEES_JOURS * 24 * 3600 * 1000);

  const lignesImages = await db
    .select({
      g: assetGenerations,
      code: assets.code,
      projectId: assets.projectId,
    })
    .from(assetGenerations)
    .innerJoin(assets, eq(assets.id, assetGenerations.assetId))
    .where(
      or(
        inArray(assetGenerations.statut, ["en_attente", "en_cours"]),
        isNull(assetGenerations.vuAt),
        gte(assetGenerations.createdAt, depuis),
      ),
    );

  const lignesVideos = await db
    .select({
      j: jobs,
      planUuid: plans.uuid,
      titre: plans.titre,
      projectId: plans.projectId,
      episodeId: plans.episodeId,
    })
    .from(jobs)
    .innerJoin(plans, eq(plans.id, jobs.planId))
    .where(or(inArray(jobs.statut, ["en_attente", "en_cours"]), isNull(jobs.vuAt), gte(jobs.createdAt, depuis)));

  const iso = (d: Date | null) => (d ? d.toISOString() : null);

  const images: Tache[] = lignesImages.map(({ g, code, projectId }) => ({
    cle: cleImage(g.uuid),
    genre: "image",
    statut: g.statut,
    libelle: code,
    detail: g.methode === "edition" ? "À partir d'images" : "À partir du texte",
    href: `/p/${projectId}/assets/${code}?generation=${g.uuid}`,
    projectId,
    assetId: g.assetId,
    progression:
      g.statut === "en_cours" && g.progressionValeur != null && g.progressionMax
        ? { valeur: g.progressionValeur, max: g.progressionMax, etape: g.etapeLibelle }
        : null,
    apercuSrc: null, // rempli après tri, pour ne toucher au disque que pour les tâches gardées
    vignetteSrc: null,
    createdAt: g.createdAt.toISOString(),
    startedAt: iso(g.startedAt),
    finishedAt: iso(g.finishedAt),
    vuAt: iso(g.vuAt),
    erreur: g.erreur,
    positionFile: null,
    derriereVideo: false,
    annulationDemandee: g.annulationDemandeeAt != null && g.statut === "en_cours",
  }));

  const videos: Tache[] = lignesVideos.map(({ j, planUuid, titre, projectId, episodeId }) => ({
    cle: cleVideo(j.id),
    genre: "video",
    // Une vidéo annulée est `echoue` + « Annulée » en base (pas de valeur d'enum de
    // plus) ; le panneau la montre comme une annulation, pas comme un échec.
    statut: j.statut === "echoue" && j.erreur === ERREUR_ANNULEE ? "annulee" : j.statut,
    libelle: titre,
    detail: j.tentative > 1 ? `Vidéo · tentative ${j.tentative}` : "Vidéo",
    // F03 : le plan se désigne par son uuid public, jamais par sa position.
    href: `/p/${projectId}/e/${episodeId}/plans/${planUuid}`,
    projectId,
    assetId: null,
    progression: null,
    apercuSrc: null,
    vignetteSrc: null,
    createdAt: j.createdAt.toISOString(),
    startedAt: iso(j.startedAt),
    finishedAt: iso(j.finishedAt),
    vuAt: iso(j.vuAt),
    erreur: j.statut === "echoue" && j.erreur === ERREUR_ANNULEE ? null : j.erreur,
    positionFile: null,
    derriereVideo: false,
    annulationDemandee: j.annulationDemandeeAt != null && j.statut === "en_cours",
  }));

  const gardees = ordonnerTaches([...images, ...videos], maintenant);

  // Disque : seulement pour les tâches d'images gardées.
  const parCle = new Map(lignesImages.map((l) => [cleImage(l.g.uuid), l.g]));
  const taches = gardees.map((x) => {
    const g = parCle.get(x.cle);
    if (!g) return x;
    if (g.statut === "termine") return { ...x, vignetteSrc: generationMediaSrc(g.assetId, g.fichier) };
    if (g.statut === "en_cours" && g.apercuAt) {
      const url = generationMediaSrc(g.assetId, g.apercuFichier);
      return { ...x, apercuSrc: url ? `${url}?v=${g.apercuAt.getTime()}` : null };
    }
    return x;
  });

  return { taches, resume: resumerTaches(taches) };
}

/** Rang d'une génération d'image qu'on vient de lancer : 1 = elle part tout de
 * suite ; n = n-1 tâches passent devant (la tâche en cours, quelle qu'elle soit,
 * et les images arrivées avant elle). */
export async function rangDansLaFile(generationId: number): Promise<number> {
  const { taches } = await listerTaches();
  const devant = taches.filter((x) => x.statut === "en_cours").length;
  const [g] = await db.select({ uuid: assetGenerations.uuid }).from(assetGenerations).where(eq(assetGenerations.id, generationId));
  const moi = g ? taches.find((x) => x.cle === cleImage(g.uuid)) : null;
  if (!moi) return devant + 1;
  if (moi.statut === "en_cours") return 1;
  return devant + (moi.positionFile ?? 1);
}

/** Nombre d'images en attente (pas en cours) : sert au plafond de la file. */
export async function nbImagesEnAttente(): Promise<number> {
  const lignes = await db.select({ id: assetGenerations.id }).from(assetGenerations).where(eq(assetGenerations.statut, "en_attente"));
  return lignes.length;
}
