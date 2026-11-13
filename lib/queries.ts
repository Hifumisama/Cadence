import { db } from "../db";
import {
  assets,
  briefs,
  conceptions,
  episodes,
  jobs,
  scenes,
  planPromptSections,
  planRefs,
  plans,
  projects,
} from "../db/schema";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { bucketiserStatuts, bucketsVides, type StatutBuckets } from "./projects/phase";
import { posterSrc } from "./media";
import { estCritique, statutAsset } from "./assets/asset-state";
import { horsAffiches } from "./assets/assets-visible";

/** No project selector in the UI yet (2026-09-28) — all the
 * pages operate on the first project created. The schema is ready for
 * several projects; the interface to choose one is not yet:
 * a point to build when a second project really exists. */
async function getDefaultProjectId(): Promise<number> {
  const [projet] = await db.select({ id: projects.id }).from(projects).orderBy(projects.id).limit(1);
  if (!projet) throw new Error("Aucun projet en base — voir db/migrations pour le projet créé par la migration 0007.");
  return projet.id;
}

/** Same logic as getDefaultProjectId: the first episode of the first
 * project, as long as there is nothing to choose another one. */
async function getDefaultEpisodeId(): Promise<number> {
  const [episode] = await db.select({ id: episodes.id }).from(episodes).orderBy(episodes.id).limit(1);
  if (!episode) throw new Error("Aucun épisode en base — voir db/migrations pour l'épisode créé par la migration 0007.");
  return episode.id;
}

export async function getProject(projectId: number) {
  const [projet] = await db.select().from(projects).where(eq(projects.id, projectId));
  return projet ?? null;
}

/** First episode of the project (by number) — serves as an anchor for the Scénario/Plans tabs from Assets (Assets lives at the project level,
 * not at a specific episode) when the other tabs must point somewhere. A project is a film: it has only one. */
export async function getFirstEpisodeId(projectId: number): Promise<number | null> {
  const [row] = await db.select({ id: episodes.id }).from(episodes).where(eq(episodes.projectId, projectId)).orderBy(episodes.numero).limit(1);
  return row?.id ?? null;
}

export type ProjectListItem = Awaited<ReturnType<typeof getAllProjects>>[number];

/** Home screen: all the projects, with enough aggregates for the card
 * (counters, distribution of clip statuses) without having to reload
 * each project separately — three grouped queries rather than one per
 * project; the volume stays small (a few dozen projects at most). */
export async function getAllProjects() {
  const tousLesProjets = await db.select().from(projects).orderBy(projects.id);
  if (tousLesProjets.length === 0) return [];
  const idsProjets = tousLesProjets.map((p) => p.id);

  const [tousLesEpisodes, tousLesPlans, tousLesAssets, conceptionsOuvertes, tousLesBriefs] = await Promise.all([
    db.select().from(episodes).where(inArray(episodes.projectId, idsProjets)),
    db.select({ projectId: plans.projectId, statut: plans.statut }).from(plans).where(inArray(plans.projectId, idsProjets)),
    db.select({ projectId: assets.projectId }).from(assets).where(and(inArray(assets.projectId, idsProjets), horsAffiches)),
    // Design started but preparation not launched: the user is still in the interview (or at the clap); the card brings them back to /demarrage.
    db
      .select({ projectId: conceptions.projectId })
      .from(conceptions)
      .where(and(inArray(conceptions.projectId, idsProjets), sql`not exists (select 1 from creations_projet c where c.project_id = ${conceptions.projectId})`)),
    // The unfolded panel of the card: style, arc, duration, language… read from the brief (a « partiel » brief already carries the style).
    db.select({ projectId: briefs.projectId, contenu: briefs.contenu }).from(briefs).where(inArray(briefs.projectId, idsProjets)),
  ]);
  const resumeParProjet = new Map(tousLesBriefs.map((b) => [b.projectId, resumeBrief(b.contenu)] as const));
  const enConception = new Set(conceptionsOuvertes.map((c) => c.projectId));

  const episodesParProjet = new Map<number, (typeof tousLesEpisodes)[number][]>();
  for (const episode of tousLesEpisodes) {
    episodesParProjet.set(episode.projectId, [...(episodesParProjet.get(episode.projectId) ?? []), episode]);
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
    episodes: episodesParProjet.get(p.id) ?? [],
    buckets: bucketsParProjet.get(p.id) ?? bucketsVides(),
    nbAssets: assetsParProjet.get(p.id) ?? 0,
    conceptionEnCours: enConception.has(p.id),
    resume: resumeParProjet.get(p.id) ?? null,
  }));
}

/** What a project's card shows when unfolded, taken from the brief (each field may be missing: partial brief or not yet written). */
function resumeBrief(contenu: unknown) {
  const c = (contenu ?? {}) as Record<string, unknown>;
  const texte = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
  const style = c.style as { nom?: unknown } | undefined;
  return {
    style: texte(style?.nom),
    arc: texte(c.arc),
    genreTon: texte(c.genreTon),
    langue: texte(c.langueDialogues),
    dureeSecondes: typeof c.dureeEpisodeSecondes === "number" && c.dureeEpisodeSecondes > 0 ? c.dureeEpisodeSecondes : null,
    nbPersonnages: Array.isArray(c.personnages) ? c.personnages.length : 0,
    nbLieux: Array.isArray(c.lieux) ? c.lieux.length : 0,
  };
}

/** Complete clip sheet: clip + sectioned prompt + refs (with the associated
 * asset) + jobs history. The dialogue lives in the prompt (`<d>`). Found by `uuid` (public identifier,
 * see docs/FRICTIONS.md F03); the episodeId filter keeps the URL
 * consistent with the displayed episode. */
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
      .where(eq(planRefs.planId, plan.id))
      // The `audio` value stays in the Postgres enum (removing a value is heavy) but no reference of that type is used any more.
      .then((rows) => rows.flatMap((r) => (r.type === "audio" ? [] : [{ ...r, type: r.type }]))),
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

