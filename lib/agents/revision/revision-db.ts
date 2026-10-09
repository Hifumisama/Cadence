import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm";
import { db } from "../../../db";
import { agentConversations, agentRuns, jobs, plans, propositionChangements, propositions, revisionDecisions } from "../../../db/schema";
import { demanderAnnulation } from "../../annulation-db";
import type { Tx } from "../../ordre-plans";
import { estBloque } from "../cochage";
import { appliquerProposition, enregistrerChangements, enrichirChangements, type ChangementEnrichi } from "../proposition-db";
import { creerRun, etatTache, tacheActive } from "../runs";
import type { Avertissement, EcrasementAConfirmer, EtatTache, MessageConversation, Position } from "../types";
import { chiffresPiste, idCourt, interpreterAnalyse, statutDeDecision, type DecisionEtat, type SortieAnalyse } from "./analyse";
import { scenesTouchees, type SceneTouchee } from "./affichage";
import { appliquerAuBrouillon, gainSecondes } from "./brouillon";
import { conflitsEntreDecisions, constatDuree, recoupementsEntreDecisions, type ConflitDecisions } from "./constats";
import { construireFaits, type FaitsTour } from "./faits";
import { fmtDuree } from "./format";
import { operationsVersChangements } from "./operations-vers-changements";
import { assemblerConstats } from "./tour-pur";
import type { Constat, Operation, Piste, StatutDecision } from "./types";
import { lireVueEpisode, planParUuid, repliqueParUuid, type VueEpisode } from "./vue-episode";

/** Le côté base de la révision d'un épisode (docs/FRICTIONS.md 2026-10-09) : ouvrir la conversation, ranger ce que l'analyse du
 * réalisateur décide, recalculer les constats, appliquer le chantier. Les décisions (`revision_decisions`) sont le BROUILLON : elles
 * ne touchent aucune table métier ; à l'application elles deviennent UNE proposition, appliquée par `appliquerProposition`
 * (verrou de portée, transaction unique, confirmation d'écrasement, applicateurs). */

type DbOuTx = typeof db | Tx;
type ConversationRow = typeof agentConversations.$inferSelect;
type DecisionRow = typeof revisionDecisions.$inferSelect;
type Resultat<T = object> = ({ ok: true } & T) | { ok: false; erreur: string };
const ERR = (erreur: string): { ok: false; erreur: string } => ({ ok: false, erreur });

// --- vues --------------------------------------------------------------------

export type ChangementDecision = {
  libelle: string;
  operation: string;
  cibleType: string;
  avant: unknown;
  apres: unknown;
  position: Position | null;
  ecrase: string | null;
  refuseRaison: string | null;
  avertissements: Avertissement[];
};

export type VueDecisionRevision = {
  /** L'identifiant COURT que le modèle et l'utilisateur voient (« D3 »). */
  id: string;
  uuid: string;
  ordre: number;
  titre: string;
  raison: string;
  statut: StatutDecision;
  gainSecondes: number;
  aReverifier: boolean;
  constats: Constat[];
  operations: Operation[];
  changements: ChangementDecision[];
  /** Combien d'éléments validés (rendu réussi, prise validée) cette décision écrase à l'application. */
  ecrasements: number;
  /** Les plans que cette décision supprime et dont un rendu est en file ou en cours : l'écran propose de l'annuler. */
  rendusActifs: { planUuid: string; handle: string }[];
};

export type VuePisteRevision = { numero: number; titre: string; resume: string; gainSecondes: number; dureeApres: number };

export type EtatRevision = {
  conversationUuid: string;
  projectId: number;
  episodeId: number;
  ouverte: boolean;
  messages: MessageConversation[];
  decisions: VueDecisionRevision[];
  appliquees: { id: string; titre: string; gainSecondes: number }[];
  pistes: VuePisteRevision[];
  /** Le scénario avec le brouillon, seulement les scènes touchées (voir `scenesTouchees`). */
  scenes: SceneTouchee[];
  duree: { actuelle: number; avecBrouillon: number; objectif: number | null; constat: Constat };
  conflits: ConflitDecisions[];
};

const estActive = (r: DecisionRow) => r.statut !== "appliquee";
const nonAppliquee = () => inArray(revisionDecisions.statut, ["discussion", "retenue", "attention", "conflit"]);
const maintenant = () => new Date().toISOString();

