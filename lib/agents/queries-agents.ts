/**
 * READS OF THE AGENT SYSTEM — what the interface (popup) polls. Server side only
 * (database access). Writes: app/agents/actions.ts. Types: lib/agents/types.ts.
 *
 * Polling: the UI re-reads `lireConversation` / `lireProposition` as long as `tache` is
 * `en_attente` / `en_cours` (same rhythm as the header panel: 3 s). A `null` result
 * = not found (overwritten, deleted).
 *
 * Examples:
 *   const conv = await trouverConversation(projectId, "episode", { id: episodeId });
 *   //   → ongoing conversation to resume ("conversation reprise" indicator), or null
 *   const prop = conv?.propositionUuid ? await lireProposition(conv.propositionUuid) : null;
 *   //   → prop.groupes[i].changements[j]: label, before/after, warnings, ticked, blocked…
 *   const ctx = await apercuContexte(projectId, "plan", { uuid });   // the "contexte utilisé" line
 *   const est = await estimerGeneration(conv.uuid);                  // "~80 s, local: free"
 */

import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "../../db";
import { agentConversations, agentRuns, assets, briefs, episodes, plans, propositionChangements, propositions } from "../../db/schema";
import { briefVide, construireSections, sansClesAbandonnees } from "./brief";
import { notesPourAffichage } from "./sheet-display";
import { ficheCourante } from "./sheet-db";
import { diagnosticIteration } from "./iteration-clip";
import { compter, ecrasementsAConfirmer, estBloque, grouper } from "./checking";
import { planifierDeplacement, planifierInsertion, planifierSuppression } from "./ranks";
import { vueLot } from "./batches";
import { episodeIdDeGroupe } from "./batches-pure";
import { etatTache, positionsFile } from "./runs";
import { conversationParUuid, libelleCible, resoudreCible } from "./service-conversation";
import { propositionParUuid, rafraichirStatut } from "./service-proposals";
import type {
  Avertissement,
  BriefContenu,
  CibleDemandee,
  CibleType,
  ContexteUtilise,
  MessageConversation,
  Operation,
  Portee,
  Position,
  RangDeplace,
  StatutChamp,
  StatutProposition,
  VueBrief,
  VueChangement,
  VueConversation,
  VueGroupe,
  VueProposition,
} from "./types";

// --- conversation -----------------------------------------------------------

/** The target in the shape `ouvrirConversation` expects (a clip's uuid, an asset's code). */
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
    messages: ((c.messages as MessageConversation[]) ?? []).map((m) => ({
      role: m.role,
      content: m.content,
      at: m.at,
      ...(m.choix ? { choix: m.choix } : {}),
      ...(m.choisis ? { choisis: m.choisis } : {}),
    })),
    consigne: c.consigne,
    briefPret: c.briefPret,
    resteADefinir: ((c.resteADefinir as unknown[]) ?? []).filter((x): x is string => typeof x === "string"),
    notes: c.portee === "projet" && c.profondeur === "complete" ? notesPourAffichage(await ficheCourante(db, c)) : [],
    propositionUuid,
    tache: await etatTache(run?.id ?? null),
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  };
}

/** The conversation for (project, scope, target), without creating it; null if none. */
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

/** The project's brief (draft or validated), or null if there is none. */
export async function lireBrief(projectId: number): Promise<VueBrief | null> {
  const [b] = await db.select().from(briefs).where(eq(briefs.projectId, projectId));
  if (!b) return null;
  const contenu = sansClesAbandonnees(b.contenu as BriefContenu);
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

/** Like `lireBrief`, but a project WITHOUT a brief returns an empty, usable partial brief (style and
 * notes editable) — nothing is written to the database before the first edit. */
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
  cibleRef: string | null,
  episodeDePlan: (uuid: string) => Promise<number | null>,
): Promise<RangDeplace[]> {
  if (cibleType !== "plan") return [];
  if (operation === "creer") {
    if (!position) return [];
    // Appending at the end moves no rank: no read (a batch creates dozens, and the
    // popup re-reads everything every 3 s).
    if ("fin" in position) return [];
    const episodeId = (apres as { episodeId?: unknown } | null)?.episodeId;
    if (typeof episodeId !== "number") return [];
    return planifierInsertion(await plansDe(episodeId), position)?.deplaces ?? [];
  }
  // Deleting a clip, or moving it (modify with a position): the ranks of the others change too.
  if (!cibleRef || (operation === "modifier" && !position) || (operation !== "modifier" && operation !== "supprimer")) return [];
  const episodeId = await episodeDePlan(cibleRef);
  if (episodeId == null) return [];
  const existants = await plansDe(episodeId);
  if (operation === "supprimer") return planifierSuppression(existants, cibleRef) ?? [];
  return planifierDeplacement(existants, cibleRef, position!)?.deplaces ?? [];
}

/** A batch files its changes by episode (group `ep-<id>`): the group's title is that of
 * the episode as it is TODAY. */
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

  const cacheEpisodes = new Map<string, Promise<number | null>>();
  const episodeDePlan = (uuid: string): Promise<number | null> => {
    let e = cacheEpisodes.get(uuid);
    if (!e) {
      e = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(uuid)
        ? db.select({ episodeId: plans.episodeId }).from(plans).where(eq(plans.uuid, uuid)).then((r) => r[0]?.episodeId ?? null)
        : Promise.resolve(null);
      cacheEpisodes.set(uuid, e);
    }
    return e;
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
      rangsDeplaces: await rangsDeplacesDe(l.operation, l.cibleType, position, l.apres, plansDe, l.cibleRef, episodeDePlan),
      avertissements,
      ecrase: l.ecrase,
      parDefaut: l.parDefaut,
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
  // Correction after viewing: the diagnosis lives in the task's result (it exists even without a write).
  let diagnostic: VueProposition["diagnostic"] = null;
  if (p.skill === "iteration-plan" && p.runId != null) {
    const [run] = await db.select({ resultat: agentRuns.resultat, entree: agentRuns.entree }).from(agentRuns).where(eq(agentRuns.id, p.runId));
    diagnostic = diagnosticIteration(run?.resultat ?? null, run?.entree);
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

/** A proposal with its grouped changes, its counters (selected / dropped /
 * blocked / refused), its overwrites to confirm, its "contexte utilisé" and the state of its
 * generation task. */
export async function lireProposition(propositionUuid: string): Promise<VueProposition | null> {
  const p = await propositionParUuid(propositionUuid);
  return p ? versVueProposition(p) : null;
}


