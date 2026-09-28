import { db } from "../db";
import {
  assets,
  episodes,
  jobs,
  mouvements,
  planDialogues,
  planPromptSections,
  planRefs,
  plans,
  projects,
  seasons,
} from "../db/schema";
import { and, desc, eq, inArray, ne } from "drizzle-orm";
import { additionnerBuckets, bucketiserStatuts, bucketsVides, type StatutBuckets } from "./phase";
import { posterSrc } from "./media";

/** Pas encore de sélecteur de projet dans l'UI (2026-09-28) — toutes les
 * pages opèrent sur le premier projet créé. Le schéma est prêt pour
 * plusieurs projets, l'interface pour en choisir un ne l'est pas encore :
 * point à construire quand un deuxième projet existera réellement. */
export async function getDefaultProjectId(): Promise<number> {
  const [projet] = await db.select({ id: projects.id }).from(projects).orderBy(projects.id).limit(1);
  if (!projet) throw new Error("Aucun projet en base — voir db/migrations pour le projet créé par la migration 0007.");
  return projet.id;
}

/** Même logique que getDefaultProjectId : le premier épisode du premier
 * projet, tant qu'il n'y a rien pour en choisir un autre. */
export async function getDefaultEpisodeId(): Promise<number> {
  const [episode] = await db.select({ id: episodes.id }).from(episodes).orderBy(episodes.id).limit(1);
  if (!episode) throw new Error("Aucun épisode en base — voir db/migrations pour l'épisode créé par la migration 0007.");
  return episode.id;
}

/** Ligne complète du projet par défaut — clause de style + réglages
 * scénario (globaux du projet, voir ScenarioGlobalsEditor). */
export async function getDefaultProject() {
  const [projet] = await db.select().from(projects).orderBy(projects.id).limit(1);
  if (!projet) throw new Error("Aucun projet en base — voir db/migrations pour le projet créé par la migration 0007.");
  return projet;
}

export async function getProject(projectId: number) {
  const [projet] = await db.select().from(projects).where(eq(projects.id, projectId));
  return projet ?? null;
}

/** Premier épisode du projet (par numéro de saison puis d'épisode) — sert
 * d'ancrage aux onglets Scénario/Shots depuis Assets (lib/queries.ts,
 * Assets vit au niveau du projet, pas d'un épisode précis) quand il faut
 * bien pointer les autres onglets quelque part. */
export async function getFirstEpisodeId(projectId: number): Promise<number | null> {
  const [row] = await db
    .select({ id: episodes.id })
    .from(episodes)
    .innerJoin(seasons, eq(episodes.seasonId, seasons.id))
    .where(eq(seasons.projectId, projectId))
    .orderBy(seasons.numero, episodes.numero)
    .limit(1);
  return row?.id ?? null;
}

/** Sa saison et son épisode uniques — sert de raccourci pour un OneShot
 * (toujours 1 saison + 1 épisode) sans passer par la vue Série. */
export async function getEpisodeUnique(projectId: number) {
  const [saison] = await db.select().from(seasons).where(eq(seasons.projectId, projectId)).orderBy(seasons.numero).limit(1);
  if (!saison) return null;
  const [episode] = await db.select().from(episodes).where(eq(episodes.seasonId, saison.id)).orderBy(episodes.numero).limit(1);
  if (!episode) return null;
  return { saison, episode };
}

export type ProjectListItem = Awaited<ReturnType<typeof getAllProjects>>[number];

/** Écran Accueil : tous les projets, avec assez d'agrégats pour la carte
 * (compteurs, répartition des statuts de plans) sans avoir à recharger
 * chaque projet séparément — trois requêtes groupées plutôt qu'une par
 * projet, le volume reste petit (quelques dizaines de projets au pire). */
