import { DUREE_GENERATION_MAX, DUREE_GENERATION_MIN } from "../../plan-checks";
import type { Position } from "../types";
import { planParPoignee, planParUuid, repliqueParPoignee, repliqueParUuid, type VueEpisode } from "./vue-episode";
import { TYPES_OPERATION, type Operation, type OperationBrute, type OperationRefusee } from "./types";

/** Valide les opérations que le modèle propose et les traduit en opérations STOCKABLES (uuid). Pur, testé.
 * Le modèle cite des poignées (« P07 ») : tout ce qu'il invente est refusé ici, avec une raison lisible que le tour de réponse
 * peut lui renvoyer. Jamais d'écriture sur une cible inconnue. */

const texteNet = (v: string | null | undefined): string => (v ?? "").replace(/\r\n/g, "\n").trim();

export function validerOperations(brutes: OperationBrute[], vue: VueEpisode): { valides: Operation[]; refusees: OperationRefusee[] } {
  const valides: Operation[] = [];
  const refusees: OperationRefusee[] = [];
  const refuse = (brute: OperationBrute, raison: string) => refusees.push({ brute, raison });
  const nbPlans = vue.plans.length;
  const nbRepliques = vue.repliques.length;

  for (const b of brutes) {
    if (!(TYPES_OPERATION as readonly string[]).includes(b.type)) {
      refuse(b, `Opération « ${b.type} » inconnue.`);
      continue;
    }

    if (b.type === "supprimer_replique" || b.type === "remplacer_replique") {
      const r = repliqueParPoignee(vue, b.replique);
      if (!r) {
        refuse(b, `Réplique « ${b.replique ?? "?"} » introuvable (l'épisode a ${nbRepliques} réplique${nbRepliques > 1 ? "s" : ""}).`);
        continue;
      }
      if (b.type === "supprimer_replique") {
        valides.push({ type: "supprimer_replique", repliqueUuid: r.uuid });
        continue;
      }
      const texte = texteNet(b.texte);
      const locuteur = texteNet(b.locuteur);
      if (!texte && !locuteur) {
        refuse(b, `La réplique ${r.handle} n'a ni nouveau texte ni nouveau locuteur.`);
        continue;
      }
      valides.push({ type: "remplacer_replique", repliqueUuid: r.uuid, ...(texte ? { texte } : {}), ...(locuteur ? { locuteur } : {}) });
      continue;
    }

    if (b.type === "ajouter_plan") {
      const titre = texteNet(b.titre);
      const description = texteNet(b.description);
      const s = b.secondes;
      if (!titre) {
        refuse(b, "Un plan ajouté a besoin d'un titre.");
        continue;
      }
      if (typeof s !== "number" || !Number.isInteger(s) || s < DUREE_GENERATION_MIN || s > DUREE_GENERATION_MAX) {
        refuse(b, `Durée ${typeof s === "number" ? `${s} s` : "absente"} pour le plan ajouté : un plan dure ${DUREE_GENERATION_MIN} à ${DUREE_GENERATION_MAX} s entières.`);
        continue;
      }
      let position: Position | null = null;
      if (b.apres) {
        const cible = planParPoignee(vue, b.apres);
        if (!cible) {
          refuse(b, `Repère « ${b.apres} » introuvable pour placer le plan ajouté.`);
          continue;
        }
        position = { apresPlanUuid: cible.uuid };
      } else if (b.position === "debut") position = { debut: true };
      else if (b.position === "fin") position = { fin: true };
      if (!position) {
        refuse(b, "Où placer le plan ajouté ? Il faut « après un plan », « debut » ou « fin ».");
        continue;
      }
      valides.push({ type: "ajouter_plan", ref: globalThis.crypto.randomUUID(), position, titre, description, secondes: s });
      continue;
    }

    const p = planParPoignee(vue, b.plan);
    if (!p) {
      refuse(b, `Plan « ${b.plan ?? "?"} » introuvable (l'épisode a ${nbPlans} plan${nbPlans > 1 ? "s" : ""}).`);
      continue;
    }

    if (b.type === "couper_plan") {
      valides.push({ type: "couper_plan", planUuid: p.uuid });
    } else if (b.type === "refondre_fiche") {
      valides.push({ type: "refondre_fiche", planUuid: p.uuid, consigne: texteNet(b.consigne) });
    } else if (b.type === "duree_plan") {
      const s = b.secondes;
      if (typeof s !== "number" || !Number.isInteger(s) || s < DUREE_GENERATION_MIN || s > DUREE_GENERATION_MAX) {
        refuse(b, `Durée ${typeof s === "number" ? `${s} s` : "absente"} pour ${p.handle} : un plan dure ${DUREE_GENERATION_MIN} à ${DUREE_GENERATION_MAX} s entières.`);
        continue;
      }
      valides.push({ type: "duree_plan", planUuid: p.uuid, secondes: s });
    } else if (b.type === "deplacer_plan") {
      let position: Position | null = null;
      if (b.apres) {
        const cible = planParPoignee(vue, b.apres);
        if (!cible) {
          refuse(b, `Repère « ${b.apres} » introuvable pour déplacer ${p.handle}.`);
          continue;
        }
        if (cible.uuid === p.uuid) {
          refuse(b, `${p.handle} ne peut pas être placé après lui-même.`);
          continue;
        }
        position = { apresPlanUuid: cible.uuid };
      } else if (b.position === "debut") position = { debut: true };
      else if (b.position === "fin") position = { fin: true };
      if (!position) {
        refuse(b, `Où placer ${p.handle} ? Il faut « après un plan », « debut » ou « fin ».`);
        continue;
      }
      valides.push({ type: "deplacer_plan", planUuid: p.uuid, position });
    } else {
      const titre = texteNet(b.titre);
      const description = texteNet(b.description);
      if (!titre && !description) {
        refuse(b, `${p.handle} : ni nouveau titre ni nouvelle description.`);
        continue;
      }
      valides.push({ type: "modifier_plan", planUuid: p.uuid, ...(titre ? { titre } : {}), ...(description ? { description } : {}) });
    }
  }
  return { valides, refusees };
}

