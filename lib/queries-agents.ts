/**
 * LECTURES DU SYSTÈME D'AGENTS — ce que l'interface (popup) sonde. Côté serveur seulement
 * (accès base). Écritures : app/agents/actions.ts. Types : lib/agents/types.ts.
 *
 * Sondage : l'UI relit `lireConversation` / `lireProposition` tant que `tache` est en
 * `en_attente` / `en_cours` (même rythme que le panneau du header : 3 s). Un résultat
 * `null` = introuvable (écrasée, supprimée).
 *
 * Exemples :
 *   const conv = await trouverConversation(projectId, "episode", { id: episodeId });
 *   //   → conversation en cours à reprendre (indicateur « conversation reprise »), ou null
 *   const prop = conv?.propositionUuid ? await lireProposition(conv.propositionUuid) : null;
 *   //   → prop.groupes[i].changements[j] : libellé, avant/après, avertissements, coche, bloque…
 *   const ctx = await apercuContexte(projectId, "plan", { uuid });   // la ligne « contexte utilisé »
 *   const est = await estimerGeneration(conv.uuid);                  // « ~80 s, local : gratuit »
 */

import { and, asc, count, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "../db";
import { agentConversations, agentRuns, assetGenerations, assets, briefs, episodes, plans, propositionChangements, propositions } from "../db/schema";
import { briefVide, construireSections } from "./agents/brief";
import { MAX_VIGNETTES_ITERATION, diagnosticIteration } from "./agents/iteration-plan";
import { compter, ecrasementsAConfirmer, estBloque, grouper } from "./agents/cochage";
import { apercuContexteDe } from "./agents/contexte";
import { planifierInsertion } from "./agents/rangs";
import { vueLot } from "./agents/lots";
import { episodeIdDeGroupe } from "./agents/lots-pur";
import { etatTache, positionsFile } from "./agents/runs";
import { conversationParUuid, libelleCible, rafraichirStatut, resoudreCible, propositionParUuid } from "./agents/service";
import type {
  Avertissement,
  BriefContenu,
  CibleDemandee,
  CibleType,
  ContexteUtilise,
  EstimationGeneration,
  MessageConversation,
  Operation,
  Portee,
  Position,
  RangDeplace,
  ResumeProposition,
  StatutChamp,
  StatutProposition,
  VueBrief,
  VueChangement,
  VueConversation,
  VueGroupe,
  VueProposition,
} from "./agents/types";
import { configLlm, modelePourSkill } from "./llm/config";
import { chargerSkill } from "./llm/skills";
import { variantePromptAsset } from "./llm/variantes";

// --- conversation -----------------------------------------------------------

/** La cible dans la forme que `ouvrirConversation` attend (uuid d'un plan, code d'un asset). */
async function cibleDemandee(portee: Portee, cibleId: number | null): Promise<CibleDemandee | null> {
  if (portee === "projet" || cibleId == null) return null;
  if (portee === "plan") {
    const [p] = await db.select({ uuid: plans.uuid }).from(plans).where(eq(plans.id, cibleId));
    return p ? { uuid: p.uuid } : { id: cibleId };
  }
  if (portee === "asset") {
    const [a] = await db.select({ code: assets.code }).from(assets).where(eq(assets.id, cibleId));
    return a ? { code: a.code } : { id: cibleId };
  }
  return { id: cibleId };
}

async function versVueConversation(c: typeof agentConversations.$inferSelect): Promise<VueConversation> {
  const [run] = await db
    .select({ id: agentRuns.id })
    .from(agentRuns)
    .where(and(eq(agentRuns.conversationId, c.id), inArray(agentRuns.but, ["tour", "brief"])))
    .orderBy(desc(agentRuns.id))
    .limit(1);
  let propositionUuid: string | null = null;
  if (c.propositionId != null) {
    const [p] = await db.select({ uuid: propositions.uuid }).from(propositions).where(eq(propositions.id, c.propositionId));
    propositionUuid = p?.uuid ?? null;
  }
  return {
    uuid: c.uuid,
    projectId: c.projectId,
    portee: c.portee as Portee,
    cibleId: c.cibleId,
    cible: await cibleDemandee(c.portee as Portee, c.cibleId),
    cibleLibelle: await libelleCible(c.projectId, c.portee as Portee, c.cibleId),
    profondeur: c.profondeur as VueConversation["profondeur"],
    etape: c.etape as VueConversation["etape"],
    messages: ((c.messages as MessageConversation[]) ?? []).map((m) => ({ role: m.role, content: m.content, at: m.at })),
    consigne: c.consigne,
    briefPret: c.briefPret,
    resteADefinir: ((c.resteADefinir as unknown[]) ?? []).filter((x): x is string => typeof x === "string"),
    propositionUuid,
    tache: await etatTache(run?.id ?? null),
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  };
}

/** La conversation du (projet, portée, cible), sans la créer ; null si aucune. */
export async function trouverConversation(projectId: number, portee: Portee, cible: CibleDemandee | null): Promise<VueConversation | null> {
  const r = await resoudreCible(projectId, portee, cible);
  if ("erreur" in r) return null;
  const [c] = await db
    .select()
    .from(agentConversations)
    .where(
      and(
        eq(agentConversations.projectId, projectId),
        eq(agentConversations.portee, portee),
        r.cibleId == null ? sql`${agentConversations.cibleId} is null` : eq(agentConversations.cibleId, r.cibleId),
      ),
    );
  return c ? versVueConversation(c) : null;
}

export async function lireConversation(conversationUuid: string): Promise<VueConversation | null> {
  const c = await conversationParUuid(conversationUuid);
  return c ? versVueConversation(c) : null;
}

// --- brief ------------------------------------------------------------------

/** Le brief du projet (brouillon ou valide), ou null s'il n'y en a pas. */
export async function lireBrief(projectId: number): Promise<VueBrief | null> {
  const [b] = await db.select().from(briefs).where(eq(briefs.projectId, projectId));
  if (!b) return null;
  const contenu = b.contenu as BriefContenu;
  const statuts = b.statuts as Record<string, StatutChamp>;
  return {
    projectId,
    statut: b.statut as VueBrief["statut"],
    source: b.source as VueBrief["source"],
    version: b.version,
    contenu,
    sections: construireSections(contenu, statuts, b.statut as VueBrief["statut"]),
    updatedAt: b.updatedAt.toISOString(),
  };
}

/** Comme `lireBrief`, mais un projet SANS brief renvoie un brief partiel VIDE exploitable (style et
 * notes éditables) — rien n'est écrit en base avant la première édition. */
export async function lireBriefOuVide(projectId: number, titreProjet: string): Promise<VueBrief> {
  const existant = await lireBrief(projectId);
  if (existant) return existant;
  const contenu = briefVide(titreProjet);
  return {
    projectId,
    statut: "partiel",
    source: "reconstitue",
    version: 0,
    contenu,
    sections: construireSections(contenu, {}, "partiel"),
    updatedAt: new Date(0).toISOString(),
  };
}

// --- proposition ------------------------------------------------------------

type PlansEpisode = { uuid: string; titre: string }[];

async function rangsDeplacesDe(
  operation: string,
  cibleType: string,
  position: Position | null,
  apres: unknown,
  plansDe: (episodeId: number) => Promise<PlansEpisode>,
): Promise<RangDeplace[]> {
  if (cibleType !== "plan" || operation !== "creer" || !position) return [];
  // Ajouter à la fin ne déplace aucun rang : pas de lecture (un lot en crée des dizaines, et la
  // popup relit tout toutes les 3 s).
  if ("fin" in position) return [];
  const episodeId = (apres as { episodeId?: unknown } | null)?.episodeId;
  if (typeof episodeId !== "number") return [];
  return planifierInsertion(await plansDe(episodeId), position)?.deplaces ?? [];
}

/** Un lot range ses changements par épisode (groupe `ep-<id>`) : le titre du groupe est celui de
 * l'épisode tel qu'il est AUJOURD'HUI. */
async function titrerGroupesEpisodes(groupes: VueGroupe[]): Promise<VueGroupe[]> {
  const ids = groupes.map((g) => episodeIdDeGroupe(g.id)).filter((x): x is number => x != null);
  if (ids.length === 0) return groupes;
  const lignes = await db.select({ id: episodes.id, numero: episodes.numero, titre: episodes.titre }).from(episodes).where(inArray(episodes.id, ids));
  const parId = new Map(lignes.map((e) => [e.id, `Épisode ${e.numero} · ${e.titre}`]));
  return groupes.map((g) => {
    const id = episodeIdDeGroupe(g.id);
    return id != null ? { ...g, titre: parId.get(id) ?? `Épisode ${id}` } : g;
  });
}

async function versVueProposition(brute: typeof propositions.$inferSelect): Promise<VueProposition> {
  const p = await rafraichirStatut(brute);
  const lignes = await db
    .select()
    .from(propositionChangements)
    .where(eq(propositionChangements.propositionId, p.id))
    .orderBy(asc(propositionChangements.ordre));

  const cachePlans = new Map<number, Promise<PlansEpisode>>();
  const plansDe = (episodeId: number): Promise<PlansEpisode> => {
    let p = cachePlans.get(episodeId);
    if (!p) {
      p = db.select({ uuid: plans.uuid, titre: plans.titre }).from(plans).where(eq(plans.episodeId, episodeId)).orderBy(asc(plans.ordre), asc(plans.id));
      cachePlans.set(episodeId, p);
    }
    return p;
  };

  const changements: VueChangement[] = [];
  for (const l of lignes) {
    const avertissements = (l.avertissements ?? []) as Avertissement[];
    const position = (l.position ?? null) as Position | null;
    changements.push({
      id: l.id,
      ordre: l.ordre,
      sousGroupe: l.sousGroupe,
      groupe: l.groupe,
      cle: l.cle,
      cibleType: l.cibleType as CibleType,
      cibleRef: l.cibleRef,
      libelle: l.libelle,
      operation: l.operation as Operation,
      avant: l.avant,
      apres: l.apres,
      position,
      rangsDeplaces: await rangsDeplacesDe(l.operation, l.cibleType, position, l.apres, plansDe),
      avertissements,
      ecrase: l.ecrase,
      coche: l.coche,
      bloque: estBloque(avertissements),
      refuseRaison: l.refuseRaison,
      appliqueAt: l.appliqueAt?.toISOString() ?? null,
    });
  }

  let conversationUuid: string | null = null;
  if (p.conversationId != null) {
    const [c] = await db.select({ uuid: agentConversations.uuid }).from(agentConversations).where(eq(agentConversations.id, p.conversationId));
    conversationUuid = c?.uuid ?? null;
  }
  // Correction après visionnage : le diagnostic vit dans le résultat de la tâche (il existe même sans écriture).
  let diagnostic: VueProposition["diagnostic"] = null;
  if (p.skill === "iteration-plan" && p.runId != null) {
    const [run] = await db.select({ resultat: agentRuns.resultat }).from(agentRuns).where(eq(agentRuns.id, p.runId));
    diagnostic = diagnosticIteration(run?.resultat ?? null);
  }
  let parentUuid: string | null = null;
  if (p.parentId != null) {
    const [par] = await db.select({ uuid: propositions.uuid }).from(propositions).where(eq(propositions.id, p.parentId));
    parentUuid = par?.uuid ?? null;
  }

  return {
    uuid: p.uuid,
    conversationUuid,
    statut: p.statut as StatutProposition,
    skill: p.skill,
    portee: p.portee as Portee,
    cibleId: p.cibleId,
    consigne: p.consigne,
    retour: p.retour,
    parentUuid,
    resume: p.resume,
    contexte: (p.contexte ?? []) as ContexteUtilise[],
    erreur: p.erreur,
    groupes: await titrerGroupesEpisodes(grouper(changements)),
    compteurs: compter(changements),
    ecrasements: ecrasementsAConfirmer(changements),
    tache: p.statut === "en_generation" && !p.lot ? await etatTache(p.runId) : null,
    lot: p.lot ? await vueLot(p.id, await positionsFile()) : null,
    diagnostic,
    createdAt: p.createdAt.toISOString(),
    appliedAt: p.appliedAt?.toISOString() ?? null,
  };
}

/** Une proposition avec ses changements groupés, ses compteurs (sélectionnés / écartés /
 * bloqués / refusés), ses écrasements à confirmer, son « contexte utilisé » et l'état de sa
 * tâche de génération. */
export async function lireProposition(propositionUuid: string): Promise<VueProposition | null> {
  const p = await propositionParUuid(propositionUuid);
  return p ? versVueProposition(p) : null;
}

/** La proposition courante d'une conversation (la dernière non rejetée), ou null. */
export async function lirePropositionCourante(conversationUuid: string): Promise<VueProposition | null> {
  const c = await conversationParUuid(conversationUuid);
  if (!c?.propositionId) return null;
  const [p] = await db.select().from(propositions).where(eq(propositions.id, c.propositionId));
  return p ? versVueProposition(p) : null;
}

// --- contexte, estimation, historique ----------------------------------------

/** Ce que l'agent lira automatiquement pour cette portée (avant même de lancer) : brief,
 * épisode, plans voisins, registre… */
export async function apercuContexte(projectId: number, portee: Portee, cible: CibleDemandee | null): Promise<ContexteUtilise[]> {
  const r = await resoudreCible(projectId, portee, cible);
  if ("erreur" in r) return [];
  return apercuContexteDe(db, projectId, portee, r.cibleId);
}

const SORTIE_ESTIMEE: Record<string, number> = { "brief-projet": 2500, "scenario-episode": 1800, "prompt-asset": 500, "prompt-voix": 400, "conversation-agent": 600, "plan-h3": 2500, "iteration-plan": 900 };

/** Estimation avant lancement : fournisseur, modèle, coût (null en local), durée, tâches
 * devant dans la file. Ordres de grandeur (≈ 30 jetons/s en sortie sur le serveur local,
 * ≈ 800 jetons/s en lecture du prompt) : à affiner avec les traces. */
export async function estimerGeneration(conversationUuid: string): Promise<EstimationGeneration | null> {
  const c = await conversationParUuid(conversationUuid);
  if (!c) return null;
  let skill: string | null = null;
  let variante: string | undefined;
  if (c.profondeur === "complete") skill = c.etape === "conversation" ? (c.briefPret ? "brief-projet" : "conversation-agent") : null;
  else if (c.portee === "asset") skill = "prompt-asset";
  else if (c.portee === "episode" || c.portee === "plan") skill = "scenario-episode";
  if (skill === "prompt-asset" && c.cibleId != null) {
    const [a] = await db.select({ type: assets.type, methodeGeneration: assets.methodeGeneration }).from(assets).where(eq(assets.id, c.cibleId));
    if (a) variante = variantePromptAsset(a);
  }
  const conf = configLlm();
  const [{ n: images } = { n: 0 }] = await db.select({ n: count() }).from(assetGenerations).where(inArray(assetGenerations.statut, ["en_attente", "en_cours"]));
  const [{ n: appels } = { n: 0 }] = await db.select({ n: count() }).from(agentRuns).where(inArray(agentRuns.statut, ["en_attente", "en_cours"]));
  const tachesDevant = images + appels;
  if (!skill) {
    return { fournisseur: conf.fournisseur, modele: conf.modeleParDefaut, coutEstimeUsd: null, jetonsEntreeEstimes: 0, dureeEstimeeSecondes: 1, tachesDevant: 0, skill: null };
  }
  const entree = chargerSkill(skill, undefined, { variante }).jetonsEstimes + 600 + Math.ceil(JSON.stringify(c.messages ?? []).length / 3.5);
  const sortie = SORTIE_ESTIMEE[skill] ?? 1000;
  return {
    fournisseur: conf.fournisseur,
    modele: modelePourSkill(skill),
    coutEstimeUsd: null,
    jetonsEntreeEstimes: entree,
    dureeEstimeeSecondes: Math.round(entree / 800 + sortie / 30),
    tachesDevant,
    skill,
  };
}

/** Estimation avant de lancer « écrire les scénarios » pour ces épisodes : un appel par épisode,
 * l'un après l'autre. Ordres de grandeur (comme `estimerGeneration`), à affiner avec les traces. */
export async function estimerScenarios(episodeIds: number[]): Promise<EstimationGeneration> {
  const conf = configLlm();
  const n = Math.max(1, episodeIds.length);
  const entree = chargerSkill("scenario-episode").jetonsEstimes + 900;
  const sortie = SORTIE_ESTIMEE["scenario-episode"] ?? 1800;
  const [{ n: images } = { n: 0 }] = await db.select({ n: count() }).from(assetGenerations).where(inArray(assetGenerations.statut, ["en_attente", "en_cours"]));
  const [{ n: appels } = { n: 0 }] = await db.select({ n: count() }).from(agentRuns).where(inArray(agentRuns.statut, ["en_attente", "en_cours"]));
  return {
    fournisseur: conf.fournisseur,
    modele: modelePourSkill("scenario-episode"),
    coutEstimeUsd: null,
    jetonsEntreeEstimes: entree * n,
    dureeEstimeeSecondes: Math.round(entree / 800 + sortie / 30) * n,
    tachesDevant: images + appels,
    skill: "scenario-episode",
  };
}

/** Estimation avant de lancer « créer le registre » : un appel `prompt-asset` par asset, l'un après l'autre. */
export async function estimerRegistre(nbAssets: number): Promise<EstimationGeneration> {
  const conf = configLlm();
  const n = Math.max(1, nbAssets);
  const entree = chargerSkill("prompt-asset", undefined, { variante: "generation" }).jetonsEstimes + 700;
  const sortie = SORTIE_ESTIMEE["prompt-asset"] ?? 500;
  const [{ n: images } = { n: 0 }] = await db.select({ n: count() }).from(assetGenerations).where(inArray(assetGenerations.statut, ["en_attente", "en_cours"]));
  const [{ n: appels } = { n: 0 }] = await db.select({ n: count() }).from(agentRuns).where(inArray(agentRuns.statut, ["en_attente", "en_cours"]));
  return {
    fournisseur: conf.fournisseur,
    modele: modelePourSkill("prompt-asset"),
    coutEstimeUsd: null,
    jetonsEntreeEstimes: entree * n,
    dureeEstimeeSecondes: Math.round(entree / 800 + sortie / 30) * n,
    tachesDevant: images + appels,
    skill: "prompt-asset",
  };
}

/** Estimation des fiches de plan : un appel `plan-h3` par plan, l'un après l'autre (≈ 3 500 jetons d'entrée
 * propres au plan en plus du prompt système, mesuré sur le projet 1). */
export async function estimerFiches(nbPlans: number): Promise<EstimationGeneration> {
  const conf = configLlm();
  const n = Math.max(1, nbPlans);
  const entree = chargerSkill("plan-h3").jetonsEstimes + 3500;
  const sortie = SORTIE_ESTIMEE["plan-h3"] ?? 2500;
  const [{ n: images } = { n: 0 }] = await db.select({ n: count() }).from(assetGenerations).where(inArray(assetGenerations.statut, ["en_attente", "en_cours"]));
  const [{ n: appels } = { n: 0 }] = await db.select({ n: count() }).from(agentRuns).where(inArray(agentRuns.statut, ["en_attente", "en_cours"]));
  return {
    fournisseur: conf.fournisseur,
    modele: modelePourSkill("plan-h3"),
    coutEstimeUsd: null,
    jetonsEntreeEstimes: entree * n,
    dureeEstimeeSecondes: Math.round(entree / 800 + sortie / 30) * n,
    tachesDevant: images + appels,
    skill: "plan-h3",
  };
}

/** Estimation d'une correction après visionnage : un appel `iteration-plan` (prompt du plan et contexte ≈ 2 500
 * jetons, plus la planche : ≈ 70 à 280 jetons par vignette de 384 px selon FRICTIONS, on prend le haut, 15 au plus).
 * Ordre de grandeur, à affiner avec `usage.entree` du premier appel réel. */
export async function estimerIteration(): Promise<EstimationGeneration> {
  const conf = configLlm();
  const entree = chargerSkill("iteration-plan").jetonsEstimes + 2500 + 280 * MAX_VIGNETTES_ITERATION;
  const sortie = SORTIE_ESTIMEE["iteration-plan"] ?? 900;
  const [{ n: images } = { n: 0 }] = await db.select({ n: count() }).from(assetGenerations).where(inArray(assetGenerations.statut, ["en_attente", "en_cours"]));
  const [{ n: appels } = { n: 0 }] = await db.select({ n: count() }).from(agentRuns).where(inArray(agentRuns.statut, ["en_attente", "en_cours"]));
  return {
    fournisseur: conf.fournisseur,
    modele: modelePourSkill("iteration-plan"),
    coutEstimeUsd: null,
    jetonsEntreeEstimes: entree,
    dureeEstimeeSecondes: Math.round(entree / 800 + sortie / 30),
    tachesDevant: images + appels,
    skill: "iteration-plan",
  };
}

/** Estimation du lot « casting des voix » : un appel `prompt-voix` par voix. */
export async function estimerVoix(nbVoix: number): Promise<EstimationGeneration> {
  const conf = configLlm();
  const n = Math.max(1, nbVoix);
  const entree = chargerSkill("prompt-voix").jetonsEstimes + 700;
  const sortie = SORTIE_ESTIMEE["prompt-voix"] ?? 400;
  const [{ n: images } = { n: 0 }] = await db.select({ n: count() }).from(assetGenerations).where(inArray(assetGenerations.statut, ["en_attente", "en_cours"]));
  const [{ n: appels } = { n: 0 }] = await db.select({ n: count() }).from(agentRuns).where(inArray(agentRuns.statut, ["en_attente", "en_cours"]));
  return {
    fournisseur: conf.fournisseur,
    modele: modelePourSkill("prompt-voix"),
    coutEstimeUsd: null,
    jetonsEntreeEstimes: entree * n,
    dureeEstimeeSecondes: Math.round(entree / 800 + sortie / 30) * n,
    tachesDevant: images + appels,
    skill: "prompt-voix",
  };
}

/** Historique des propositions d'un projet (pour la page Monitoring ; la popup ne l'affiche pas). */
export async function listerPropositions(projectId: number, limite = 50): Promise<ResumeProposition[]> {
  const lignes = await db.select().from(propositions).where(eq(propositions.projectId, projectId)).orderBy(desc(propositions.createdAt)).limit(limite);
  if (lignes.length === 0) return [];
  const comptes = await db
    .select({
      id: propositionChangements.propositionId,
      total: count(),
      appliques: sql<number>`count(${propositionChangements.appliqueAt})`,
    })
    .from(propositionChangements)
    .where(inArray(propositionChangements.propositionId, lignes.map((l) => l.id)))
    .groupBy(propositionChangements.propositionId);
  const parId = new Map(comptes.map((c) => [c.id, c]));
  return lignes.map((l) => ({
    uuid: l.uuid,
    statut: l.statut as StatutProposition,
    skill: l.skill,
    portee: l.portee as Portee,
    consigne: l.consigne,
    resume: l.resume,
    nbChangements: Number(parId.get(l.id)?.total ?? 0),
    nbAppliques: Number(parId.get(l.id)?.appliques ?? 0),
    createdAt: l.createdAt.toISOString(),
    appliedAt: l.appliedAt?.toISOString() ?? null,
  }));
}

/** Une conversation du projet, pour la liste « autres conversations » de la fenêtre de l'agent : la trace de ce qui a déjà
 * été demandé (une conversation par portée et par cible). */
export type ResumeConversation = {
  uuid: string;
  portee: Portee;
  cibleLibelle: string;
  etape: string;
  nbMessages: number;
  /** Une proposition courante (en génération, à relire ou appliquée). */
  aProposition: boolean;
  misAJour: string;
};

export async function listerConversationsProjet(projectId: number, limite = 30): Promise<ResumeConversation[]> {
  const lignes = await db.select().from(agentConversations).where(eq(agentConversations.projectId, projectId)).orderBy(desc(agentConversations.updatedAt)).limit(limite);
  const sortie: ResumeConversation[] = [];
  for (const c of lignes) {
    sortie.push({
      uuid: c.uuid,
      portee: c.portee as Portee,
      cibleLibelle: await libelleCible(c.projectId, c.portee as Portee, c.cibleId),
      etape: c.etape,
      nbMessages: ((c.messages as unknown[]) ?? []).length,
      aProposition: c.propositionId != null,
      misAJour: c.updatedAt.toISOString(),
    });
  }
  return sortie;
}