export async function getAllProjects() {
  const tousLesProjets = await db.select().from(projects).orderBy(projects.id);
  if (tousLesProjets.length === 0) return [];
  const idsProjets = tousLesProjets.map((p) => p.id);

  const [toutesLesSaisons, tousLesEpisodesAvecSaison, tousLesPlans, tousLesAssets] = await Promise.all([
    db.select().from(seasons).where(inArray(seasons.projectId, idsProjets)),
    db
      .select({ episode: episodes, projectId: seasons.projectId })
      .from(episodes)
      .innerJoin(seasons, eq(episodes.seasonId, seasons.id))
      .where(inArray(seasons.projectId, idsProjets)),
    db.select({ projectId: plans.projectId, statut: plans.statut }).from(plans).where(inArray(plans.projectId, idsProjets)),
    db.select({ projectId: assets.projectId }).from(assets).where(inArray(assets.projectId, idsProjets)),
  ]);

  const saisonsParProjet = new Map<number, typeof toutesLesSaisons>();
  for (const s of toutesLesSaisons) saisonsParProjet.set(s.projectId, [...(saisonsParProjet.get(s.projectId) ?? []), s]);

  const episodesParProjet = new Map<number, (typeof tousLesEpisodesAvecSaison)[number]["episode"][]>();
  for (const { episode, projectId } of tousLesEpisodesAvecSaison) {
    episodesParProjet.set(projectId, [...(episodesParProjet.get(projectId) ?? []), episode]);
  }

  const bucketsParProjet = new Map<number, StatutBuckets>();
  const statutsParProjet = new Map<number, (typeof tousLesPlans)[number]["statut"][]>();
  for (const p of tousLesPlans) statutsParProjet.set(p.projectId, [...(statutsParProjet.get(p.projectId) ?? []), p.statut]);
  for (const [projectId, statuts] of statutsParProjet) bucketsParProjet.set(projectId, bucketiserStatuts(statuts));

  const assetsParProjet = new Map<number, number>();
  for (const a of tousLesAssets) assetsParProjet.set(a.projectId, (assetsParProjet.get(a.projectId) ?? 0) + 1);

  return tousLesProjets.map((p) => ({
    ...p,
    posterSrc: posterSrc("projects", p.id, p.posterFichier),
    saisons: saisonsParProjet.get(p.id) ?? [],
    episodes: episodesParProjet.get(p.id) ?? [],
    buckets: bucketsParProjet.get(p.id) ?? bucketsVides(),
    nbAssets: assetsParProjet.get(p.id) ?? 0,
  }));
}

export type ShotListItem = {
  numero: number;
  titre: string;
  statut: string;
  dernierJob: { tentative: number; erreur: string | null } | null;
};

/** Frise Shots : tous les plans d'un ÉPISODE, ordonnés par numéro — les
 * trous des plans supprimés restent visibles, jamais renumérotés (F03).
 * Scope épisode, pas projet (révisé 2026-09-28 en même temps que la
 * numérotation) : `numero` n'est unique/continu qu'à l'échelle de
 * l'épisode, une frise multi-épisodes mélangerait des numeros qui se
 * chevauchent sans rien pour les distinguer visuellement. */
export async function getShotsList(episodeId?: number): Promise<ShotListItem[]> {
  const eid = episodeId ?? (await getDefaultEpisodeId());
  // Un plan brouillon n'a pas encore de fiche de plan (pas de prompt, pas de
  // durée de génération) : il vit dans Scénario, pas dans la queue Shots.
  const rows = await db
    .select()
    .from(plans)
    .where(and(eq(plans.episodeId, eid), ne(plans.statut, "brouillon")))
    .orderBy(plans.numero);
  const allJobs = await db.select().from(jobs).orderBy(desc(jobs.createdAt));

  const dernierJobParPlan = new Map<number, (typeof allJobs)[number]>();
  for (const job of allJobs) {
    if (!dernierJobParPlan.has(job.planId)) dernierJobParPlan.set(job.planId, job);
  }

  return rows.map((p) => ({
    numero: p.numero,
    titre: p.titre,
    statut: p.statut,
    dernierJob: dernierJobParPlan.has(p.id)
      ? {
          tentative: dernierJobParPlan.get(p.id)!.tentative,
          erreur: dernierJobParPlan.get(p.id)!.erreur,
        }
      : null,
  }));
}

