import { fmtDuree } from "./format";
import type { Constat, Operation } from "./types";
import { planParUuid, type VueEpisode } from "./vue-episode";

/** Les constats MÉCANIQUES, calculés par le code (jamais par le modèle) : ce qui est écrasé, ce qui devient périmé, ce qui bloque, la durée
 * contre l'objectif, les contradictions entre décisions. Purs, testés. Le modèle, lui, ne juge que le narratif (plan orphelin, ce qui n'a
 * pas de cause), et ses jugements portent `source: "modele"`. */

const alerte = (texte: string): Constat => ({ niveau: "alerte", texte, source: "code" });
const bloquant = (texte: string): Constat => ({ niveau: "bloquant", texte, source: "code" });
const ok = (texte: string): Constat => ({ niveau: "ok", texte, source: "code" });
const pluriel = (n: number, un: string, plusieurs: string) => (n > 1 ? plusieurs : un);

export function constatsOperations(operations: Operation[], vue: VueEpisode): Constat[] {
  const constats: Constat[] = [];
  for (const op of operations) {
    if (op.type === "ajouter_plan") {
      constats.push(ok(`Le plan « ${op.titre} » (${op.secondes} s) est créé sans fiche : elle est écrite juste après l'application, et tu la relis avant qu'elle soit enregistrée.`));
      continue;
    }
    if (op.type === "refondre_fiche") {
      const p = planParUuid(vue, op.planUuid);
      if (!p) continue;
      if (p.etat === "brouillon") constats.push(ok(`${p.handle} n'a pas encore de fiche : elle est écrite juste après l'application, à relire.`));
      else constats.push(ok(`La fiche de ${p.handle} est réécrite juste après l'application : tu relis la proposition avant qu'elle remplace l'ancienne.`));
      if (p.etat === "rendu") constats.push(alerte(`Le rendu de ${p.handle} sera périmé si tu acceptes la nouvelle fiche.`));
      continue;
    }
    if (op.type === "couper_plan") {
      const p = planParUuid(vue, op.planUuid);
      if (!p) continue;
      if (p.etat === "en_file") constats.push(bloquant(`Un rendu de ${p.handle} est en file ou en cours : l'annuler avant de supprimer le plan.`));
      else if (p.etat === "rendu") constats.push(alerte(`Écrase le rendu réussi de ${p.handle} : il disparaît avec le plan.`));
    } else if (op.type === "duree_plan") {
      const p = planParUuid(vue, op.planUuid);
      if (!p) continue;
      if (op.secondes === p.duree) constats.push(alerte(`${p.handle} dure déjà ${p.duree} s : rien ne change.`));
      else if (p.etat === "rendu") constats.push(alerte(`Rend périmé le rendu de ${p.handle} : la durée soumise au rendu n'est plus la sienne.`));
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
 * couper un plan qu'une autre décision modifie ou déplace, déplacer après un plan coupé, deux durées différentes pour
 * le même plan. */
export function conflitsEntreDecisions(decisions: DecisionPourConflit[], vue: VueEpisode): ConflitDecisions[] {
  const conflits: ConflitDecisions[] = [];
  const nomPlan = (uuid: string) => planParUuid(vue, uuid)?.handle ?? "un plan";
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
            if (ob.type === "refondre_fiche" && ob.planUuid === oa.planUuid) {
              ajoute(a, b, `« ${a.titre} » coupe ${nomPlan(oa.planUuid)}, dont « ${b.titre} » veut refondre la fiche.`);
            }
            if (ob.type === "ajouter_plan" && "apresPlanUuid" in ob.position && ob.position.apresPlanUuid === oa.planUuid) {
              ajoute(a, b, `« ${b.titre} » ajoute un plan après ${nomPlan(oa.planUuid)}, que « ${a.titre} » coupe.`);
            }
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
  const vus = new Set<string>();
  for (const [i, b] of decisions.entries()) {
    for (const a of decisions.slice(0, i)) {
      for (const ob of b.operations) {
        for (const oa of a.operations) {
          let texte: string | null = null;
          if (oa.type === "couper_plan" && ob.type === "couper_plan" && oa.planUuid === ob.planUuid) texte = `${nomPlan(oa.planUuid)} est déjà coupé par ${a.id} « ${a.titre} ».`;
          else if (oa.type === "duree_plan" && ob.type === "duree_plan" && oa.planUuid === ob.planUuid && oa.secondes === ob.secondes) texte = `${nomPlan(oa.planUuid)} a déjà cette durée dans ${a.id} « ${a.titre} ».`;
          if (!texte || vus.has(b.id + texte)) continue;
          vus.add(b.id + texte);
          res.push({ ids: [a.id, b.id], texte });
        }
      }
    }
  }
  return res;
}