function versVueDecision(r: DecisionRow): VueDecisionRevision {
  return {
    id: idCourt(r.ordre),
    uuid: r.uuid,
    ordre: r.ordre,
    titre: r.titre,
    raison: r.raison,
    statut: r.statut as StatutDecision,
    gainSecondes: r.gainSecondes,
    aReverifier: r.aReverifier,
    constats: (r.constats as Constat[]) ?? [],
    operations: (r.operations as Operation[]) ?? [],
    changements: ((r.changements as ChangementEnrichi[]) ?? []).map((c) => ({
      libelle: c.libelle,
      operation: c.operation,
      cibleType: c.cibleType,
      avant: c.avant ?? null,
      apres: c.apres ?? null,
      position: (c.position ?? null) as Position | null,
      ecrase: c.ecrase ?? null,
      refuseRaison: c.refuseRaison ?? null,
      avertissements: (c.avertissements ?? []) as Avertissement[],
    })),
    ecrasements: ((r.changements as ChangementEnrichi[]) ?? []).filter((c) => !!c.ecrase && !c.refuseRaison).length,
    rendusActifs: [],
  };
}

export function messageOuverture(vue: VueEpisode): string {
  const total = vue.plans.reduce((a, p) => a + p.duree, 0);
  const scenes = new Set(vue.plans.map((p) => p.sceneId ?? 0)).size;
  const objectif = vue.objectifSecondes != null ? ` pour ${fmtDuree(vue.objectifSecondes)} visées` : "";
  return (
    `Bonjour. J'ai relu l'épisode : ${vue.plans.length} plan${vue.plans.length > 1 ? "s" : ""}, ${fmtDuree(total)}${objectif}, répartis sur ${scenes} scène${scenes > 1 ? "s" : ""}. ` +
    `Dis-moi ce qui ne va pas ou ce que tu veux changer : un ressenti, une demande précise, ou les deux. ` +
    `Je te dirai ce que j'en pense avant de toucher à quoi que ce soit.`
  );
}

// --- conversation --------------------------------------------------------------

export async function conversationRevisionParUuid(d: DbOuTx, uuid: string): Promise<ConversationRow | null> {
  if (!/^[0-9a-f-]{36}$/i.test(uuid)) return null;
  const [c] = await d.select().from(agentConversations).where(and(eq(agentConversations.uuid, uuid), eq(agentConversations.profondeur, "revision")));
  return c ?? null;
}

/** La révision OUVERTE de l'épisode, ou une neuve (message d'ouverture écrit en code, comme à l'ouverture d'un entretien). */
export async function ouvrirRevision(projectId: number, episodeId: number): Promise<Resultat<{ conversationUuid: string; reprise: boolean }>> {
  const cherche = async () => {
    const [c] = await db
      .select({ uuid: agentConversations.uuid })
      .from(agentConversations)
      .where(
        and(
          eq(agentConversations.projectId, projectId),
          eq(agentConversations.portee, "episode"),
          eq(agentConversations.cibleId, episodeId),
          eq(agentConversations.profondeur, "revision"),
          isNull(agentConversations.fermeeAt),
        ),
      );
    return c ?? null;
  };
  const existante = await cherche();
  if (existante) return { ok: true, conversationUuid: existante.uuid, reprise: true };
  const vue = await lireVueEpisode(db, projectId, episodeId);
  if (!vue) return ERR("Épisode introuvable dans ce projet.");
  const [cree] = await db
    .insert(agentConversations)
    .values({
      projectId,
      portee: "episode",
      cibleId: episodeId,
      profondeur: "revision",
      etape: "conversation",
      messages: [{ role: "assistant", content: messageOuverture(vue), at: maintenant() }],
    })
    .onConflictDoNothing()
    .returning({ uuid: agentConversations.uuid });
  if (cree) return { ok: true, conversationUuid: cree.uuid, reprise: false };
  const apres = await cherche();
  return apres ? { ok: true, conversationUuid: apres.uuid, reprise: true } : ERR("Révision non créée.");
}

export async function ajouterMessage(d: DbOuTx, conv: ConversationRow, role: "user" | "assistant", content: string): Promise<void> {
  const [frais] = await d.select({ messages: agentConversations.messages }).from(agentConversations).where(eq(agentConversations.id, conv.id));
  const messages = [...(((frais?.messages as MessageConversation[]) ?? [])), { role, content, at: maintenant() }];
  await d.update(agentConversations).set({ messages, updatedAt: new Date() }).where(eq(agentConversations.id, conv.id));
}

// --- recalcul des décisions ----------------------------------------------------

const scopeEpisode = (conv: ConversationRow) => ({ type: "episode" as const, cibleId: conv.cibleId });