/** L'opération stockée (uuid) redite avec les poignées D'AUJOURD'HUI : c'est ce que le modèle relit dans les décisions et les pistes en
 * cours. Une cible disparue devient « ? ». */
export function operationEnPoignees(op: Operation, vue: VueEpisode): OperationBrute {
  const plan = (uuid: string) => planParUuid(vue, uuid)?.handle ?? "?";
  const replique = (uuid: string) => repliqueParUuid(vue, uuid)?.handle ?? "?";
  switch (op.type) {
    case "couper_plan":
      return { type: op.type, plan: plan(op.planUuid) };
    case "duree_plan":
      return { type: op.type, plan: plan(op.planUuid), secondes: op.secondes };
    case "deplacer_plan":
      return {
        type: op.type,
        plan: plan(op.planUuid),
        ...("apresPlanUuid" in op.position ? { apres: plan(op.position.apresPlanUuid) } : { position: "debut" in op.position ? "debut" : "fin" }),
      };
    case "modifier_plan":
      return { type: op.type, plan: plan(op.planUuid), ...(op.titre !== undefined ? { titre: op.titre } : {}), ...(op.description !== undefined ? { description: op.description } : {}) };
    case "remplacer_replique":
      return { type: op.type, replique: replique(op.repliqueUuid), ...(op.texte !== undefined ? { texte: op.texte } : {}), ...(op.locuteur !== undefined ? { locuteur: op.locuteur } : {}) };
    case "supprimer_replique":
      return { type: op.type, replique: replique(op.repliqueUuid) };
    case "refondre_fiche":
      return { type: op.type, plan: plan(op.planUuid), ...(op.consigne ? { consigne: op.consigne } : {}) };
    case "ajouter_plan":
      return {
        type: op.type,
        ...("apresPlanUuid" in op.position ? { apres: plan(op.position.apresPlanUuid) } : { position: "debut" in op.position ? "debut" : "fin" }),
        titre: op.titre,
        description: op.description,
        secondes: op.secondes,
      };
  }
}
