import { db } from "../db";
import {
  assets,
  episodes,
  jobs,
  scenes,
  planPromptSections,
  planRefs,
  plans,
  projects,
  seasons,
} from "../db/schema";
import { and, desc, eq, inArray, isNotNull, lt, ne, sql } from "drizzle-orm";
import { additionnerBuckets, bucketiserStatuts, bucketsVides, type StatutBuckets } from "./phase";
import { posterSrc } from "./media";
import { getLiensVoix, getPlanIdsDesRepliques } from "./queries-repliques";
import { construireMatrice } from "./matrice-assets";
import { horsAffiches } from "./assets-visibles";
import { getPlansPerimes } from "./plans-perimes";

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

/** Ligne complète du projet par défaut. La clause de style et les notes qu'elle porte sont des
 * COPIES du brief (voir lib/agents/brief-db.ts) : on les lit, on ne les écrit jamais ici. */
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
 * d'ancrage aux onglets Scénario/Plans depuis Assets (lib/queries.ts,
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
    db.select({ projectId: assets.projectId }).from(assets).where(and(inArray(assets.projectId, idsProjets), horsAffiches)),
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

export type PlanListItem = {
  uuid: string; // identifiant public (URL) — la position est ce qu'on affiche
  position: number; // rang réel dans l'épisode, brouillons compris (1-based)
  titre: string;
  statut: string;
  dernierJob: { numeroRendu: number; erreur: string | null } | null;
  /** Codes des références changées depuis le dernier rendu (lib/plans-perimes) ; vide = rendu à jour ou jamais rendu. */
  codesPerimes: string[];
};

/** Frise des plans : tous les plans d'un ÉPISODE, dans l'ordre `ordre` (montage,
 * réordonnable) ; les plans s'identifient par `uuid`, sans numéro (F03).
 * Scope épisode, pas projet : la position affichée est un rang à l'échelle
 * de l'épisode, une frise multi-épisodes mélangerait des rangs qui se
 * chevauchent sans rien pour les distinguer visuellement. */
export async function getPlansList(episodeId?: number): Promise<PlanListItem[]> {
  const eid = episodeId ?? (await getDefaultEpisodeId());
  // Un plan brouillon n'a pas encore de fiche de plan (pas de prompt, pas de
  // durée de génération) : il vit dans Scénario, pas dans la queue Plans.
  const toutes = await db
    .select({ id: plans.id })
    .from(plans)
    .where(eq(plans.episodeId, eid))
    .orderBy(plans.ordre, plans.id);
  const positionParId = new Map(toutes.map((p, i) => [p.id, i + 1]));
  const rows = await db
    .select()
    .from(plans)
    .where(and(eq(plans.episodeId, eid), ne(plans.statut, "brouillon")))
    .orderBy(plans.ordre, plans.id);
  const allJobs = await db.select().from(jobs).orderBy(desc(jobs.createdAt));

  const dernierJobParPlan = new Map<number, (typeof allJobs)[number]>();
  for (const job of allJobs) {
    if (!dernierJobParPlan.has(job.planId)) dernierJobParPlan.set(job.planId, job);
  }

  const perimes = await getPlansPerimes({ planIds: rows.map((p) => p.id) });

  return rows.map((p) => ({
    uuid: p.uuid,
    position: positionParId.get(p.id) ?? 0,
    codesPerimes: perimes.get(p.id)?.codes ?? [],
    titre: p.titre,
    statut: p.statut,
    dernierJob: dernierJobParPlan.has(p.id)
      ? {
          numeroRendu: dernierJobParPlan.get(p.id)!.numeroRendu,
          erreur: dernierJobParPlan.get(p.id)!.erreur,
        }
      : null,
  }));
}

/** Fiche de plan complète : plan + prompt sectionné + refs (avec l'asset
 * associé) + historique des jobs. Les dialogues (répliques liées) vivent dans
 * lib/queries-repliques.ts, getDialoguesPlan. Retrouvée par `uuid` (identifiant
 * public, voir docs/FRICTIONS.md F03) ; le filtre episodeId garde l'URL
 * cohérente avec l'épisode affiché. */