/** Ce que la décision VISE existe-t-il encore ? Une opération dont la cible a disparu (supprimée à la main depuis) est écartée du calcul. */
function operationsExistantes(ops: Operation[], vue: VueEpisode): { existantes: Operation[]; manquantes: number } {
  const existantes = ops.filter((o) =>
    o.type === "supprimer_replique" || o.type === "remplacer_replique"
      ? !!repliqueParUuid(vue, o.repliqueUuid)
      : o.type === "ajouter_plan"
        ? !("apresPlanUuid" in o.position) || !!planParUuid(vue, o.position.apresPlanUuid)
        : !!planParUuid(vue, o.planUuid),
  );
  return { existantes, manquantes: ops.length - existantes.length };
}

/** JSON à clés triées : jsonb range les clés dans SON ordre, une comparaison par `JSON.stringify` verrait des différences qui n'en sont pas. */
function stable(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stable).join(",")}]`;
  if (v && typeof v === "object") {
    return `{${Object.keys(v as object).sort().map((k) => `${JSON.stringify(k)}:${stable((v as Record<string, unknown>)[k])}`).join(",")}}`;
  }
  return JSON.stringify(v ?? null);
}
const signature = (l: ChangementEnrichi[]): string => stable(l.map((c) => [c.cibleType, c.cibleRef, c.operation, c.avant ?? null]));

/** Recalcule, pour chaque décision ACTIVE : ses changements (aperçu des applicateurs), ses constats (code + jugements du modèle), son
 * gain, son statut, et si elle est « à revérifier » (ce qu'elle visait a changé depuis). Écrit en base. `reconfirmer` : la décision dont
 * on lève le « à revérifier » (l'utilisateur l'a relue). */
export async function recalculerDecisions(tx: DbOuTx, conv: ConversationRow, vue: VueEpisode, options: { reconfirmer?: string } = {}): Promise<void> {
  const lignes = (await tx.select().from(revisionDecisions).where(eq(revisionDecisions.conversationId, conv.id)).orderBy(asc(revisionDecisions.ordre))).filter(estActive);
  const pourConflit = lignes.map((l) => ({ id: idCourt(l.ordre), titre: l.titre, operations: (l.operations as Operation[]) ?? [] }));
  const conflits = conflitsEntreDecisions(pourConflit, vue);
  const recoupements = recoupementsEntreDecisions(pourConflit, vue);

  for (const l of lignes) {
    const ops = (l.operations as Operation[]) ?? [];
    const { existantes, manquantes } = operationsExistantes(ops, vue);
    const enrichis = await enrichirChangements(tx, conv.projectId, scopeEpisode(conv), operationsVersChangements(existantes, vue));

    const desApplicateurs: Constat[] = [];
    for (const e of enrichis) {
      if (e.refuseRaison) desApplicateurs.push({ niveau: "bloquant", texte: `Refusé : ${e.refuseRaison}`, source: "code" });
      else if (estBloque((e.avertissements ?? []) as Avertissement[])) {
        for (const a of (e.avertissements ?? []) as Avertissement[]) if (a.type === "bloque_controle") desApplicateurs.push({ niveau: "bloquant", texte: a.texte, source: "code" });
      }
    }
    const mesConflits = conflits.filter((c) => c.ids.includes(idCourt(l.ordre)));
    const ancien = (l.changements as ChangementEnrichi[]) ?? [];
    const perime = ancien.length > 0 && signature(ancien) !== signature(enrichis);
    const aReverifier = options.reconfirmer === l.uuid ? false : l.aReverifier || perime || manquantes > 0;
    const utiles = assemblerConstats({
      operationsExistantes: existantes,
      vue,
      manquantes,
      desApplicateurs,
      conflits: mesConflits.map((c) => c.texte),
      recoupements: recoupements.filter((r) => r.ids[1] === idCourt(l.ordre)).map((r) => r.texte),
      narratifs: ((l.constats as Constat[]) ?? []).filter((c) => c.source === "modele"),
      aRelire: perime && options.reconfirmer !== l.uuid,
    });

    await tx
      .update(revisionDecisions)
      .set({
        changements: enrichis,
        constats: utiles,
        gainSecondes: gainSecondes(vue, existantes),
        statut: statutDeDecision(utiles, mesConflits.length > 0),
        aReverifier,
        updatedAt: new Date(),
      })
      .where(eq(revisionDecisions.id, l.id));
  }
}

// --- état ---------------------------------------------------------------------

async function construireEtat(d: DbOuTx, conv: ConversationRow, vue: VueEpisode): Promise<EtatRevision> {
  const lignes = await d.select().from(revisionDecisions).where(eq(revisionDecisions.conversationId, conv.id)).orderBy(asc(revisionDecisions.ordre));
  const actives = lignes.filter(estActive).map(versVueDecision);
  for (const x of actives) {
    for (const op of x.operations) {
      if (op.type !== "couper_plan") continue;
      const p = planParUuid(vue, op.planUuid);
      if (p?.etat === "en_file" && !x.rendusActifs.some((r) => r.planUuid === p.uuid)) x.rendusActifs.push({ planUuid: p.uuid, handle: p.handle });
    }
  }
  const operations = actives.flatMap((x) => x.operations);
  const brouillon = appliquerAuBrouillon(vue, operations);
  const actuelle = vue.plans.reduce((a, p) => a + p.duree, 0);
  const pistes = ((conv.pistes as Piste[]) ?? []).map((p, i) => {
    const c = chiffresPiste(vue, operations, p);
    return { numero: i + 1, titre: p.titre, resume: p.resume, gainSecondes: c.gain, dureeApres: c.totalApres };
  });
  return {
    conversationUuid: conv.uuid,
    projectId: conv.projectId,
    episodeId: conv.cibleId!,
    ouverte: conv.fermeeAt == null,
    messages: (conv.messages as MessageConversation[]) ?? [],
    decisions: actives,
    appliquees: lignes.filter((r) => !estActive(r)).map((r) => ({ id: idCourt(r.ordre), titre: r.titre, gainSecondes: r.gainSecondes })),
    pistes,
    scenes: scenesTouchees(vue, operations),
    duree: { actuelle, avecBrouillon: brouillon.total, objectif: vue.objectifSecondes, constat: constatDuree(brouillon.total, vue.objectifSecondes) },
    conflits: conflitsEntreDecisions(actives.map((x) => ({ id: x.id, titre: x.titre, operations: x.operations })), vue),
  };
}

/** L'état de la révision pour l'écran : relit l'épisode et RECALCULE les décisions (constats, « à revérifier »). */
export async function lireEtatRevision(conversationUuid: string): Promise<EtatRevision | null> {
  const conv = await conversationRevisionParUuid(db, conversationUuid);
  if (!conv || conv.cibleId == null) return null;
  const vue = await lireVueEpisode(db, conv.projectId, conv.cibleId);
  if (!vue) return null;
  return db.transaction(async (tx) => {
    if (conv.fermeeAt == null) await recalculerDecisions(tx, conv, vue);
    return construireEtat(tx, conv, vue);
  });
}

// --- le tour d'analyse -----------------------------------------------------------

export async function etatAvantTour(d: DbOuTx, conv: ConversationRow, vue: VueEpisode) {
  const lignes = await d.select().from(revisionDecisions).where(eq(revisionDecisions.conversationId, conv.id)).orderBy(asc(revisionDecisions.ordre));
  const [dernier] = await d.select({ ordre: revisionDecisions.ordre }).from(revisionDecisions).where(eq(revisionDecisions.conversationId, conv.id)).orderBy(desc(revisionDecisions.ordre)).limit(1);
  const decisions: DecisionEtat[] = lignes.filter(estActive).map((r) => ({
    ordre: r.ordre,
    titre: r.titre,
    raison: r.raison,
    operations: (r.operations as Operation[]) ?? [],
    narratifs: ((r.constats as Constat[]) ?? []).filter((c) => c.source === "modele"),
  }));
  return { vue, decisions, pistes: (conv.pistes as Piste[]) ?? [], ordreSuivant: (dernier?.ordre ?? 0) + 1 };
}

/** Range ce que l'analyse du réalisateur a décidé (décisions créées, modifiées, retirées, pistes, jugements) puis recalcule les constats.
 * Dans la transaction du worker : tout ou rien. Renvoie les FAITS que le tour de réponse formulera. */
export async function appliquerSortieAnalyse(tx: Tx, conv: ConversationRow, sortie: SortieAnalyse): Promise<FaitsTour> {
  if (conv.cibleId == null) throw new Error("Révision sans épisode.");
  const vue = await lireVueEpisode(tx, conv.projectId, conv.cibleId);
  if (!vue) throw new Error("L'épisode de la révision n'existe plus.");
  const avant = await etatAvantTour(tx, conv, vue);
  const res = interpreterAnalyse(avant, sortie);

  const lignes = await tx.select().from(revisionDecisions).where(eq(revisionDecisions.conversationId, conv.id));
  const parOrdre = new Map(lignes.filter(estActive).map((r) => [r.ordre, r]));
  const gardes = new Set(res.decisions.map((d) => d.ordre));
  const aSupprimer = [...parOrdre.values()].filter((r) => !gardes.has(r.ordre)).map((r) => r.id);
  if (aSupprimer.length) await tx.delete(revisionDecisions).where(inArray(revisionDecisions.id, aSupprimer));
  for (const d of res.decisions) {
    const existante = parOrdre.get(d.ordre);
    if (existante) {
      await tx
        .update(revisionDecisions)
        // `changements: []` : les opérations ont pu changer, l'aperçu d'avant n'est plus comparable (ce n'est pas « ce qu'elle vise a changé »).
        .set({ titre: d.titre, raison: d.raison, operations: d.operations, constats: d.narratifs, changements: [], updatedAt: new Date() })
        .where(eq(revisionDecisions.id, existante.id));
    } else {
      await tx.insert(revisionDecisions).values({ conversationId: conv.id, ordre: d.ordre, titre: d.titre, raison: d.raison, statut: "retenue", operations: d.operations, constats: d.narratifs });
    }
  }
  await tx.update(agentConversations).set({ pistes: res.pistes, updatedAt: new Date() }).where(eq(agentConversations.id, conv.id));
  const convFraiche: ConversationRow = { ...conv, pistes: res.pistes };
  await recalculerDecisions(tx, convFraiche, vue);

  const etat = await construireEtat(tx, convFraiche, vue);
  return construireFaits({
    ceTour: {
      creees: res.creees.map(idCourt),
      modifiees: res.modifiees.map(idCourt),
      retirees: res.retirees.map(idCourt),
      pistesChoisies: res.pistesChoisies,
    },
    decisions: etat.decisions.map((x) => ({ id: x.id, titre: x.titre, statut: x.statut, gainSecondes: x.gainSecondes, constats: x.constats, aReverifier: x.aReverifier })),
    dureeActuelle: etat.duree.actuelle,
    dureeAvecBrouillon: etat.duree.avecBrouillon,
    objectifSecondes: etat.duree.objectif,
    pistes: etat.pistes.map((p) => ({ numero: p.numero, titre: p.titre, resume: p.resume, gainSecondes: p.gainSecondes, dureeApres: fmtDuree(p.dureeApres) })),
    refus: res.refus,
    conflits: etat.conflits.map((c) => c.texte),
    notes: res.notes,
  });
}

// --- actions de l'utilisateur ----------------------------------------------------

export async function retirerDecision(conversationUuid: string, decisionUuid: string): Promise<Resultat> {
  const conv = await conversationRevisionParUuid(db, conversationUuid);
  if (!conv || conv.fermeeAt) return ERR("Révision introuvable ou terminée.");
  if (conv.cibleId == null) return ERR("Révision sans épisode.");
  const vue = await lireVueEpisode(db, conv.projectId, conv.cibleId);
  if (!vue) return ERR("Épisode introuvable.");
  await db.transaction(async (tx) => {
    await tx.delete(revisionDecisions).where(and(eq(revisionDecisions.conversationId, conv.id), eq(revisionDecisions.uuid, decisionUuid), nonAppliquee()));
    await recalculerDecisions(tx, conv, vue);
  });
  return { ok: true };
}

/** Annule les rendus en file ou en cours d'un plan de l'épisode (pour pouvoir le supprimer). Un rendu en cours s'arrête quand le worker
 * prend le drapeau : l'écran relit l'état et la décision se débloque d'elle-même. */
export async function annulerRendusDuPlan(conversationUuid: string, planUuid: string): Promise<Resultat<{ enCours: boolean }>> {
  const conv = await conversationRevisionParUuid(db, conversationUuid);
  if (!conv || conv.fermeeAt) return ERR("Révision introuvable ou terminée.");
  if (conv.cibleId == null) return ERR("Révision sans épisode.");
  const [plan] = await db.select({ id: plans.id }).from(plans).where(and(eq(plans.uuid, planUuid), eq(plans.episodeId, conv.cibleId)));
  if (!plan) return ERR("Plan introuvable dans cet épisode.");
  const actifs = await db.select({ id: jobs.id }).from(jobs).where(and(eq(jobs.planId, plan.id), inArray(jobs.statut, ["en_attente", "en_cours"])));
  let enCours = false;
  for (const j of actifs) if ((await demanderAnnulation(`video:${j.id}`)) === "demandee") enCours = true;
  const vue = await lireVueEpisode(db, conv.projectId, conv.cibleId);
  if (vue) await db.transaction((tx) => recalculerDecisions(tx, conv, vue));
  return { ok: true, enCours };
}

/** L'utilisateur a relu une décision « à revérifier » : on lève le drapeau avec l'état courant. */
export async function reconfirmerDecision(conversationUuid: string, decisionUuid: string): Promise<Resultat> {
  const conv = await conversationRevisionParUuid(db, conversationUuid);
  if (!conv || conv.fermeeAt) return ERR("Révision introuvable ou terminée.");
  if (conv.cibleId == null) return ERR("Révision sans épisode.");
  const vue = await lireVueEpisode(db, conv.projectId, conv.cibleId);
  if (!vue) return ERR("Épisode introuvable.");
  await db.transaction((tx) => recalculerDecisions(tx, conv, vue, { reconfirmer: decisionUuid }));
  return { ok: true };
}

/** Abandonne la révision : le brouillon disparaît, la conversation se ferme (son historique reste). */
export async function abandonnerRevision(conversationUuid: string): Promise<Resultat> {
  const conv = await conversationRevisionParUuid(db, conversationUuid);
  if (!conv || conv.fermeeAt) return ERR("Révision introuvable ou déjà terminée.");
  await db.transaction(async (tx) => {
    await tx.delete(revisionDecisions).where(and(eq(revisionDecisions.conversationId, conv.id), nonAppliquee()));
    await tx.update(agentConversations).set({ fermeeAt: new Date(), pistes: [], etape: "applique", updatedAt: new Date() }).where(eq(agentConversations.id, conv.id));
  });
  return { ok: true };
}

// --- appliquer ---------------------------------------------------------------------

export type ResultatApplicationRevision =
  | { ok: true; appliquees: number; changements: number; suite: SuiteFiches | null }
  | { ok: false; erreur: string; confirmationRequise?: EcrasementAConfirmer[] };

/** Applique le chantier : les décisions actives deviennent UNE proposition (skill `realisateur`, portée épisode), appliquée par
 * `appliquerProposition`. Refuse tant qu'une décision est en conflit ou « à revérifier », ou qu'un tour est en cours. Un écrasement
 * (rendu réussi, prise validée) demande `confirmeEcrasement`. Réussie, la conversation se FERME. */
export async function appliquerRevision(conversationUuid: string, options: { confirmeEcrasement?: boolean } = {}): Promise<ResultatApplicationRevision> {
  const conv = await conversationRevisionParUuid(db, conversationUuid);
  if (!conv || conv.fermeeAt) return ERR("Révision introuvable ou déjà terminée.");
  if (conv.cibleId == null) return ERR("Révision sans épisode.");
  if (await tacheActive(conv.id)) return ERR("Le réalisateur est en train de répondre : attends sa réponse.");
  const vue = await lireVueEpisode(db, conv.projectId, conv.cibleId);
  if (!vue) return ERR("Épisode introuvable.");

  const decisions = await db.transaction(async (tx) => {
    await recalculerDecisions(tx, conv, vue);
    return (await tx.select().from(revisionDecisions).where(eq(revisionDecisions.conversationId, conv.id)).orderBy(asc(revisionDecisions.ordre))).filter(estActive);
  });
  if (decisions.length === 0) return ERR("Rien n'est retenu : il n'y a rien à appliquer.");
  const enConflit = decisions.filter((d) => d.statut === "conflit");
  if (enConflit.length > 0) return ERR(`Il reste ${enConflit.length} décision${enConflit.length > 1 ? "s" : ""} en conflit (${enConflit.map((d) => idCourt(d.ordre)).join(", ")}) : tranche-${enConflit.length > 1 ? "les" : "la"} d'abord.`);
  const aRelire = decisions.filter((d) => d.aReverifier);
  if (aRelire.length > 0) return ERR(`${aRelire.length} décision${aRelire.length > 1 ? "s" : ""} à revérifier (${aRelire.map((d) => idCourt(d.ordre)).join(", ")}) : ce qu'elles visent a changé depuis.`);

  const bruts = decisions.flatMap((d) => operationsVersChangements((d.operations as Operation[]) ?? [], vue));
  const episode = `Épisode ${vue.numero} · ${vue.titre}`;
  const propId = await db.transaction(async (tx) => {
    const [prop] = await tx
      .insert(propositions)
      .values({
        conversationId: conv.id,
        projectId: conv.projectId,
        skill: "realisateur",
        portee: "episode",
        cibleId: conv.cibleId,
        consigne: "Révision de l'épisode",
        contexte: [{ type: "episode", libelle: episode, ref: String(conv.cibleId) }],
      })
      .returning({ id: propositions.id });
    await enregistrerChangements(tx, prop!.id, conv.projectId, scopeEpisode(conv), bruts);
    // L'utilisateur a déjà choisi, décision par décision : tout ce qui n'est pas refusé ni bloqué est retenu (même une suppression).
    const lignes = await tx.select().from(propositionChangements).where(eq(propositionChangements.propositionId, prop!.id));
    const aCocher = lignes.filter((l) => !l.refuseRaison && !estBloque((l.avertissements ?? []) as Avertissement[])).map((l) => l.id);
    if (aCocher.length) await tx.update(propositionChangements).set({ coche: true }).where(inArray(propositionChangements.id, aCocher));
    await tx.update(agentConversations).set({ propositionId: prop!.id, etape: "proposition", updatedAt: new Date() }).where(eq(agentConversations.id, conv.id));
    return prop!.id;
  });

  const r = await appliquerProposition(propId, { confirmeEcrasement: options.confirmeEcrasement });
  if (!r.ok) {
    // Rien n'a été écrit : la proposition de passage ne doit pas rester (une confirmation demandée la recrée proprement).
    await db.delete(propositions).where(eq(propositions.id, propId));
    await db.update(agentConversations).set({ propositionId: null, etape: "conversation", updatedAt: new Date() }).where(eq(agentConversations.id, conv.id));
    return { ok: false, erreur: r.erreur, ...(r.confirmationRequise ? { confirmationRequise: r.confirmationRequise } : {}) };
  }

  await db.transaction(async (tx) => {
    await tx
      .update(revisionDecisions)
      .set({ statut: "appliquee", propositionId: propId, appliqueAt: new Date(), updatedAt: new Date() })
      .where(inArray(revisionDecisions.id, decisions.map((d) => d.id)));
    await tx.update(agentConversations).set({ fermeeAt: new Date(), pistes: [], etape: "applique", updatedAt: new Date() }).where(eq(agentConversations.id, conv.id));
    await ajouterMessage(
      tx,
      conv,
      "assistant",
      `Chantier appliqué : ${decisions.length} décision${decisions.length > 1 ? "s" : ""}, ${r.appliques} changement${r.appliques > 1 ? "s" : ""}. Cette conversation est terminée : une prochaine révision en ouvrira une neuve.`,
    );
  });
  const suite = await lancerSuiteFiches(conv, decisions.flatMap((d) => (d.operations as Operation[]) ?? []), new Set(vue.plans.map((p) => p.uuid)));
  return { ok: true, appliquees: decisions.length, changements: r.appliques, suite };
}

