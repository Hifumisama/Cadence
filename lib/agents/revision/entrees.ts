import { and, asc, eq, inArray } from "drizzle-orm";
import { agentConversations, assets, revisionDecisions } from "../../../db/schema";
import type { Controleur } from "../../llm/controles";
import type { Db } from "../applicateurs/commun";
import { lireBriefDuProjet } from "../contexte";
import { DUREE_GENERATION_MAX, DUREE_GENERATION_MIN } from "../../plan-checks";
import type { MessageConversation } from "../types";
import { chiffresPiste, idCourt, ordreDeDecision, type SortieAnalyse } from "./analyse";
import { appliquerAuBrouillon } from "./brouillon";
import type { FaitsTour } from "./faits";
import { fmtDuree } from "./format";
import { conflitsEntreDecisions, recoupementsEntreDecisions } from "./constats";
import { operationEnPoignees, validerOperations } from "./operations";
import type { Constat, Operation, OperationBrute, Piste } from "./types";
import { lireVueEpisode, type VueEpisode } from "./vue-episode";

/** Les entrées des deux skills du réalisateur, construites par le CODE (jamais devinées par le modèle) : `realisateur-analyse` reçoit
 * l'épisode avec ses poignées, le brouillon, les pistes en attente et la conversation ; `realisateur-reponse` reçoit les faits du tour.
 * `entreeAnalyse` est assemblée À L'EXÉCUTION (worker/agents/preparation.ts) : le modèle voit l'épisode tel qu'il est à cet instant. */

type ConversationRow = typeof agentConversations.$inferSelect;

const MESSAGES_RELUS = 12;
const qui = (role: "user" | "assistant") => (role === "user" ? "utilisateur" : "realisateur");

export type EntreeAnalyse = {
  episode: { numero: number; titre: string; dureeSecondes: number; duree: string; objectifSecondes: number | null; objectif: string | null; dureeAvecBrouillonSecondes: number; aEconomiserSecondes: number | null };
  limites: { dureePlanMinSecondes: number; dureePlanMaxSecondes: number };
  plans: {
    ref: string;
    scene: string | null;
    titre: string;
    description: string;
    dureeSecondes: number;
    etat: string;
    rendu_perime: boolean;
    repliques: string[];
    /** Ce que le brouillon en fait : coupé, ou sa durée si elle change ; null s'il n'est pas touché. */
    brouillon: { coupe: true } | { dureeSecondes: number } | null;
  }[];
  repliques: { ref: string; locuteur: string; texte: string; plans: string[]; prise: "aucune" | "posée" | "validée" }[];
  /** Les codes des personnages et des voix du projet : les locuteurs possibles d'une réplique ajoutée. */
  locuteursConnus: string[];
  decisions: { id: string; titre: string; raison: string; statut: string; operations: OperationBrute[]; constats: { niveau: string; texte: string }[] }[];
  /** L'identifiant que recevra la prochaine décision CRÉÉE (puis les suivants, dans l'ordre) : pour qu'un jugement `narratif` puisse la viser. */
  prochainId: string;
  pistesEnAttente: { numero: number; titre: string; resume: string; operations: OperationBrute[]; gain: string; dureeApres: string }[];
  brief: object | null;
  conversation: { qui: string; texte: string }[];
  message: string;
};

export type ControleAnalyse = { vue: VueEpisode; ordres: number[]; prochainOrdre: number; decisionsExistantes?: { id: string; titre: string; operations: Operation[] }[] };

/** Ce que le réalisateur lit du brief : l'arc, le ton, le rythme, la durée et les règles de continuité (pas le registre : les personnages et
 * les lieux sont déjà dans les plans). Tolérant : un brief ancien ou partiel ne fait pas échouer le tour. */
function extraitBriefRevision(brief: Record<string, unknown> | null | undefined): object | null {
  if (!brief) return null;
  const garde = ["arc", "genreTon", "rythme", "dureeEpisodeSecondes", "continuite", "rimes", "progressions", "pieges", "notes"];
  const sortie: Record<string, unknown> = {};
  for (const cle of garde) {
    const v = brief[cle];
    if (v == null || v === "" || (Array.isArray(v) && v.length === 0)) continue;
    sortie[cle] = v;
  }
  return Object.keys(sortie).length > 0 ? sortie : null;
}

const prise = (r: { avecPrise: boolean; priseValidee: boolean }): "aucune" | "posée" | "validée" => (r.priseValidee ? "validée" : r.avecPrise ? "posée" : "aucune");

/** Une décision telle que l'entrée la montre au modèle (`ordre` = son numéro D1, D2…). */
export type DecisionPourEntree = { ordre: number; titre: string; raison: string; statut: string; operations: Operation[]; constats: Constat[] };