export async function getPlanDetail(uuid: string, episodeId?: number) {
  const eid = episodeId ?? (await getDefaultEpisodeId());
  const plan = await db.query.plans.findFirst({
    where: and(eq(plans.uuid, uuid), eq(plans.episodeId, eid)),
  });
  if (!plan) return null;

  const [promptSections, refs, jobHistory, episodePlans] = await Promise.all([
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
      .from(jobs)
      .where(eq(jobs.planId, plan.id))
      .orderBy(desc(jobs.createdAt)),
    db
      .select({ id: plans.id })
      .from(plans)
      .where(eq(plans.episodeId, plan.episodeId))
      .orderBy(plans.ordre, plans.id),
  ]);
  const position = episodePlans.findIndex((p) => p.id === plan.id) + 1;

  return { plan, position, promptSections, refs, jobHistory };
}

/** Tous les assets (27 sur l'épisode 1) — pour peupler le sélecteur d'ajout
 * de référence sur la Fiche de plan. */
export async function getAllAssets(projectId?: number) {
  const pid = projectId ?? (await getDefaultProjectId());
  return db.select().from(assets).where(and(eq(assets.projectId, pid), horsAffiches)).orderBy(assets.type, assets.code);
}

/** Page Scénario : les scènes de l'épisode, et tous les plans (brouillon
 * compris) groupés par scène — un plan sans sceneId atterrit dans le groupe
 * "sans scène" plutôt que d'être perdu.
 *
 * Nombre de plans et durée d'une scène sont DÉDUITS des plans rattachés
 * (jamais stockés, voir db/schema.ts) ; les scènes suivent `scenes.ordre`.
 *
 * Le scénario est fondamentalement une unité par ÉPISODE (révisé
 * 2026-09-28, voir docs/FRICTIONS.md F03) : scènes et plans sont tous les
 * deux filtrés par episodeId directement, plus besoin de remonter par
 * saison/projet. */
export async function getScenarioData(episodeId?: number) {
  const eid = episodeId ?? (await getDefaultEpisodeId());
  const [toutesLesScenes, lignesPlans] = await Promise.all([
    db.select().from(scenes).where(eq(scenes.episodeId, eid)).orderBy(scenes.ordre),
    db.select().from(plans).where(eq(plans.episodeId, eid)).orderBy(plans.ordre, plans.id),
  ]);
  // Position réelle dans l'épisode (1-based) — c'est elle qu'on affiche ;
  // Les URL, elles, utilisent `uuid`.
  const tousLesPlans = lignesPlans.map((p, i) => ({ ...p, position: i + 1 }));

  const parScene = new Map<number, typeof tousLesPlans>();
  const sansScene: typeof tousLesPlans = [];
  for (const plan of tousLesPlans) {
    if (plan.sceneId == null) {
      sansScene.push(plan);
      continue;
    }
    const liste = parScene.get(plan.sceneId) ?? [];
    liste.push(plan);
    parScene.set(plan.sceneId, liste);
  }

  // Ordre des scènes = `scenes.ordre` (réordonnable par glisser-déposer) ; les
  // plans de chaque scène sont déjà dans l'ordre de l'épisode.
  const scenesAvecPlans = toutesLesScenes.map((sc) => {
    const liste = parScene.get(sc.id) ?? [];
    return {
      ...sc,
      plans: liste,
      dureeSecondes: liste.length > 0 ? liste.reduce((acc, p) => acc + p.dureeMontageSecondes, 0) : null,
    };
  });

  return {
    scenes: scenesAvecPlans,
    sansScene,
  };
}

