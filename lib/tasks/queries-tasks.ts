import { db } from "../../db";
import { agentConversations, agentRuns, assetGenerations, assets, creationsProjet, demandes, episodes, jobs, montageExports, plans, projects, propositions } from "../../db/schema";
import { tacheDeDemande } from "./requests-task";
import { tacheDExport } from "../montage/montage-task";
import type { EtapeDemande, StatutDemande } from "./requests";
import type { EtapeCreation, StatutCreation } from "../agents/creation";
import { estDeLaCreation, fenetreDeCreation, tacheDeCreation } from "../agents/creation-task";
import { and, eq, gte, isNotNull, isNull, ne, or, inArray } from "drizzle-orm";
import { versRunLot } from "../agents/batches";
import { etatLotPourHeader } from "../agents/batches-pure";
import { ERREUR_ANNULEE } from "./cancellation";
import { METHODE_MASTER_VOIX } from "../assets/asset-generation";
import { generationMediaSrc } from "../media";
import { cibleDeCodeAffiche } from "../posters/posters";
import {
  LIBELLE_SKILL,
  RETENTION_TERMINEES_JOURS,
  cleImage,
  cleLlm,
  cleLot,
  cleVideo,
  estHorsFileGpu,
  ordonnerTaches,
  resumerTaches,
  type ResumeTaches,
  type Tache,
} from "./tasks";

