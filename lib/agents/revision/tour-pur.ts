import { chiffresPiste, idCourt, statutDeDecision, type ResultatAnalyse } from "./analyse";
import { gainSecondes, appliquerAuBrouillon } from "./brouillon";
import { conflitsEntreDecisions, constatsOperations } from "./constats";
import { construireFaits, type FaitsTour } from "./faits";
import { fmtDuree } from "./format";
import type { DecisionPourEntree } from "./entrees";
import type { Constat, Operation } from "./types";
import type { VueEpisode } from "./vue-episode";

/** Les constats d'une décision, assemblés : ceux du code (opérations, cibles disparues, ce que les applicateurs refusent ou bloquent,
 * conflits avec d'autres décisions, « à relire »), puis les jugements du modèle. Un « ok » ne reste que s'il n'y a rien d'autre à dire.
 * Pur, testé : la base (revision-db.ts) et l'essai sans base (scripts/revision-essai.ts) l'utilisent tous deux. */
export function assemblerConstats(p: {
  operationsExistantes: Operation[];
  vue: VueEpisode;
  manquantes: number;
  /** Ce que les applicateurs en disent (refus, contrôles qui bloquent), déjà au format constat ; vide sans base. */
  desApplicateurs: Constat[];
  conflits: string[];
  narratifs: Constat[];
  aRelire: boolean;
}): Constat[] {
  const constats: Constat[] = [...constatsOperations(p.operationsExistantes, p.vue)];
  if (p.manquantes > 0) constats.push({ niveau: "bloquant", texte: `${p.manquantes} cible${p.manquantes > 1 ? "s n'existent" : " n'existe"} plus (supprimée${p.manquantes > 1 ? "s" : ""} depuis).`, source: "code" });
  constats.push(...p.desApplicateurs);
  for (const c of p.conflits) constats.push({ niveau: "bloquant", texte: `Conflit : ${c}`, source: "code" });
  constats.push(...p.narratifs);
  if (p.aRelire) constats.push({ niveau: "alerte", texte: "Ce que cette décision vise a changé depuis qu'elle a été prise : à relire.", source: "code" });
  return constats.some((c) => c.niveau !== "ok") ? constats.filter((c) => c.niveau !== "ok") : constats;
}

/** Le tour sans base : à partir du résultat de l'analyse, les décisions telles que le modèle les relira au tour suivant et les FAITS du
 * tour de réponse. Ne connaît pas les aperçus des applicateurs (écrasements, refus de base) : c'est une approximation fidèle pour juger
 * ce que le MODÈLE propose, pas un substitut de la base. */
export function tourPur(vue: VueEpisode, res: ResultatAnalyse): { decisions: DecisionPourEntree[]; faits: FaitsTour } {
  const conflits = conflitsEntreDecisions(res.decisions.map((d) => ({ id: idCourt(d.ordre), titre: d.titre, operations: d.operations })), vue);
  const decisions: DecisionPourEntree[] = res.decisions.map((d) => {
    const mes = conflits.filter((c) => c.ids.includes(idCourt(d.ordre))).map((c) => c.texte);
    const constats = assemblerConstats({ operationsExistantes: d.operations, vue, manquantes: 0, desApplicateurs: [], conflits: mes, narratifs: d.narratifs, aRelire: false });
    return { ordre: d.ordre, titre: d.titre, raison: d.raison, statut: statutDeDecision(constats, mes.length > 0), operations: d.operations, constats };
  });
  const operations = decisions.flatMap((d) => d.operations);
  const faits = construireFaits({
    ceTour: { creees: res.creees.map(idCourt), modifiees: res.modifiees.map(idCourt), retirees: res.retirees.map(idCourt), pistesChoisies: res.pistesChoisies },
    decisions: decisions.map((d) => ({ id: idCourt(d.ordre), titre: d.titre, statut: d.statut as never, gainSecondes: gainSecondes(vue, d.operations), constats: d.constats, aReverifier: false })),
    dureeActuelle: vue.plans.reduce((a, p) => a + p.duree, 0),
    dureeAvecBrouillon: appliquerAuBrouillon(vue, operations).total,
    objectifSecondes: vue.objectifSecondes,
    pistes: res.pistes.map((p, i) => {
      const c = chiffresPiste(vue, operations, p);
      return { numero: i + 1, titre: p.titre, resume: p.resume, gainSecondes: c.gain, dureeApres: fmtDuree(c.totalApres) };
    }),
    refus: res.refus,
    conflits: conflits.map((c) => c.texte),
  });
  return { decisions, faits };
}