/** Fiche de plan complète : plan + prompt sectionné + refs (avec l'asset
 * associé) + dialogues + historique des jobs. numero n'est unique que par
 * ÉPISODE (révisé 2026-09-28, voir docs/FRICTIONS.md F03) — filtrer par
 * episodeId, pas projectId, est ce qui évite réellement une collision. */
export async function getPlanDetail(numero: number, episodeId?: number) {
  const eid = episodeId ?? (await getDefaultEpisodeId());
  const plan = await db.query.plans.findFirst({
    where: and(eq(plans.numero, numero), eq(plans.episodeId, eid)),
  });
  if (!plan) return null;

  const [promptSections, refs, dialogues, jobHistory] = await Promise.all([
    db
      .select()
      .from(planPromptSections)
      .where(eq(planPromptSections.planId, plan.id))
      .orderBy(planPromptSections.ordre),
    db
      .select({
        id: planRefs.id,
        type: planRefs.type,
        slot: planRefs.slot,
        role: planRefs.role,
        retention: planRefs.retention,
        asset: assets,
      })
      .from(planRefs)
      .leftJoin(assets, eq(planRefs.assetId, assets.id))
      .where(eq(planRefs.planId, plan.id)),
    db
      .select()
      .from(planDialogues)
      .where(eq(planDialogues.planId, plan.id))
      .orderBy(planDialogues.slot),
    db
      .select()
      .from(jobs)
      .where(eq(jobs.planId, plan.id))
      .orderBy(desc(jobs.createdAt)),
  ]);

  return { plan, promptSections, refs, dialogues, jobHistory };
}

/** Tous les assets (27 sur l'épisode 1) — pour peupler le sélecteur d'ajout
 * de référence sur la Fiche de plan. */
export async function getAllAssets(projectId?: number) {
  const pid = projectId ?? (await getDefaultProjectId());
  return db.select().from(assets).where(eq(assets.projectId, pid)).orderBy(assets.type, assets.code);
}

/** Page Scénario : les mouvements narratifs, et tous les plans (brouillon
 * compris) groupés par mouvement — un plan sans mouvementId atterrit dans
 * le groupe "sans mouvement" plutôt que d'être perdu.
 *
 * Le scénario est fondamentalement une unité par ÉPISODE (révisé
 * 2026-09-28, voir docs/FRICTIONS.md F03) : mouvements et plans sont tous
 * les deux filtrés par episodeId directement, plus besoin de remonter par
 * saison/projet — `prochainNumeroLibre` est donc aussi calculé à l'échelle
 * de cet épisode, pas du projet entier. */
export async function getScenarioData(episodeId?: number) {
  const eid = episodeId ?? (await getDefaultEpisodeId());
  const [tousLesMouvements, tousLesPlans] = await Promise.all([
    db.select().from(mouvements).where(eq(mouvements.episodeId, eid)).orderBy(mouvements.ordre),
    db.select().from(plans).where(eq(plans.episodeId, eid)).orderBy(plans.numero),
  ]);

  const parMouvement = new Map<number, typeof tousLesPlans>();
  const sansMouvement: typeof tousLesPlans = [];
  for (const plan of tousLesPlans) {
    if (plan.mouvementId == null) {
      sansMouvement.push(plan);
      continue;
    }
    const liste = parMouvement.get(plan.mouvementId) ?? [];
    liste.push(plan);
    parMouvement.set(plan.mouvementId, liste);
  }

  return {
    mouvements: tousLesMouvements.map((m) => ({
      ...m,
      plans: parMouvement.get(m.id) ?? [],
    })),
    sansMouvement,
    prochainNumeroLibre: tousLesPlans.reduce((acc, p) => Math.max(acc, p.numero), 0) + 10,
  };
}