/** All the tasks to show in the header indicator: image generations,
 * video jobs (read-only) and LLM calls, ordered as the worker will take them (image, then llm, then video).
 * Server side only (disk access for previews and thumbnails). */
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
      and(
        isNull(assetGenerations.masqueAt),
        or(
          inArray(assetGenerations.statut, ["en_attente", "en_cours"]),
          isNull(assetGenerations.vuAt),
          gte(assetGenerations.createdAt, depuis),
        ),
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
    .where(and(isNull(jobs.masqueAt), isNull(jobs.demandeId), or(inArray(jobs.statut, ["en_attente", "en_cours"]), isNull(jobs.vuAt), gte(jobs.createdAt, depuis))));

  const toutesLignesLlm = await db
    .select({ r: agentRuns, projetNom: projects.nom, conversationUuid: agentConversations.uuid, portee: agentConversations.portee, cibleId: agentConversations.cibleId, profondeur: agentConversations.profondeur })
    .from(agentRuns)
    .leftJoin(projects, eq(projects.id, agentRuns.projectId))
    .leftJoin(agentConversations, eq(agentConversations.id, agentRuns.conversationId))
    .where(
      and(
        isNull(agentRuns.masqueAt),
        // A request step (iterate a clip…) does not have its own row: the request's row replaces it.
        isNull(agentRuns.demandeId),
        // A conversation TURN (notes, then the agent's reply) goes through the worker's queue, but it lasts a few seconds
        // and the conversation popup already shows it: it has no place in the panel, the badge or the notifications.
        or(isNull(agentRuns.but), ne(agentRuns.but, "tour")),
        or(inArray(agentRuns.statut, ["en_attente", "en_cours"]), isNull(agentRuns.vuAt), gte(agentRuns.createdAt, depuis)),
      ),
    );

  // The CREATION of a project (the installer) = ONE entry: its agent tasks (those of the project's conversation,
  // during its work window) leave the list and appear on the progress page. The other tasks of the
  // project (poster, images, agent work outside the installer) remain separate lines.
  const creations = await db
    .select({ c: creationsProjet, nom: projects.nom, conversationId: agentConversations.id })
    .from(creationsProjet)
    .innerJoin(projects, eq(projects.id, creationsProjet.projectId))
    .innerJoin(agentConversations, and(eq(agentConversations.projectId, creationsProjet.projectId), eq(agentConversations.portee, "projet"), isNull(agentConversations.cibleId)));
  const fenetres = creations.map((x) => ({ ...x, fenetre: fenetreDeCreation(x.c, x.conversationId) }));
  const deLaCreation = (l: (typeof toutesLignesLlm)[number]) => fenetres.find((f) => f.c.projectId === l.r.projectId && estDeLaCreation({ conversationId: l.r.conversationId, createdAt: l.r.createdAt }, f.fenetre));
  const lignesLlm = toutesLignesLlm.filter((l) => !deLaCreation(l));
  const tachesCreations: Tache[] = fenetres.flatMap((f) => {
    const t = tacheDeCreation({
      projectId: f.c.projectId,
      projetNom: f.nom,
      statut: f.c.statut as StatutCreation,
      erreur: f.c.erreur,
      etapes: (Array.isArray(f.c.etapes) ? f.c.etapes : []) as EtapeCreation[],
      createdAt: f.c.createdAt,
      updatedAt: f.c.updatedAt,
      runs: toutesLignesLlm
        .filter((l) => deLaCreation(l) === f)
        .map((l) => ({ conversationId: l.r.conversationId, createdAt: l.r.createdAt, statut: l.r.statut, vuAt: l.r.vuAt, jetons: l.r.progressionJetons, annulationDemandee: l.r.annulationDemandeeAt != null })),
    });
    return t ? [t] : [];
  });

  // A BATCH (several tasks of the same proposal) = ONE entry in the panel: we re-read ALL
  // the tasks of the batches touched (those already seen or old ones do not pass the filter above,
  // but counting them gives « 3/12 »).
  const idsLots = [...new Set(lignesLlm.filter((l) => l.r.cleSousTache != null && l.r.propositionId != null).map((l) => l.r.propositionId!))];
  const runsDesLots = idsLots.length
    ? await db
        .select({ r: agentRuns, projetNom: projects.nom, conversationUuid: agentConversations.uuid, portee: agentConversations.portee, cibleId: agentConversations.cibleId, profondeur: agentConversations.profondeur })
        .from(agentRuns)
        .leftJoin(projects, eq(projects.id, agentRuns.projectId))
        .leftJoin(agentConversations, eq(agentConversations.id, agentRuns.conversationId))
        .where(and(inArray(agentRuns.propositionId, idsLots), isNotNull(agentRuns.cleSousTache)))
    : [];
  const propositionsLots = idsLots.length ? await db.select({ id: propositions.id, uuid: propositions.uuid, skill: propositions.skill }).from(propositions).where(inArray(propositions.id, idsLots)) : [];
  const uuidDeProposition = new Map(propositionsLots.map((p) => [p.id, p.uuid]));
  const skillDeProposition = new Map(propositionsLots.map((p) => [p.id, p.skill]));

  const iso = (d: Date | null) => (d ? d.toISOString() : null);

  // Where an agent task leads: the page where the work is read, plus the old agent popup (decision 2026-10-12). A clip → its sheet,
  // an episode → its screenplay, an asset → its page. Otherwise (project, season) the project's
  // page, and only then does the popup remain the fallback (`conversationUuid`).
  const cibles = [...lignesLlm, ...runsDesLots].filter((l) => l.cibleId != null);
  const idsPlans = [...new Set(cibles.filter((l) => l.portee === "plan").map((l) => l.cibleId!))];
  const idsAssets = [...new Set(cibles.filter((l) => l.portee === "asset").map((l) => l.cibleId!))];
  const [plansCibles, assetsCibles] = await Promise.all([
    idsPlans.length ? db.select({ id: plans.id, uuid: plans.uuid, episodeId: plans.episodeId }).from(plans).where(inArray(plans.id, idsPlans)) : [],
    idsAssets.length ? db.select({ id: assets.id, code: assets.code, type: assets.type }).from(assets).where(inArray(assets.id, idsAssets)) : [],
  ]);
  const planParId = new Map(plansCibles.map((x) => [x.id, x]));
  const assetParId = new Map(assetsCibles.map((x) => [x.id, x]));
  const pageAgent = (l: { portee: string | null; cibleId: number | null; profondeur: string | null }, projectId: number | null): string | null => {
    if (projectId == null || l.cibleId == null) return null;
    if (l.portee === "plan") {
      const x = planParId.get(l.cibleId);
      return x ? `/p/${projectId}/e/${x.episodeId}/montage/${x.uuid}` : null;
    }
    if (l.portee === "episode") return `/p/${projectId}/e/${l.cibleId}/scenario`;
    if (l.portee === "asset") {
      const x = assetParId.get(l.cibleId);
      return x ? `/p/${projectId}/assets/${x.code}` : null;
    }
    return null;
  };

  const images: Tache[] = lignesImages.map(({ g, code, projectId }) => {
    // A presentation poster is not in the registry: its own page (app/p/[id]/affiche/[code]).
    const affiche = cibleDeCodeAffiche(code);
    return {
    cle: cleImage(g.uuid),
    genre: "image",
    statut: g.statut,
    libelle: g.methode === METHODE_MASTER_VOIX ? `Voix · ${code}` : affiche ? `Affiche · ${affiche.cible === "projects" ? "projet" : "épisode"}` : code,
    detail:
      g.methode === METHODE_MASTER_VOIX
        ? "Master de voix"
        : g.methode === "edition"
          ? "À partir d'images"
          : "À partir du texte",
    // A voice's master is found in the « Voix » block of the character's sheet.
    href: g.methode === METHODE_MASTER_VOIX ? `/p/${projectId}/assets/${code}?generation=${g.uuid}#as-voix` : affiche ? `/p/${projectId}/affiche/${code}?generation=${g.uuid}` : `/p/${projectId}/assets/${code}?generation=${g.uuid}`,
    projectId,
    assetId: g.assetId,
    progression:
      g.statut === "en_cours" && g.progressionValeur != null && g.progressionMax
        ? { valeur: g.progressionValeur, max: g.progressionMax, etape: g.etapeLibelle }
        : null,
    apercuSrc: null, // filled after sorting, so the disk is only touched for the tasks kept
    vignetteSrc: null,
    createdAt: g.createdAt.toISOString(),
    startedAt: iso(g.startedAt),
    finishedAt: iso(g.finishedAt),
    vuAt: iso(g.vuAt),
    erreur: g.erreur,
    positionFile: null,
    derriereVideo: false,
    derriere: null,
    jetons: null,
    annulationDemandee: g.annulationDemandeeAt != null && g.statut === "en_cours",
    };
  });

  const videos: Tache[] = lignesVideos.map(({ j, planUuid, titre, projectId, episodeId }) => ({
    cle: cleVideo(j.id),
    genre: "video",
    // A cancelled video is `echoue` + « Annulée » in the database (no extra enum value);
    // the panel shows it as a cancellation, not as a failure.
    statut: j.statut === "echoue" && j.erreur === ERREUR_ANNULEE ? "annulee" : j.statut,
    libelle: titre,
    // The current step (H3 generation, interpolation, encoding) when the worker knows it; otherwise the possible replay.
    detail: j.statut === "en_cours" && j.etapeLibelle ? `Vidéo · ${j.etapeLibelle}` : j.tentative > 1 ? `Vidéo · rejeu ${j.tentative}` : "Vidéo",
    // F03: the clip is designated by its public uuid, never by its position.
    href: `/p/${projectId}/e/${episodeId}/montage/${planUuid}`,
    projectId,
    assetId: null,
    progression: j.statut === "en_cours" && j.progressionValeur != null && j.progressionMax ? { valeur: j.progressionValeur, max: j.progressionMax, etape: j.etapeLibelle } : null,
    apercuSrc: null,
    vignetteSrc: null,
    createdAt: j.createdAt.toISOString(),
    startedAt: iso(j.startedAt),
    finishedAt: iso(j.finishedAt),
    vuAt: iso(j.vuAt),
    erreur: j.statut === "echoue" && j.erreur === ERREUR_ANNULEE ? null : j.erreur,
    positionFile: null,
    derriereVideo: false,
    derriere: null,
    jetons: null,
    annulationDemandee: j.annulationDemandeeAt != null && j.statut === "en_cours",
  }));

  const lots: Tache[] = idsLots.flatMap((id) => {
    const lignes = runsDesLots.filter((l) => l.r.propositionId === id);
    const etat = etatLotPourHeader(lignes.map((l) => versRunLot(l.r)));
    const uuid = uuidDeProposition.get(id);
    if (!etat || !uuid || lignes.length === 0) return [];
    const { projetNom, conversationUuid } = lignes[0]!;
    const projectId = lignes[0]!.r.projectId ?? 0;
    const page = pageAgent(lignes[0]!, projectId || null);
    return [
      {
        cle: cleLot(uuid),
        genre: "llm" as const,
        statut: etat.statut,
        libelle: `${LIBELLE_SKILL[skillDeProposition.get(id) ?? "scenarios"] ?? LIBELLE_SKILL.scenarios}${projetNom ? ` · ${projetNom}` : ""}`,
        detail: etat.detail,
        href: page ?? (projectId ? `/p/${projectId}` : "/"),
        conversationUuid: page ? null : (conversationUuid ?? null),
        projectId,
        assetId: null,
        progression: etat.progression,
        apercuSrc: null,
        vignetteSrc: null,
        createdAt: etat.createdAt.toISOString(),
        startedAt: iso(etat.startedAt),
        finishedAt: iso(etat.finishedAt),
        vuAt: iso(etat.vuAt),
        erreur: etat.erreur,
        positionFile: null,
        derriereVideo: false,
        derriere: null,
        jetons: etat.jetons,
        annulationDemandee: etat.annulationDemandee,
      },
    ];
  });

  const llm: Tache[] = lignesLlm.filter((l) => !(l.r.cleSousTache != null && l.r.propositionId != null)).map((l) => {
    const { r, projetNom, conversationUuid } = l;
    const page = pageAgent(l, r.projectId);
    return {
    cle: cleLlm(r.uuid),
    genre: "llm",
    statut: r.statut,
    libelle: `${LIBELLE_SKILL[r.skill] ?? r.skill}${projetNom ? ` · ${projetNom}` : ""}`,
    detail: "Agent",
    // A task linked to a conversation reopens the agent popup (the header panel
    // intercepts the click, see IndicateurTaches); without a conversation (script llm:task),
    // it leads to the project page (or to the home page without a project).
    href: page ?? (r.projectId != null ? `/p/${r.projectId}` : "/"),
    conversationUuid: page ? null : (conversationUuid ?? null),
    projectId: r.projectId ?? 0,
    assetId: null,
    progression: null,
    apercuSrc: null,
    vignetteSrc: null,
    createdAt: r.createdAt.toISOString(),
    startedAt: iso(r.startedAt),
    finishedAt: iso(r.finishedAt),
    vuAt: iso(r.vuAt),
    erreur: r.erreur,
    positionFile: null,
    derriereVideo: false,
    derriere: null,
    jetons: r.statut === "en_cours" ? r.progressionJetons : null,
    annulationDemandee: r.annulationDemandeeAt != null && r.statut === "en_cours",
    };
  });

  // The REQUESTS (lib/tasks/requests.ts): ONE entry each; the state of the current step's task (queued, in progress, tokens, render progress)
  // is read on the run or job it posted.
  const lignesDemandes = await db
    .select({ d: demandes, planUuid: plans.uuid, titre: plans.titre, episodeId: plans.episodeId })
    .from(demandes)
    .innerJoin(plans, and(eq(demandes.cibleType, "plan"), eq(plans.id, demandes.cibleId)))
    .where(and(eq(demandes.type, "iteration-plan"), isNull(demandes.masqueAt), or(inArray(demandes.statut, ["en_cours", "en_attente"]), isNull(demandes.vuAt), gte(demandes.createdAt, depuis))));
  const tachesDemandes: Tache[] = await Promise.all(
    lignesDemandes.map(async ({ d, planUuid, titre, episodeId }) => {
      const etapes = (Array.isArray(d.etapes) ? d.etapes : []) as EtapeDemande[];
      const ctx = d.contexte as { runUuid?: string; jobId?: number; consigne?: string; consignes?: string[] };
      const courante = etapes.find((x) => x.statut === "en_cours");
      const rendu = courante?.cle === "rendu";
      const [run] = !rendu && ctx.runUuid ? await db.select().from(agentRuns).where(eq(agentRuns.uuid, ctx.runUuid)) : [];
      const [job] = rendu && ctx.jobId != null ? await db.select().from(jobs).where(eq(jobs.id, ctx.jobId)) : [];
      const feuille = run ?? job ?? null;
      return tacheDeDemande({
        id: d.id,
        projectId: d.projectId,
        libelle: `Itérer · ${titre}`,
        href: `/p/${d.projectId}/e/${episodeId}/montage/${planUuid}`,
        statut: d.statut as StatutDemande,
        erreur: d.erreur,
        etapes,
        createdAt: d.createdAt,
        updatedAt: d.updatedAt,
        finishedAt: d.finishedAt,
        vuAt: d.vuAt,
        tacheEnFile: feuille?.statut === "en_attente",
        tacheEnCours: feuille?.statut === "en_cours",
        tacheCreeeLe: feuille?.createdAt ?? null,
        jetons: run?.statut === "en_cours" ? run.progressionJetons : null,
        annulationDemandee: feuille?.annulationDemandeeAt != null,
        progressionRendu: job && job.statut === "en_cours" && job.progressionValeur != null && job.progressionMax ? { valeur: job.progressionValeur, max: job.progressionMax } : null,
        rendu,
        consignes: ctx.consignes?.length ? ctx.consignes : ctx.consigne ? [ctx.consigne] : undefined,
      });
    }),
  );

  // « Ajouter un plan »: the target is the episode (the clip does not exist yet); the row leads to the scene, then to the clip once added.
  const lignesAjouts = await db
    .select({ d: demandes })
    .from(demandes)
    .where(and(inArray(demandes.type, ["ajout-plan", "ajout-scene", "fiche-plan"]), isNull(demandes.masqueAt), or(eq(demandes.statut, "en_cours"), isNull(demandes.vuAt), gte(demandes.createdAt, depuis))));
  const tachesAjouts: Tache[] = await Promise.all(
    lignesAjouts.map(async ({ d }) => {
      const etapes = (Array.isArray(d.etapes) ? d.etapes : []) as EtapeDemande[];
      const ctx = d.contexte as { runUuid?: string; scene?: string; sceneId?: number | null; planUuid?: string; titre?: string; apres?: string };
      const [run] = ctx.runUuid ? await db.select().from(agentRuns).where(eq(agentRuns.uuid, ctx.runUuid)) : [];
      const estScene = d.type === "ajout-scene";
      const estFiche = d.type === "fiche-plan";
      // The target of a sheet is the clip (that of the other additions is the episode): we find its episode to lead to its page.
      const [planFiche] = estFiche ? await db.select({ episodeId: plans.episodeId }).from(plans).where(eq(plans.id, d.cibleId)) : [];
      const base = `/p/${d.projectId}/e/${estFiche ? (planFiche?.episodeId ?? 0) : d.cibleId}`;
      return tacheDeDemande({
        id: d.id,
        projectId: d.projectId,
        libelle: estFiche ? `Fiche · ${ctx.titre ?? "plan"}` : estScene ? `Nouvelle scène · ${ctx.apres ?? "scénario"}` : `Nouveau plan · ${ctx.scene ?? "scénario"}`,
        href: estFiche
          ? `${base}/montage/${ctx.planUuid ?? ""}`
          : estScene
            ? `${base}/tournage${ctx.sceneId != null ? `?scene=${ctx.sceneId}` : ""}`
            : ctx.planUuid ? `${base}/montage/${ctx.planUuid}` : `${base}/tournage${ctx.sceneId != null ? `?scene=${ctx.sceneId}` : "?scene=sans"}`,
        statut: d.statut as StatutDemande,
        erreur: d.erreur,
        etapes,
        createdAt: d.createdAt,
        updatedAt: d.updatedAt,
        finishedAt: d.finishedAt,
        vuAt: d.vuAt,
        tacheEnFile: run?.statut === "en_attente",
        tacheEnCours: run?.statut === "en_cours",
        tacheCreeeLe: run?.createdAt ?? null,
        jetons: run?.statut === "en_cours" ? run.progressionJetons : null,
        annulationDemandee: run?.annulationDemandeeAt != null,
        progressionRendu: null,
        rendu: false,
        detailFin: estFiche
          ? { termine: "Fiche écrite", echoue: "Écriture d'une fiche" }
          : estScene
            ? { termine: ctx.titre ? `Scène ajoutée · ${ctx.titre}` : "Scène ajoutée", echoue: "Ajout d'une scène" }
            : { termine: ctx.titre ? `Plan ajouté · ${ctx.titre}` : "Plan ajouté", echoue: "Ajout d'un plan" },
      });
    }),
  );

  // The episode's EXPORTS (Montage page): outside the GPU, but tracked here like the others (key `montage:<id>`, lib/montage/montage-task.ts).
  const lignesExports = await db
    .select({ x: montageExports, projectId: episodes.projectId, projetNom: projects.nom })
    .from(montageExports)
    .innerJoin(episodes, eq(episodes.id, montageExports.episodeId))
    .leftJoin(projects, eq(projects.id, episodes.projectId))
    .where(and(isNull(montageExports.masqueAt), or(inArray(montageExports.statut, ["en_attente", "en_cours"]), isNull(montageExports.vuAt), gte(montageExports.createdAt, depuis))));
  const exportsMontage: Tache[] = lignesExports.map(({ x, projectId, projetNom }) => tacheDExport({ ...x, projectId, projetNom }));

  const gardees = ordonnerTaches([...images, ...videos, ...llm, ...lots, ...tachesCreations, ...tachesDemandes, ...tachesAjouts, ...exportsMontage], maintenant);

  // Disk: only for the kept image tasks.
  const parCle = new Map(lignesImages.map((l) => [cleImage(l.g.uuid), l.g]));
  const taches = gardees.map((x) => {
    const g = parCle.get(x.cle);
    if (!g) return x;
    if (g.methode === METHODE_MASTER_VOIX) return x; // a voice (and its test video) has neither thumbnail nor preview
    if (g.statut === "termine") return { ...x, vignetteSrc: generationMediaSrc(g.assetId, g.fichier) };
    if (g.statut === "en_cours" && g.apercuAt) {
      const url = generationMediaSrc(g.assetId, g.apercuFichier);
      return { ...x, apercuSrc: url ? `${url}?v=${g.apercuAt.getTime()}` : null };
    }
    return x;
  });

  return { taches, resume: resumerTaches(taches) };
}