/** All assets (27 on episode 1) — to populate the reference-adding selector
 * on the clip sheet. */
export async function getAllAssets(projectId?: number) {
  const pid = projectId ?? (await getDefaultProjectId());
  return db.select().from(assets).where(and(eq(assets.projectId, pid), horsAffiches)).orderBy(assets.type, assets.code);
}

/** Scénario page: the scenes of the episode, and all the clips (draft
 * included) grouped by scene — a clip without sceneId lands in the "sans scène"
 * group rather than being lost.
 *
 * The number of clips and the duration of a scene are DERIVED from the attached clips
 * (never stored, see db/schema.ts); the scenes follow `scenes.ordre`.
 *
 * The screenplay is fundamentally one unit per EPISODE (revised
 * 2026-09-28, see docs/FRICTIONS.md F03): scenes and clips are both
 * filtered by episodeId directly, with no need to go back up through
 * season/project. */
export async function getScenarioData(episodeId?: number) {
  const eid = episodeId ?? (await getDefaultEpisodeId());
  const [toutesLesScenes, lignesPlans] = await Promise.all([
    db.select().from(scenes).where(eq(scenes.episodeId, eid)).orderBy(scenes.ordre),
    db.select().from(plans).where(eq(plans.episodeId, eid)).orderBy(plans.ordre, plans.id),
  ]);
  // Real position in the episode (1-based) — this is what is displayed;
  // the URLs, for their part, use `uuid`.
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

  // Scene order = `scenes.ordre` (reorderable by drag and drop); the
  // clips of each scene are already in episode order.
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

/** The figures of the clips' state (episode header): simple aggregates, without loading the clips themselves. */
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

/** Scenes of an episode (id + title), in creation order — feeds the
 * scene selector of a clip's page. */
export async function getScenesEpisode(episodeId: number) {
  return db
    .select({ id: scenes.id, titre: scenes.titre, creativite: scenes.creativite, styleCamera: scenes.styleCamera })
    .from(scenes)
    .where(eq(scenes.episodeId, episodeId))
    .orderBy(scenes.ordre);
}

/** The episode, for the band (breadcrumb trail) and to check that it indeed belongs to the project of the URL before displaying anything
 * (see app/p/[projectId]/e/[episodeId]/layout.tsx). */
export async function getEpisode(episodeId: number) {
  const [episode] = await db.select().from(episodes).where(eq(episodes.id, episodeId));
  return episode ?? null;
}

export type AssetRegistre = Awaited<ReturnType<typeof getAssetsRegistre>>[number];
/** `refId`: the plan_refs row that cites the asset (can be unlinked). */
export type AssetCitation = { planId: number; planUuid: string; position: number; episodeNumero: number; episodeId: number; refId: number };

/** The asset registry of a project, FLAT and sorted by code (an asset is an asset; `deriveDeId` is only a starting image).
 *
 * `statut` and `critique` are COMPUTED here (lib/assets/asset-state.ts), never stored: to produce without a file, in progress with a file,
 * validated when `valide`; critical according to the share of the clips of an episode that cite it.
 *
 * `citations` details EACH ref line that cites the asset, not just the clip numbers — necessary to be able to unlink a
 * specific citation without deleting the others (deleting a cited asset is blocked until it has been unlinked from each clip).
 */
export async function getAssetsRegistre(projectId?: number) {
  const pid = projectId ?? (await getDefaultProjectId());
  const tousLesAssets = await db.select().from(assets).where(and(eq(assets.projectId, pid), horsAffiches)).orderBy(assets.code);
  const toutesLesRefs = await db
    .select({ id: planRefs.id, assetId: planRefs.assetId, planId: planRefs.planId })
    .from(planRefs);
  // Filtered to the same project: a ref to a clip of another project (should
  // never happen, but nothing prevents it at FK level) naturally drops out of the
  // citations computation since its planId will have no entry in planParId.
  const tousLesPlans = await db
    .select({ id: plans.id, uuid: plans.uuid, ordre: plans.ordre, episodeId: plans.episodeId, episodeNumero: episodes.numero })
    .from(plans)
    .innerJoin(episodes, eq(plans.episodeId, episodes.id))
    .where(eq(plans.projectId, pid))
    .orderBy(plans.ordre, plans.id);

  // Real position of each clip in its episode (1-based), and number of clips per episode.
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
    liste.push({ planId: plan.id, planUuid: plan.uuid, position: positionParPlanId.get(plan.id) ?? 0, episodeNumero: plan.episodeNumero, episodeId: plan.episodeId, refId: ref.id });
    citationsParAssetId.set(ref.assetId, liste);
  }

  return tousLesAssets.map((asset) => {
    const citations = (citationsParAssetId.get(asset.id) ?? []).sort((a, b) => a.episodeNumero - b.episodeNumero || a.position - b.position);
    const platesParEpisode = new Map<number, Set<number>>();
    for (const c of citations) platesParEpisode.set(c.episodeId, (platesParEpisode.get(c.episodeId) ?? new Set()).add(c.planId));
    return {
      ...asset,
      citations,
      /** Number of distinct clips that cite the asset. */
      nbPlans: new Set(citations.map((c) => c.planId)).size,
      statut: statutAsset(asset),
      critique: estCritique([...platesParEpisode].map(([episodeId, cites]) => ({ cites: cites.size, total: compteurParEpisode.get(episodeId) ?? 0 }))),
    };
  });
}