/** Épisode + sa saison — sert au bandeau (fil d'Ariane, numéro de saison)
 * et à vérifier qu'un épisode appartient bien au projet de l'URL avant
 * d'afficher quoi que ce soit (voir app/p/[projectId]/e/[episodeId]/layout.tsx). */
export async function getEpisodeWithSeason(episodeId: number) {
  const [row] = await db
    .select({ episode: episodes, season: seasons })
    .from(episodes)
    .innerJoin(seasons, eq(episodes.seasonId, seasons.id))
    .where(eq(episodes.id, episodeId));
  return row ?? null;
}

export type ProjectHierarchy = NonNullable<Awaited<ReturnType<typeof getProjectHierarchy>>>;

/** Écran Vue série : projet + saisons + épisodes, chacun avec sa
 * répartition de statuts (pour le badge de statut ET la phase de
 * pipeline — voir lib/phase.ts) et sa plage de numéros de plan (continue
 * à l'échelle de l'épisode depuis F03, révision 2026-09-28). */
export async function getProjectHierarchy(projectId: number) {
  const projet = await getProject(projectId);
  if (!projet) return null;

  const [lesSaisons, lesEpisodesAvecSaison, lesPlans] = await Promise.all([
    db.select().from(seasons).where(eq(seasons.projectId, projectId)).orderBy(seasons.numero),
    db
      .select({ episode: episodes, seasonId: episodes.seasonId })
      .from(episodes)
      .innerJoin(seasons, eq(episodes.seasonId, seasons.id))
      .where(eq(seasons.projectId, projectId))
      .orderBy(episodes.numero),
    db.select({ episodeId: plans.episodeId, statut: plans.statut, numero: plans.numero }).from(plans).where(eq(plans.projectId, projectId)),
  ]);

  const parEpisodeId = new Map<number, { statuts: (typeof lesPlans)[number]["statut"][]; numeros: number[] }>();
  for (const p of lesPlans) {
    const courant = parEpisodeId.get(p.episodeId) ?? { statuts: [], numeros: [] };
    courant.statuts.push(p.statut);
    courant.numeros.push(p.numero);
    parEpisodeId.set(p.episodeId, courant);
  }

  const episodesParSaison = new Map<number, typeof lesEpisodesAvecSaison>();
  for (const row of lesEpisodesAvecSaison) episodesParSaison.set(row.seasonId, [...(episodesParSaison.get(row.seasonId) ?? []), row]);

  const saisonsAvecEpisodes = lesSaisons.map((saison) => {
    const episodesDeCetteSaison = (episodesParSaison.get(saison.id) ?? []).map(({ episode }) => {
      const donnees = parEpisodeId.get(episode.id) ?? { statuts: [], numeros: [] };
      return {
        ...episode,
        posterSrc: posterSrc("episodes", episode.id, episode.posterFichier),
        buckets: bucketiserStatuts(donnees.statuts),
        nbPlans: donnees.numeros.length,
        numeroMin: donnees.numeros.length ? Math.min(...donnees.numeros) : null,
        numeroMax: donnees.numeros.length ? Math.max(...donnees.numeros) : null,
      };
    });
    const bucketsSaison = episodesDeCetteSaison.reduce((acc, e) => additionnerBuckets(acc, e.buckets), bucketsVides());
    return {
      ...saison,
      posterSrc: posterSrc("seasons", saison.id, saison.posterFichier),
      episodes: episodesDeCetteSaison,
      buckets: bucketsSaison,
    };
  });

  const bucketsProjet = saisonsAvecEpisodes.reduce((acc, s) => additionnerBuckets(acc, s.buckets), bucketsVides());
  const nbEpisodes = saisonsAvecEpisodes.reduce((acc, s) => acc + s.episodes.length, 0);

  return { projet, saisons: saisonsAvecEpisodes, buckets: bucketsProjet, nbEpisodes };
}