/** Rank of an image generation just launched: 1 = it leaves at once; n = n-1 tasks go ahead (the task in progress, whatever it is,
 * and the images that arrived before it). */
export async function rangDansLaFile(generationId: number): Promise<number> {
  const { taches } = await listerTaches();
  const devant = taches.filter((x) => x.statut === "en_cours" && !estHorsFileGpu(x)).length;
  const [g] = await db.select({ uuid: assetGenerations.uuid }).from(assetGenerations).where(eq(assetGenerations.id, generationId));
  const moi = g ? taches.find((x) => x.cle === cleImage(g.uuid)) : null;
  if (!moi) return devant + 1;
  if (moi.statut === "en_cours") return 1;
  return devant + (moi.positionFile ?? 1);
}

/** Number of images waiting (not in progress): used for the queue cap. */
export async function nbImagesEnAttente(): Promise<number> {
  const lignes = await db.select({ id: assetGenerations.id }).from(assetGenerations).where(eq(assetGenerations.statut, "en_attente"));
  return lignes.length;
}

/** The assets of a project that already have a generation pending or in progress (a batch does not double them). */
export async function assetsEnFile(projectId: number): Promise<Set<number>> {
  const lignes = await db
    .select({ assetId: assetGenerations.assetId })
    .from(assetGenerations)
    .innerJoin(assets, eq(assets.id, assetGenerations.assetId))
    .where(and(eq(assets.projectId, projectId), inArray(assetGenerations.statut, ["en_attente", "en_cours"])));
  return new Set(lignes.map((l) => l.assetId));
}
