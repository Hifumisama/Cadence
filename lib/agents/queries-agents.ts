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

import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "../../db";
import { agentConversations, agentRuns, assets, briefs, episodes, plans, propositionChangements, propositions } from "../../db/schema";
import { briefVide, construireSections, sansClesAbandonnees } from "./brief";
import { notesPourAffichage } from "./fiche-affichage";
import { ficheCourante } from "./fiche-db";
import { diagnosticIteration } from "./iteration-plan";
import { compter, ecrasementsAConfirmer, estBloque, grouper } from "./cochage";
import { planifierDeplacement, planifierInsertion, planifierSuppression } from "./rangs";
import { vueLot } from "./lots";
import { episodeIdDeGroupe } from "./lots-pur";
import { etatTache, positionsFile } from "./runs";
import { conversationParUuid, libelleCible, rafraichirStatut, resoudreCible, propositionParUuid } from "./service";
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
  cibleRef: string | null,
  episodeDePlan: (uuid: string) => Promise<number | null>,
): Promise<RangDeplace[]> {
  if (cibleType !== "plan") return [];
  if (operation === "creer") {
    if (!position) return [];
    // Ajouter à la fin ne déplace aucun rang : pas de lecture (un lot en crée des dizaines, et la
    // popup relit tout toutes les 3 s).
    if ("fin" in position) return [];
    const episodeId = (apres as { episodeId?: unknown } | null)?.episodeId;
    if (typeof episodeId !== "number") return [];
    return planifierInsertion(await plansDe(episodeId), position)?.deplaces ?? [];
  }
  // Supprimer un plan, ou le déplacer (modifier avec une position) : les rangs des autres changent aussi.
  if (!cibleRef || (operation === "modifier" && !position) || (operation !== "modifier" && operation !== "supprimer")) return [];
  const episodeId = await episodeDePlan(cibleRef);
  if (episodeId == null) return [];
  const existants = await plansDe(episodeId);
  if (operation === "supprimer") return planifierSuppression(existants, cibleRef) ?? [];
  return planifierDeplacement(existants, cibleRef, position!)?.deplaces ?? [];
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

/** Une proposition avec ses changements groupés, ses compteurs (sélectionnés / écartés /
 * bloqués / refusés), ses écrasements à confirmer, son « contexte utilisé » et l'état de sa
 * tâche de génération. */
export async function lireProposition(propositionUuid: string): Promise<VueProposition | null> {
  const p = await propositionParUuid(propositionUuid);
  return p ? versVueProposition(p) : null;
}