/** Les chiffres de l'état des plans (en-tête de l'épisode) : de simples agrégats, sans charger les plans eux-mêmes. */
export async function getEtatPlans(episodeId: number) {
  const [[p], [sc]] = await Promise.all([
    db
      .select({
        nbPlans: sql<number>`count(*)::int`,
        nbBrouillons: sql<number>`count(*) filter (where ${plans.statut} = 'brouillon')::int`,
        duree: sql<number>`coalesce(sum(${plans.dureeMontageSecondes}), 0)::int`,
      })
      .from(plans)
      .where(eq(plans.episodeId, episodeId)),
    db.select({ nbScenes: sql<number>`count(*)::int` }).from(scenes).where(eq(scenes.episodeId, episodeId)),
  ]);
  return {
    nbPlans: p?.nbPlans ?? 0,
    nbDeveloppes: (p?.nbPlans ?? 0) - (p?.nbBrouillons ?? 0),
    nbScenes: sc?.nbScenes ?? 0,
    dureeSecondes: p?.duree ?? 0,
  };
}

/** Scènes d'un épisode (id + titre), dans l'ordre de création — alimente le
 * sélecteur de scène de la page d'un plan. */
export async function getScenesEpisode(episodeId: number) {
  return db
    .select({ id: scenes.id, titre: scenes.titre })
    .from(scenes)
    .where(eq(scenes.episodeId, episodeId))
    .orderBy(scenes.ordre);
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
    db.select({ episodeId: plans.episodeId, statut: plans.statut }).from(plans).where(eq(plans.projectId, projectId)),
  ]);

  const parEpisodeId = new Map<number, { statuts: (typeof lesPlans)[number]["statut"][] }>();
  for (const p of lesPlans) {
    const courant = parEpisodeId.get(p.episodeId) ?? { statuts: [] };
    courant.statuts.push(p.statut);
    parEpisodeId.set(p.episodeId, courant);
  }

  const episodesParSaison = new Map<number, typeof lesEpisodesAvecSaison>();
  for (const row of lesEpisodesAvecSaison) episodesParSaison.set(row.seasonId, [...(episodesParSaison.get(row.seasonId) ?? []), row]);

  const saisonsAvecEpisodes = lesSaisons.map((saison) => {
    const episodesDeCetteSaison = (episodesParSaison.get(saison.id) ?? []).map(({ episode }) => {
      const donnees = parEpisodeId.get(episode.id) ?? { statuts: [] };
      return {
        ...episode,
        posterSrc: posterSrc("episodes", episode.id, episode.posterFichier),
        buckets: bucketiserStatuts(donnees.statuts),
        nbPlans: donnees.statuts.length,
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
/** `refId` : la ligne de plan_refs qui cite l'asset (déliable). `deduite` : la
 * citation d'une VOIX vient des répliques liées au plan (locuteur -> voix), pas
 * d'un lien stocké — il n'y a rien à délier, on retire la réplique du plan. */
export type AssetCitation = { planId: number; planUuid: string; position: number; episodeNumero: number; episodeId: number; refId: number | null; deduite: boolean };

/** Registre d'assets en arborescence par sujet (masters + dérivés), pas par
 * type — demande explicite de l'utilisateur (2026-09-27) : le type reste un
 * simple tag informatif, le regroupement se fait sur deriveDeId.
 *
 * `citations` détaille CHAQUE ligne de ref qui cite l'asset, pas juste les
 * numéros de plan — nécessaire pour pouvoir délier une citation précise sans
 * supprimer les autres (retour utilisateur 2026-09-28 : la suppression d'un
 * asset cité doit être bloquée tant qu'il n'a pas été délié explicitement de
 * chaque plan qui le cite). Une voix est aussi « citée » par les plans dont
 * les répliques la portent (citation déduite, non déliable).
 *
 * Un personnage porte en plus `voix` (sa voix au casting, colonne CALCULÉE en
 * lecture seule : le lien vit sur voix_fiches.personnageId, jamais dupliqué
 * ici) et `nbRepliques` ; une voix porte `personnageCode`. */
export async function getAssetsTree(projectId?: number) {
  const pid = projectId ?? (await getDefaultProjectId());
  const tousLesAssets = await db.select().from(assets).where(and(eq(assets.projectId, pid), horsAffiches)).orderBy(assets.code);
  const toutesLesRefs = await db
    .select({ id: planRefs.id, assetId: planRefs.assetId, planId: planRefs.planId })
    .from(planRefs);
  const liensVoix = await getLiensVoix(pid);
  // Filtré au même projet : un ref vers un plan d'un autre projet (ne devrait
  // jamais arriver, mais rien ne l'empêche au niveau FK) sort naturellement du
  // calcul de citations puisque son planId n'aura pas d'entrée dans planParId.
  const tousLesPlans = await db
    .select({ id: plans.id, uuid: plans.uuid, ordre: plans.ordre, episodeId: plans.episodeId, episodeNumero: episodes.numero })
    .from(plans)
    .innerJoin(episodes, eq(plans.episodeId, episodes.id))
    .where(eq(plans.projectId, pid))
    .orderBy(plans.ordre, plans.id);

  // Position réelle de chaque plan dans son épisode (1-based).
  const compteurParEpisode = new Map<number, number>();
  const positionParPlanId = new Map<number, number>();
  for (const p of tousLesPlans) {
    const rang = (compteurParEpisode.get(p.episodeId) ?? 0) + 1;
    compteurParEpisode.set(p.episodeId, rang);
    positionParPlanId.set(p.id, rang);
  }

  const planParId = new Map(tousLesPlans.map((p) => [p.id, p]));
  const citationsParAssetId = new Map<number, AssetCitation[]>();

  for (const ref of toutesLesRefs) {
    if (ref.assetId == null) continue;
    const plan = planParId.get(ref.planId);
    if (!plan) continue;
    const liste = citationsParAssetId.get(ref.assetId) ?? [];
    liste.push({ planId: plan.id, planUuid: plan.uuid, position: positionParPlanId.get(plan.id) ?? 0, episodeNumero: plan.episodeNumero, episodeId: plan.episodeId, refId: ref.id, deduite: false });
    citationsParAssetId.set(ref.assetId, liste);
  }
  // Voix : les plans où l'une de ses répliques est liée, un chip par plan.
  const planIdsParReplique = await getPlanIdsDesRepliques([...liensVoix.repliquesParVoix.values()].flat());
  for (const [voixId, idsRepliques] of liensVoix.repliquesParVoix) {
    const planIds = new Set(idsRepliques.flatMap((id) => planIdsParReplique.get(id) ?? []));
    const liste = citationsParAssetId.get(voixId) ?? [];
    for (const planId of planIds) {
      const plan = planParId.get(planId);
      if (!plan) continue;
      liste.push({ planId: plan.id, planUuid: plan.uuid, position: positionParPlanId.get(plan.id) ?? 0, episodeNumero: plan.episodeNumero, episodeId: plan.episodeId, refId: null, deduite: true });
    }
    citationsParAssetId.set(voixId, liste);
  }

  const enfantsParParentId = new Map<number, typeof tousLesAssets>();
  for (const asset of tousLesAssets) {
    if (asset.deriveDeId == null) continue;
    const liste = enfantsParParentId.get(asset.deriveDeId) ?? [];
    liste.push(asset);
    enfantsParParentId.set(asset.deriveDeId, liste);
  }

  const codeParId = new Map(tousLesAssets.map((a) => [a.id, a.code]));

  type AssetAvecDerives = (typeof tousLesAssets)[number] & {
    citations: AssetCitation[];
    plansCitants: number[];
    /** Personnage : sa voix au casting (calculée). */
    voix: { id: number; code: string } | null;
    /** Voix : le personnage auquel elle est rattachée (calculé). */
    personnageCode: string | null;
    /** Personnage : nombre de répliques qu'il porte. */
    nbRepliques: number;
    derives: AssetAvecDerives[];
  };

  function construireNoeud(asset: (typeof tousLesAssets)[number]): AssetAvecDerives {
    const citations = (citationsParAssetId.get(asset.id) ?? []).sort((a, b) => a.episodeNumero - b.episodeNumero || a.position - b.position);
    return {
      ...asset,
      citations,
      plansCitants: [...new Set(citations.map((c) => c.position))].sort((a, b) => a - b),
      voix: asset.type === "personnage" ? (liensVoix.voixParPersonnage.get(asset.id) ?? null) : null,
      personnageCode:
        asset.type === "voix" && liensVoix.personnageParVoix.has(asset.id)
          ? (codeParId.get(liensVoix.personnageParVoix.get(asset.id)!) ?? null)
          : null,
      nbRepliques: liensVoix.nbRepliquesParPersonnage.get(asset.id) ?? 0,
      derives: (enfantsParParentId.get(asset.id) ?? [])
        .sort((a, b) => a.code.localeCompare(b.code))
        .map(construireNoeud),
    };
  }

  return tousLesAssets.filter((a) => a.deriveDeId == null).map(construireNoeud);
}

/** Un plan de la frise de lecture d'un épisode : sa position, son rendu terminé le plus récent (null s'il n'en a pas) et
 * sa durée. Dans l'ordre de montage (`ordre`) ; les positions s'affichent, jamais un identifiant (F03). */
export type SegmentLecture = { uuid: string; position: number; titre: string; dureeSecondes: number; src: string | null };

export async function getSegmentsLecture(episodeId: number): Promise<SegmentLecture[]> {
  const lesPlans = await db.select().from(plans).where(eq(plans.episodeId, episodeId)).orderBy(plans.ordre, plans.id);
  if (lesPlans.length === 0) return [];
  const rendus = await db
    .select({ planId: jobs.planId, chemin: jobs.cheminSortie, createdAt: jobs.createdAt })
    .from(jobs)
    .where(and(inArray(jobs.planId, lesPlans.map((p) => p.id)), eq(jobs.statut, "termine"), isNotNull(jobs.cheminSortie)))
    .orderBy(desc(jobs.createdAt), desc(jobs.id));
  const dernier = new Map<number, string>();
  for (const r of rendus) if (r.chemin && !dernier.has(r.planId)) dernier.set(r.planId, r.chemin);
  return lesPlans.map((p, i) => ({
    uuid: p.uuid,
    position: i + 1,
    titre: p.titre,
    dureeSecondes: p.dureeGenerationSecondes > 0 ? p.dureeGenerationSecondes : p.dureeMontageSecondes,
    src: dernier.has(p.id) ? `/api/media/${dernier.get(p.id)}` : null,
  }));
}

/** Qui sert dans quel plan, pour le tableau de cohérence d'un épisode (lib/matrice-assets.ts). */
export async function getMatriceAssets(episodeId: number) {
  const lesPlans = await db.select({ id: plans.id, uuid: plans.uuid, titre: plans.titre }).from(plans).where(eq(plans.episodeId, episodeId)).orderBy(plans.ordre, plans.id);
  if (lesPlans.length === 0) return { plans: [], lignes: [] };
  const refs = await db
    .select({ planId: planRefs.planId, code: assets.code, type: assets.type })
    .from(planRefs)
    .innerJoin(assets, eq(assets.id, planRefs.assetId))
    .where(inArray(planRefs.planId, lesPlans.map((p) => p.id)));
  const uuidParId = new Map(lesPlans.map((p) => [p.id, p.uuid]));
  const planMatrice = lesPlans.map((p, i) => ({ uuid: p.uuid, position: i + 1, titre: p.titre }));
  return {
    plans: planMatrice,
    lignes: construireMatrice(planMatrice, refs.map((r) => ({ assetCode: r.code, assetType: r.type, planUuid: uuidParId.get(r.planId)! }))),
  };
}
