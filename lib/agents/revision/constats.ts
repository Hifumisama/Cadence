import { fmtDuree } from "./format";
import type { Constat, Operation } from "./types";
import { planParUuid, repliqueParUuid, type VueEpisode } from "./vue-episode";

/** Les constats MÉCANIQUES, calculés par le code (jamais par le modèle) : ce qui est écrasé, ce qui devient périmé, ce qui bloque, la durée
 * contre l'objectif, les contradictions entre décisions. Purs, testés. Le modèle, lui, ne juge que le narratif (plan orphelin, réplique
 * sans cause), et ses jugements portent `source: "modele"`. */

const alerte = (texte: string): Constat => ({ niveau: "alerte", texte, source: "code" });
const bloquant = (texte: string): Constat => ({ niveau: "bloquant", texte, source: "code" });
const ok = (texte: string): Constat => ({ niveau: "ok", texte, source: "code" });
const pluriel = (n: number, un: string, plusieurs: string) => (n > 1 ? plusieurs : un);

export function constatsOperations(operations: Operation[], vue: VueEpisode): Constat[] {
  const constats: Constat[] = [];
  for (const op of operations) {
    if (op.type === "couper_plan") {
      const p = planParUuid(vue, op.planUuid);
      if (!p) continue;
      if (p.etat === "en_file") constats.push(bloquant(`Un rendu de ${p.handle} est en file ou en cours : l'annuler avant de supprimer le plan.`));
      else if (p.etat === "rendu") constats.push(alerte(`Écrase le rendu réussi de ${p.handle} : il disparaît avec le plan.`));
      if (p.repliques.length > 0) constats.push(alerte(`${p.repliques.length} ${pluriel(p.repliques.length, "réplique reste", "répliques restent")} dans l'épisode, sans plan.`));
    } else if (op.type === "duree_plan") {
      const p = planParUuid(vue, op.planUuid);
      if (!p) continue;
      if (op.secondes === p.duree) constats.push(alerte(`${p.handle} dure déjà ${p.duree} s : rien ne change.`));
      else if (p.etat === "rendu") constats.push(alerte(`Rend périmé le rendu de ${p.handle} : la durée soumise au rendu n'est plus la sienne.`));
    } else if (op.type === "remplacer_replique") {
      const r = repliqueParUuid(vue, op.repliqueUuid);
      if (!r) continue;
      if (op.texte !== undefined && op.texte === r.texte) constats.push(alerte(`Le texte de ${r.handle} est identique : rien ne change.`));
      else if (op.texte !== undefined) {
        if (r.priseValidee) constats.push(alerte(`La prise validée de ${r.handle} repasse « posée » : elle ne dit plus le texte.`));
        else if (r.avecPrise) constats.push(alerte(`La prise audio de ${r.handle} sera à refaire.`));
        for (const uuid of r.plans) {
          const p = planParUuid(vue, uuid);
          if (!p) continue;
          constats.push(alerte(`La fiche de ${p.handle} cite l'ancienne réplique : à resynchroniser (dialogues à corriger).`));
          if (p.etat === "rendu") constats.push(alerte(`Le rendu de ${p.handle} sera périmé quand sa fiche sera resynchronisée.`));
        }
      }
    } else if (op.type === "supprimer_replique") {
      const r = repliqueParUuid(vue, op.repliqueUuid);
      if (!r) continue;
      if (r.priseValidee) constats.push(alerte(`Supprime la prise validée de ${r.handle}.`));
      for (const uuid of r.plans) {
        const p = planParUuid(vue, uuid);
        if (p) constats.push(alerte(`${r.handle} est retirée de la fiche de ${p.handle} : à resynchroniser.`));
      }
    }
  }
  const uniques = constats.filter((c, i) => constats.findIndex((x) => x.texte === c.texte) === i);
  if (uniques.length === 0) return [ok("Aucun rendu ni prise touchés.")];
  return uniques;
}

/** La durée de l'épisode contre l'objectif du brief. */
export function constatDuree(total: number, objectifSecondes: number | null): Constat {
  if (objectifSecondes == null) return { niveau: "ok", texte: `Durée : ${fmtDuree(total)} (pas d'objectif dans le brief).`, source: "code" };
  if (total <= objectifSecondes) return ok(`Durée : ${fmtDuree(total)}, objectif de ${fmtDuree(objectifSecondes)} tenu.`);
  return alerte(`Durée : ${fmtDuree(total)}, il manque encore ${total - objectifSecondes} s pour tenir ${fmtDuree(objectifSecondes)}.`);
}

export type DecisionPourConflit = { id: string; titre: string; operations: Operation[] };
export type ConflitDecisions = { ids: string[]; texte: string };

/** Les contradictions MÉCANIQUES entre décisions (deux décisions qui ne peuvent pas s'appliquer ensemble) :
 * couper un plan qu'une autre décision modifie ou déplace, déplacer après un plan coupé, deux durées ou deux textes différents pour
 * la même cible, modifier une réplique qu'une autre supprime. */