/** Ce qui suit l'application : les fiches à réécrire (refondre_fiche) et celles des plans ajoutés, en UN lot `plan-h3` posé sur la
 * conversation courte de l'épisode. Rien n'est écrit : le résultat arrive en proposition, à relire. Un échec ici ne défait pas le chantier. */
export type SuiteFiches = { plans: number; erreur: string | null };

const CONSIGNE_REFONTE =
  "Rewrite this plan's sheet so that it matches the plan as it is now: its description, its duration and the lines it says, word for word. Keep what already works.";
const CONSIGNE_PLAN_AJOUTE = "Write the complete sheet of this new plan from its description and its duration.";

async function lancerSuiteFiches(conv: ConversationRow, operations: Operation[], avant: Set<string>): Promise<SuiteFiches | null> {
  if (conv.cibleId == null) return null;
  const consignes: Record<string, string> = {};
  for (const op of operations) {
    if (op.type !== "refondre_fiche") continue;
    consignes[op.planUuid] = [consignes[op.planUuid] ?? CONSIGNE_REFONTE, op.consigne ? `The user asks: ${op.consigne}` : ""].filter(Boolean).join(" ");
  }
  const maintenant = await db.select({ uuid: plans.uuid }).from(plans).where(eq(plans.episodeId, conv.cibleId));
  const presents = new Set(maintenant.map((p) => p.uuid));
  const aFaire = [...Object.keys(consignes).filter((u) => presents.has(u)), ...maintenant.map((p) => p.uuid).filter((u) => !avant.has(u))];
  if (aFaire.length === 0) return null;
  for (const u of aFaire) consignes[u] ??= CONSIGNE_PLAN_AJOUTE;
  try {
    const service = await import("../service");
    const ouv = await service.ouvrirConversation(conv.projectId, "episode", { id: conv.cibleId });
    if (!ouv.ok) return { plans: aFaire.length, erreur: ouv.erreur };
    const r = await service.genererFiches(ouv.conversationUuid, { planUuids: aFaire, consignes });
    return r.ok ? { plans: aFaire.length, erreur: null } : { plans: aFaire.length, erreur: r.erreur };
  } catch (e) {
    return { plans: aFaire.length, erreur: e instanceof Error ? e.message : "Erreur inconnue." };
  }
}