/** L'entrée de l'analyse, construite SANS base (pur, testé) : l'essai du réalisateur (scripts/revision-essai.ts) s'en sert sur l'épisode
 * d'essai ; `entreeAnalyse` la nourrit avec la base. */
export function construireEntreeAnalyse(p: {
  vue: VueEpisode;
  decisions: DecisionPourEntree[];
  prochainOrdre: number;
  pistes: Piste[];
  messages: MessageConversation[];
  brief: Record<string, unknown> | null | undefined;
  locuteurs?: string[];
}): { entree: EntreeAnalyse; controle: ControleAnalyse } {
  const { vue } = p;
  const operations = p.decisions.flatMap((d) => d.operations);
  const brouillon = appliquerAuBrouillon(vue, operations);
  const parUuid = new Map(brouillon.plans.map((x) => [x.uuid, x]));
  const total = vue.plans.reduce((a, x) => a + x.duree, 0);
  const messages = p.messages.slice(-MESSAGES_RELUS);
  const dernier = [...messages].reverse().find((m) => m.role === "user");

  const entree: EntreeAnalyse = {
    episode: {
      numero: vue.numero,
      titre: vue.titre,
      dureeSecondes: total,
      duree: fmtDuree(total),
      objectifSecondes: vue.objectifSecondes,
      objectif: vue.objectifSecondes != null ? fmtDuree(vue.objectifSecondes) : null,
      dureeAvecBrouillonSecondes: brouillon.total,
      aEconomiserSecondes: vue.objectifSecondes != null ? Math.max(0, brouillon.total - vue.objectifSecondes) : null,
    },
    limites: { dureePlanMinSecondes: DUREE_GENERATION_MIN, dureePlanMaxSecondes: DUREE_GENERATION_MAX },
    plans: vue.plans.map((x) => {
      const b = parUuid.get(x.uuid);
      return {
        ref: x.handle,
        scene: x.sceneTitre,
        titre: x.titre,
        description: x.description,
        dureeSecondes: x.duree,
        etat: x.etat,
        rendu_perime: x.perime,
        repliques: x.repliques.map((u) => vue.repliques.find((r) => r.uuid === u)?.handle ?? "?"),
        brouillon: b?.coupe ? { coupe: true as const } : b && b.duree !== x.duree ? { dureeSecondes: b.duree } : null,
      };
    }),
    repliques: vue.repliques.map((r) => ({
      ref: r.handle,
      locuteur: r.locuteur,
      texte: r.texte,
      plans: r.plans.map((u) => vue.plans.find((x) => x.uuid === u)?.handle ?? "?"),
      prise: prise(r),
    })),
    locuteursConnus: p.locuteurs ?? [],
    decisions: p.decisions.map((d) => ({
      id: idCourt(d.ordre),
      titre: d.titre,
      raison: d.raison,
      statut: d.statut,
      operations: d.operations.map((o) => operationEnPoignees(o, vue)),
      constats: d.constats.filter((c) => c.niveau !== "ok").map((c) => ({ niveau: c.niveau, texte: c.texte })),
    })),
    prochainId: idCourt(p.prochainOrdre),
    pistesEnAttente: p.pistes.map((x, i) => {
      const c = chiffresPiste(vue, operations, x);
      return { numero: i + 1, titre: x.titre, resume: x.resume, operations: x.operations.map((o) => operationEnPoignees(o, vue)), gain: `${c.gain >= 0 ? "−" : "+"}${Math.abs(c.gain)} s`, dureeApres: fmtDuree(c.totalApres) };
    }),
    brief: extraitBriefRevision(p.brief),
    conversation: messages.filter((m) => m !== dernier).map((m) => ({ qui: qui(m.role), texte: m.content })),
    message: dernier?.content ?? "",
  };
  return {
    entree,
    controle: { vue, ordres: p.decisions.map((d) => d.ordre), prochainOrdre: p.prochainOrdre, decisionsExistantes: p.decisions.map((d) => ({ id: idCourt(d.ordre), titre: d.titre, operations: d.operations })) },
  };
}

export async function entreeAnalyse(d: Db, conv: ConversationRow): Promise<{ entree: EntreeAnalyse; controle: ControleAnalyse } | null> {
  if (conv.cibleId == null) return null;
  const vue = await lireVueEpisode(d, conv.projectId, conv.cibleId);
  if (!vue) return null;
  const lignes = await d.select().from(revisionDecisions).where(eq(revisionDecisions.conversationId, conv.id)).orderBy(asc(revisionDecisions.ordre));
  const brief = await lireBriefDuProjet(d, conv.projectId);
  const locuteurs = (await d.select({ code: assets.code }).from(assets).where(and(eq(assets.projectId, conv.projectId), inArray(assets.type, ["personnage", "voix"]))).orderBy(asc(assets.code))).map((a) => a.code);
  return construireEntreeAnalyse({
    locuteurs,
    vue,
    decisions: lignes
      .filter((l) => l.statut !== "appliquee")
      .map((l) => ({ ordre: l.ordre, titre: l.titre, raison: l.raison, statut: l.statut, operations: (l.operations as Operation[]) ?? [], constats: (l.constats as Constat[]) ?? [] })),
    prochainOrdre: Math.max(0, ...lignes.map((l) => l.ordre)) + 1,
    pistes: (conv.pistes as Piste[]) ?? [],
    messages: (conv.messages as MessageConversation[]) ?? [],
    brief: brief?.contenu as Record<string, unknown> | undefined,
  });
}