export function conflitsEntreDecisions(decisions: DecisionPourConflit[], vue: VueEpisode): ConflitDecisions[] {
  const conflits: ConflitDecisions[] = [];
  const nomPlan = (uuid: string) => planParUuid(vue, uuid)?.handle ?? "un plan";
  const nomRep = (uuid: string) => repliqueParUuid(vue, uuid)?.handle ?? "une réplique";
  const vus = new Set<string>();
  const ajoute = (a: DecisionPourConflit, b: DecisionPourConflit, texte: string) => {
    const cle = [a.id, b.id].sort().join("|") + texte;
    if (vus.has(cle)) return;
    vus.add(cle);
    conflits.push({ ids: [a.id, b.id], texte });
  };

  for (const a of decisions) {
    for (const b of decisions) {
      if (a.id === b.id) continue;
      for (const oa of a.operations) {
        for (const ob of b.operations) {
          if (oa.type === "couper_plan") {
            if ((ob.type === "duree_plan" || ob.type === "modifier_plan" || ob.type === "deplacer_plan") && ob.planUuid === oa.planUuid) {
              ajoute(a, b, `« ${a.titre} » coupe ${nomPlan(oa.planUuid)}, que « ${b.titre} » veut aussi modifier.`);
            }
            if (ob.type === "deplacer_plan" && "apresPlanUuid" in ob.position && ob.position.apresPlanUuid === oa.planUuid) {
              ajoute(a, b, `« ${b.titre} » place un plan après ${nomPlan(oa.planUuid)}, que « ${a.titre} » coupe.`);
            }
          }
          if (oa.type === "duree_plan" && ob.type === "duree_plan" && oa.planUuid === ob.planUuid && oa.secondes !== ob.secondes) {
            ajoute(a, b, `« ${a.titre} » et « ${b.titre} » donnent deux durées différentes à ${nomPlan(oa.planUuid)}.`);
          }
          if (oa.type === "remplacer_replique" && ob.type === "supprimer_replique" && oa.repliqueUuid === ob.repliqueUuid) {
            ajoute(a, b, `« ${a.titre} » modifie ${nomRep(oa.repliqueUuid)}, que « ${b.titre} » supprime.`);
          }
          if (oa.type === "remplacer_replique" && ob.type === "remplacer_replique" && oa.repliqueUuid === ob.repliqueUuid && oa.texte !== ob.texte) {
            ajoute(a, b, `« ${a.titre} » et « ${b.titre} » donnent deux textes différents à ${nomRep(oa.repliqueUuid)}.`);
          }
        }
      }
    }
  }
  return conflits;
}

/** Les RECOUPEMENTS : deux décisions qui demandent la même chose (même plan coupé, même durée, même texte). Ce n'est pas un conflit, mais
 * c'est ce que produit un modèle qui poste « seulement le 04 » comme une décision de plus au lieu de corriger la première : on le dit.
 * `ids` = [la plus ancienne, la plus récente] ; l'alerte se pose sur la plus récente. */
export function recoupementsEntreDecisions(decisions: DecisionPourConflit[], vue: VueEpisode): ConflitDecisions[] {
  const res: ConflitDecisions[] = [];
  const nomPlan = (uuid: string) => planParUuid(vue, uuid)?.handle ?? "un plan";
  const nomRep = (uuid: string) => repliqueParUuid(vue, uuid)?.handle ?? "une réplique";
  const vus = new Set<string>();
  for (const [i, b] of decisions.entries()) {
    for (const a of decisions.slice(0, i)) {
      for (const ob of b.operations) {
        for (const oa of a.operations) {
          let texte: string | null = null;
          if (oa.type === "couper_plan" && ob.type === "couper_plan" && oa.planUuid === ob.planUuid) texte = `${nomPlan(oa.planUuid)} est déjà coupé par ${a.id} « ${a.titre} ».`;
          else if (oa.type === "duree_plan" && ob.type === "duree_plan" && oa.planUuid === ob.planUuid && oa.secondes === ob.secondes) texte = `${nomPlan(oa.planUuid)} a déjà cette durée dans ${a.id} « ${a.titre} ».`;
          else if (oa.type === "supprimer_replique" && ob.type === "supprimer_replique" && oa.repliqueUuid === ob.repliqueUuid) texte = `${nomRep(oa.repliqueUuid)} est déjà supprimée par ${a.id} « ${a.titre} ».`;
          else if (oa.type === "remplacer_replique" && ob.type === "remplacer_replique" && oa.repliqueUuid === ob.repliqueUuid && oa.texte === ob.texte) texte = `${nomRep(oa.repliqueUuid)} a déjà ce texte dans ${a.id} « ${a.titre} ».`;
          if (!texte || vus.has(b.id + texte)) continue;
          vus.add(b.id + texte);
          res.push({ ids: [a.id, b.id], texte });
        }
      }
    }
  }
  return res;
}