// --- le tour de conversation -----------------------------------------------------------

const MAX_MESSAGE = 4000;

/** L'utilisateur écrit au réalisateur : le message rejoint la conversation et le tour d'ANALYSE est posé dans la file (un seul tour à la fois).
 * L'analyse relit l'épisode et le brouillon À L'EXÉCUTION ; sa réponse suit, posée par le worker (worker/agents/postTraitement.ts). */
export async function envoyerMessageRevision(conversationUuid: string, texte: string): Promise<Resultat<{ runUuid: string }>> {
  const conv = await conversationRevisionParUuid(db, conversationUuid);
  if (!conv || conv.fermeeAt) return ERR("Révision introuvable ou terminée : ouvres-en une neuve.");
  const message = texte.trim();
  if (!message) return ERR("Le message est vide.");
  if (message.length > MAX_MESSAGE) return ERR(`Message trop long (${MAX_MESSAGE} caractères au plus).`);
  if (await tacheActive(conv.id)) return ERR("Le réalisateur est déjà en train de répondre : attends sa réponse.");
  const run = await db.transaction(async (tx) => {
    await ajouterMessage(tx, conv, "user", message);
    return creerRun(tx, { skill: "realisateur-analyse", entree: { conversation: conv.uuid }, but: "tour", projectId: conv.projectId, conversationId: conv.id });
  });
  return { ok: true, runUuid: run.uuid };
}

