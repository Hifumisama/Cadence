import { db } from "../db";
import { agentConversations, agentRuns, assetGenerations, assets, jobs, planDialogues, plans, projects, propositions, repliques } from "../db/schema";
import { and, eq, gte, isNotNull, isNull, or, inArray } from "drizzle-orm";
import { versRunLot } from "./agents/lots";
import { etatLotPourHeader } from "./agents/lots-pur";
import { ERREUR_ANNULEE } from "./annulation";
import { METHODE_AUDIO, METHODE_REPLIQUE, METHODE_TEST_AUDIO, METHODE_TEST_VIDEO, METHODE_VOIX, estMethodeSon, estMethodeTestVoix, formaterDuree, parametresTestVideo } from "./asset-generation";
import { generationMediaSrc } from "./media";
import { cibleDeCodeAffiche } from "./affiches";
import {
  LIBELLE_SKILL,
  RETENTION_TERMINEES_JOURS,
  cleImage,
  cleLlm,
  cleLot,
  cleVideo,
  ordonnerTaches,
  resumerTaches,
  type ResumeTaches,
  type Tache,
} from "./taches";

/** Toutes les tâches à montrer dans l'indicateur du header : générations
 * d'images, jobs vidéo (lecture seule) et appels LLM, ordonnés comme le worker les
 * prendra (image, puis llm, puis vidéo).
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
    .where(and(isNull(jobs.masqueAt), or(inArray(jobs.statut, ["en_attente", "en_cours"]), isNull(jobs.vuAt), gte(jobs.createdAt, depuis))));

  const lignesLlm = await db
    .select({ r: agentRuns, projetNom: projects.nom, conversationUuid: agentConversations.uuid })
    .from(agentRuns)
    .leftJoin(projects, eq(projects.id, agentRuns.projectId))
    .leftJoin(agentConversations, eq(agentConversations.id, agentRuns.conversationId))
    .where(
      and(
        isNull(agentRuns.masqueAt),
        or(inArray(agentRuns.statut, ["en_attente", "en_cours"]), isNull(agentRuns.vuAt), gte(agentRuns.createdAt, depuis)),
      ),
    );

  // Un LOT (plusieurs tâches d'une même proposition) = UNE entrée dans le panneau : on relit TOUTES
  // les tâches des lots touchés (celles déjà vues ou anciennes ne passent pas le filtre ci-dessus,
  // mais les compter fait « 3/12 »).
  const idsLots = [...new Set(lignesLlm.filter((l) => l.r.cleSousTache != null && l.r.propositionId != null).map((l) => l.r.propositionId!))];
  const runsDesLots = idsLots.length
    ? await db
        .select({ r: agentRuns, projetNom: projects.nom, conversationUuid: agentConversations.uuid })
        .from(agentRuns)
        .leftJoin(projects, eq(projects.id, agentRuns.projectId))
        .leftJoin(agentConversations, eq(agentConversations.id, agentRuns.conversationId))
        .where(and(inArray(agentRuns.propositionId, idsLots), isNotNull(agentRuns.cleSousTache)))
    : [];
  const propositionsLots = idsLots.length ? await db.select({ id: propositions.id, uuid: propositions.uuid, skill: propositions.skill }).from(propositions).where(inArray(propositions.id, idsLots)) : [];
  const uuidDeProposition = new Map(propositionsLots.map((p) => [p.id, p.uuid]));
  const skillDeProposition = new Map(propositionsLots.map((p) => [p.id, p.skill]));

  const iso = (d: Date | null) => (d ? d.toISOString() : null);

  const images: Tache[] = lignesImages.map(({ g, code, projectId }) => {
    // Une affiche de présentation n'est pas dans le registre : sa page à elle (app/p/[id]/affiche/[code]).
    const affiche = cibleDeCodeAffiche(code);
    return {
    cle: cleImage(g.uuid),
    genre: "image",
    statut: g.statut,
    // Un son se reconnaît dans le panneau : « Son · CODE », sans miniature d'aperçu.
    libelle: g.methode === METHODE_TEST_VIDEO ? `Test vidéo · ${code}` : g.methode === METHODE_REPLIQUE ? `Réplique · ${code}` : g.methode === METHODE_TEST_AUDIO ? `Test audio · ${code}` : g.methode === METHODE_VOIX ? `Voix · ${code}` : g.methode === METHODE_AUDIO ? `Son · ${code}` : affiche ? `Affiche · ${affiche.cible === "projects" ? "projet" : affiche.cible === "seasons" ? "saison" : "épisode"}` : code,
    detail:
      g.methode === METHODE_TEST_VIDEO
        ? parametresTestVideo(g.parametres)?.upscale
          ? "Rendu final"
          : "Prévisualisation"
        : g.methode === METHODE_REPLIQUE
          ? "Prise de réplique"
          : g.methode === METHODE_TEST_AUDIO
          ? "Réplique de test"
          : g.methode === METHODE_VOIX
        ? "Voix de référence"
        : g.methode === METHODE_AUDIO
        ? g.dureeSecondes != null
          ? `Génération audio · ${formaterDuree(g.dureeSecondes)}`
          : "Génération audio"
        : g.methode === "edition"
          ? "À partir d'images"
          : "À partir du texte",
    // Une voix se retrouve au casting vocal (étape « Référence »), pas à la fiche d'asset.
    href: g.methode === METHODE_REPLIQUE ? `/p/${projectId}/voix/${code}?etape=repliques` : estMethodeTestVoix(g.methode) ? `/p/${projectId}/voix/${code}?etape=test&generation=${g.uuid}` : g.methode === METHODE_VOIX ? `/p/${projectId}/voix/${code}?etape=reference&generation=${g.uuid}` : affiche ? `/p/${projectId}/affiche/${code}?generation=${g.uuid}` : `/p/${projectId}/assets/${code}?generation=${g.uuid}`,
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
    derriere: null,
    jetons: null,
    annulationDemandee: g.annulationDemandeeAt != null && g.statut === "en_cours",
    };
  });

  // Une prise de réplique : « Réplique · début du texte », et un clic mène au plan qui la cite (sinon à la voix).
  const idsRepliques = [...new Set(lignesImages.flatMap((l) => (l.g.repliqueId != null ? [l.g.repliqueId] : [])))];
  if (idsRepliques.length > 0) {
    const infos = new Map<number, { texte: string; planUuid: string | null; episodeId: number | null }>();
    const lignes = await db
      .select({ id: repliques.id, texte: repliques.texte, planUuid: plans.uuid, episodeId: plans.episodeId })
      .from(repliques)
      .leftJoin(planDialogues, eq(planDialogues.repliqueId, repliques.id))
      .leftJoin(plans, eq(plans.id, planDialogues.planId))
      .where(inArray(repliques.id, idsRepliques));
    for (const l of lignes) if (!infos.get(l.id)?.planUuid) infos.set(l.id, { texte: l.texte, planUuid: l.planUuid, episodeId: l.episodeId });
    for (const [i, t] of images.entries()) {
      const { g, code, projectId } = lignesImages[i]!;
      if (g.repliqueId == null || g.methode !== METHODE_REPLIQUE) continue;
      const info = infos.get(g.repliqueId);
      const extrait = (info?.texte ?? g.texteReference ?? "").replace(/\s+/g, " ").trim();
      t.libelle = `Réplique · ${extrait.length > 40 ? `${extrait.slice(0, 40)}…` : extrait || code}`;
      t.detail = `Prise générée · voix ${code}`;
      t.href = info?.planUuid && info.episodeId != null ? `/p/${projectId}/e/${info.episodeId}/plans/${info.planUuid}` : `/p/${projectId}/voix/${code}`;
    }
  }

  const videos: Tache[] = lignesVideos.map(({ j, planUuid, titre, projectId, episodeId }) => ({
    cle: cleVideo(j.id),
    genre: "video",
    // Une vidéo annulée est `echoue` + « Annulée » en base (pas de valeur d'enum de
    // plus) ; le panneau la montre comme une annulation, pas comme un échec.
    statut: j.statut === "echoue" && j.erreur === ERREUR_ANNULEE ? "annulee" : j.statut,
    libelle: titre,
    // L'étape en cours (génération H3, interpolation, encodage) quand le worker la connaît ; sinon le rejeu éventuel.
    detail: j.statut === "en_cours" && j.etapeLibelle ? `Vidéo · ${j.etapeLibelle}` : j.tentative > 1 ? `Vidéo · rejeu ${j.tentative}` : "Vidéo",
    // F03 : le plan se désigne par son uuid public, jamais par sa position.
    href: `/p/${projectId}/e/${episodeId}/plans/${planUuid}`,
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
    return [
      {
        cle: cleLot(uuid),
        genre: "llm" as const,
        statut: etat.statut,
        libelle: `${LIBELLE_SKILL[skillDeProposition.get(id) ?? "scenarios"] ?? LIBELLE_SKILL.scenarios}${projetNom ? ` · ${projetNom}` : ""}`,
        detail: etat.detail,
        href: projectId ? `/p/${projectId}` : "/",
        conversationUuid: conversationUuid ?? null,
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

  const llm: Tache[] = lignesLlm.filter((l) => !(l.r.cleSousTache != null && l.r.propositionId != null)).map(({ r, projetNom, conversationUuid }) => ({
    cle: cleLlm(r.uuid),
    genre: "llm",
    statut: r.statut,
    libelle: `${LIBELLE_SKILL[r.skill] ?? r.skill}${projetNom ? ` · ${projetNom}` : ""}`,
    detail: "Agent",
    // Une tâche liée à une conversation rouvre la popup d'agent (le panneau du header
    // intercepte le clic, voir IndicateurTaches) ; sans conversation (script llm:tache),
    // elle mène à la page du projet (ou à l'accueil sans projet).
    href: r.projectId != null ? `/p/${r.projectId}` : "/",
    conversationUuid: conversationUuid ?? null,
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
  }));

  const gardees = ordonnerTaches([...images, ...videos, ...llm, ...lots], maintenant);

  // Disque : seulement pour les tâches d'images gardées.
  const parCle = new Map(lignesImages.map((l) => [cleImage(l.g.uuid), l.g]));
  const taches = gardees.map((x) => {
    const g = parCle.get(x.cle);
    if (!g) return x;
    if (estMethodeSon(g.methode) || g.methode === METHODE_TEST_VIDEO) return x; // un son, une voix ou une vidéo n'a ni vignette ni aperçu
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

/** Les assets d'un projet qui ont déjà une génération en attente ou en cours (un lot ne les double pas). */
export async function assetsEnFile(projectId: number): Promise<Set<number>> {
  const lignes = await db
    .select({ assetId: assetGenerations.assetId })
    .from(assetGenerations)
    .innerJoin(assets, eq(assets.id, assetGenerations.assetId))
    .where(and(eq(assets.projectId, projectId), inArray(assetGenerations.statut, ["en_attente", "en_cours"])));
  return new Set(lignes.map((l) => l.assetId));
}