export type AssetNode = Awaited<ReturnType<typeof getAssetsTree>>[number];
export type AssetCitation = { planNumero: number; episodeId: number; refId: number | null; dialogueId: number | null };

/** Registre d'assets en arborescence par sujet (masters + dérivés), pas par
 * type — demande explicite de l'utilisateur (2026-09-27) : le type reste un
 * simple tag informatif, le regroupement se fait sur deriveDeId.
 *
 * `citations` détaille CHAQUE ligne (ref ou dialogue) qui cite l'asset, pas
 * juste les numéros de plan — nécessaire pour pouvoir délier une citation
 * précise sans supprimer les autres (retour utilisateur 2026-09-28 : la
 * suppression d'un asset cité doit être bloquée tant qu'il n'a pas été
 * délié explicitement de chaque plan qui le cite). */
export async function getAssetsTree(projectId?: number) {
  const pid = projectId ?? (await getDefaultProjectId());
  const tousLesAssets = await db.select().from(assets).where(eq(assets.projectId, pid)).orderBy(assets.code);
  const toutesLesRefs = await db
    .select({ id: planRefs.id, assetId: planRefs.assetId, planId: planRefs.planId })
    .from(planRefs);
  const tousLesDialogues = await db
    .select({ id: planDialogues.id, assetVoixId: planDialogues.assetVoixId, planId: planDialogues.planId })
    .from(planDialogues);
  // Filtré au même projet : un ref/dialogue vers un plan d'un autre projet
  // (ne devrait jamais arriver, mais rien ne l'empêche au niveau FK) sort
  // naturellement du calcul de citations puisque son planId n'aura pas
  // d'entrée dans numeroParPlanId.
  const tousLesPlans = await db
    .select({ id: plans.id, numero: plans.numero, episodeId: plans.episodeId })
    .from(plans)
    .where(eq(plans.projectId, pid));

  const planParId = new Map(tousLesPlans.map((p) => [p.id, p]));
  const citationsParAssetId = new Map<number, AssetCitation[]>();

  for (const ref of toutesLesRefs) {
    if (ref.assetId == null) continue;
    const plan = planParId.get(ref.planId);
    if (!plan) continue;
    const liste = citationsParAssetId.get(ref.assetId) ?? [];
    liste.push({ planNumero: plan.numero, episodeId: plan.episodeId, refId: ref.id, dialogueId: null });
    citationsParAssetId.set(ref.assetId, liste);
  }
  for (const d of tousLesDialogues) {
    if (d.assetVoixId == null) continue;
    const plan = planParId.get(d.planId);
    if (!plan) continue;
    const liste = citationsParAssetId.get(d.assetVoixId) ?? [];
    liste.push({ planNumero: plan.numero, episodeId: plan.episodeId, refId: null, dialogueId: d.id });
    citationsParAssetId.set(d.assetVoixId, liste);
  }

  const enfantsParParentId = new Map<number, typeof tousLesAssets>();
  for (const asset of tousLesAssets) {
    if (asset.deriveDeId == null) continue;
    const liste = enfantsParParentId.get(asset.deriveDeId) ?? [];
    liste.push(asset);
    enfantsParParentId.set(asset.deriveDeId, liste);
  }

  type AssetAvecDerives = (typeof tousLesAssets)[number] & {
    citations: AssetCitation[];
    plansCitants: number[];
    derives: AssetAvecDerives[];
  };

  function construireNoeud(asset: (typeof tousLesAssets)[number]): AssetAvecDerives {
    const citations = (citationsParAssetId.get(asset.id) ?? []).sort((a, b) => a.planNumero - b.planNumero);
    return {
      ...asset,
      citations,
      plansCitants: [...new Set(citations.map((c) => c.planNumero))].sort((a, b) => a - b),
      derives: (enfantsParParentId.get(asset.id) ?? [])
        .sort((a, b) => a.code.localeCompare(b.code))
        .map(construireNoeud),
    };
  }

  return tousLesAssets.filter((a) => a.deriveDeId == null).map(construireNoeud);
}