/** Relance le tour quand il a échoué (serveur LLM en panne, sortie invalide) : le dernier message est celui de l'utilisateur, rien ne tourne. */
export async function relancerTourRevision(conversationUuid: string): Promise<Resultat<{ runUuid: string }>> {
  const conv = await conversationRevisionParUuid(db, conversationUuid);
  if (!conv || conv.fermeeAt) return ERR("Révision introuvable ou terminée.");
  const messages = (conv.messages as MessageConversation[]) ?? [];
  if (messages.at(-1)?.role !== "user") return ERR("Le réalisateur a déjà répondu : il n'y a rien à relancer.");
  if (await tacheActive(conv.id)) return ERR("Un tour est déjà en cours.");
  const run = await creerRun(db, { skill: "realisateur-analyse", entree: { conversation: conv.uuid }, but: "tour", projectId: conv.projectId, conversationId: conv.id });
  return { ok: true, runUuid: run.uuid };
}

// --- pour l'écran ------------------------------------------------------------------------------

/** L'état de la révision ET l'état de la dernière tâche de sa conversation (file, travail en cours, échec) : ce que l'écran sonde tant
 * qu'un tour tourne. Recalcule les décisions (constats, « à revérifier »), comme `lireEtatRevision`. */
export async function lireVueRevision(conversationUuid: string): Promise<{ etat: EtatRevision; tache: EtatTache | null } | null> {
  const etat = await lireEtatRevision(conversationUuid);
  if (!etat) return null;
  const conv = await conversationRevisionParUuid(db, conversationUuid);
  const [run] = await db.select({ id: agentRuns.id }).from(agentRuns).where(eq(agentRuns.conversationId, conv!.id)).orderBy(desc(agentRuns.id)).limit(1);
  return { etat, tache: await etatTache(run?.id ?? null) };
}