/** Le contrôle SÉMANTIQUE de l'analyse (lib/llm/controles.ts) : tout ce que le code refuserait (poignée inventée, durée hors limites, id de
 * décision inconnu) est renvoyé UNE fois au modèle avant d'être gardé. Les refus qui persistent se lisent au tour de réponse. */
export function controleurAnalyse(c: ControleAnalyse): Controleur {
  return (json) => {
    const s = json as SortieAnalyse;
    const soucis: string[] = [];
    const verifier = (contexte: string, ops: OperationBrute[] | undefined) => {
      for (const r of validerOperations(ops ?? [], c.vue).refusees) soucis.push(`${contexte} : ${r.raison}`);
    };
    const nouvelles = (s.decisions ?? []).filter((d) => !d.id).length + (s.retenirPistes ?? []).length;
    const connu = (id: string | null | undefined, avecNouvelles: boolean) => {
      const n = ordreDeDecision(id);
      return n != null && (c.ordres.includes(n) || (avecNouvelles && n >= c.prochainOrdre && n < c.prochainOrdre + nouvelles));
    };
    for (const d of s.decisions ?? []) {
      verifier(`Décision « ${d.titre} »`, d.operations);
      if (d.id && !connu(d.id, false)) soucis.push(`Décision « ${d.titre} » : l'id « ${d.id} » n'existe pas dans "decisions" de l'entrée ; mets null pour une nouvelle décision.`);
    }
    // Une NOUVELLE décision qui recoupe ou contredit une décision existante : presque toujours une correction postée comme un ajout.
    for (const d of s.decisions ?? []) {
      if (d.id) continue;
      const nouvelle = { id: "nouvelle", titre: d.titre, operations: validerOperations(d.operations ?? [], c.vue).valides };
      // Une décision re-postée ou retirée dans CETTE sortie n'est plus ce qu'elle était : on ne compare pas la nouvelle à son ancienne version.
      const touchees = new Set([...(s.decisions ?? []).map((x) => x.id), ...(s.retirer ?? [])].map((x) => ordreDeDecision(x)).filter((x): x is number => x != null).map(idCourt));
      const existantes = (c.decisionsExistantes ?? []).filter((e) => !touchees.has(e.id));
      const textes = [
        ...recoupementsEntreDecisions([...existantes, nouvelle], c.vue).filter((x) => x.ids[1] === "nouvelle").map((x) => x.texte),
        ...conflitsEntreDecisions([...existantes, nouvelle], c.vue).filter((x) => x.ids.includes("nouvelle")).map((x) => x.texte),
      ];
      if (textes.length > 0) {
        soucis.push(
          `Décision « ${d.titre} » : ${textes[0]} Il n'existe pas d'opération « garder » ni « annuler » : pour réduire, corriger ou défaire une décision existante, re-poste CETTE décision avec son id et ses opérations complètes (ou retire-la) ; n'en ajoute pas une seconde à côté.`,
        );
      }
    }
    for (const p of s.pistes ?? []) verifier(`Piste « ${p.titre} »`, p.operations);
    for (const id of s.retirer ?? []) if (!connu(id, false)) soucis.push(`Retirer « ${id} » : cette décision n'existe pas.`);
    for (const n of s.narratif ?? []) if (!connu(n.decision, true)) soucis.push(`Jugement sur « ${n.decision} » : cette décision n'existe pas (les nouvelles décisions reçoivent ${c.prochainOrdre > 0 ? idCourt(c.prochainOrdre) : "D1"}, puis les suivantes).`);
    return soucis.slice(0, 10);
  };
}

/** L'entrée de `realisateur-reponse` : les derniers échanges et les FAITS du code (chiffres, constats, refus). */
export function entreeReponse(p: { episode: { numero: number; titre: string }; messages: MessageConversation[]; faits: FaitsTour }) {
  const recents = p.messages.slice(-MESSAGES_RELUS);
  const dernier = [...recents].reverse().find((m) => m.role === "user");
  return {
    episode: p.episode,
    conversation: recents.filter((m) => m !== dernier).map((m) => ({ qui: qui(m.role), texte: m.content })),
    message: dernier?.content ?? "",
    faits: p.faits,
  };
}