/** Combien de décisions en cours (non appliquées) a la révision ouverte de cet épisode : la pastille de l'onglet « Réalisateur ». */
export async function nbDecisionsEnCours(projectId: number, episodeId: number): Promise<number> {
  const [conv] = await db
    .select({ id: agentConversations.id })
    .from(agentConversations)
    .where(
      and(
        eq(agentConversations.projectId, projectId),
        eq(agentConversations.portee, "episode"),
        eq(agentConversations.cibleId, episodeId),
        eq(agentConversations.profondeur, "revision"),
        isNull(agentConversations.fermeeAt),
      ),
    );
  if (!conv) return 0;
  const lignes = await db.select({ statut: revisionDecisions.statut }).from(revisionDecisions).where(eq(revisionDecisions.conversationId, conv.id));
  return lignes.filter((l) => l.statut !== "appliquee").length;
}

/** Le début de message proposé quand on arrive d'un plan : « À propos du plan 07 (Maya lit la lettre) : ». Chaîne vide si le plan n'est
 * pas de cet épisode ou si l'uuid n'en est pas un (jamais une erreur : c'est un confort). */
export async function amorceDePlan(episodeId: number, planUuid: string | null | undefined): Promise<string> {
  if (!planUuid || !/^[0-9a-f-]{36}$/i.test(planUuid)) return "";
  const lignes = await db.select({ uuid: plans.uuid, titre: plans.titre }).from(plans).where(eq(plans.episodeId, episodeId)).orderBy(asc(plans.ordre), asc(plans.id));
  const i = lignes.findIndex((p) => p.uuid === planUuid);
  return i < 0 ? "" : `À propos du plan ${String(i + 1).padStart(2, "0")} (${lignes[i]!.titre}) : `;
}
