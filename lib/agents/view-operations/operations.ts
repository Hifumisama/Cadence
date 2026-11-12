import { DUREE_GENERATION_MAX, DUREE_GENERATION_MIN } from "../../clips/clip-checks";
import { estLiaison } from "../../clips/clip-link";
import type { Position } from "../types";
import { planParPoignee, type VueEpisode } from "./view-episode";
import { TYPES_OPERATION, type Operation, type OperationBrute, type OperationRefusee } from "./types";

/** Validates the operations the model proposes and translates them into STORABLE operations (uuids). Pure, tested.
 * The model cites handles (« P07 »): anything it invents is refused here, with a readable reason that the reply turn
 * can send back to it. Never a write on an unknown target. */

const texteNet = (v: string | null | undefined): string => (v ?? "").replace(/\r\n/g, "\n").trim();

export function validerOperations(brutes: OperationBrute[], vue: VueEpisode): { valides: Operation[]; refusees: OperationRefusee[] } {
  const valides: Operation[] = [];
  const refusees: OperationRefusee[] = [];
  const refuse = (brute: OperationBrute, raison: string) => refusees.push({ brute, raison });
  const nbPlans = vue.plans.length;

  for (const b of brutes) {
    if (!(TYPES_OPERATION as readonly string[]).includes(b.type)) {
      refuse(b, `Opération « ${b.type} » inconnue.`);
      continue;
    }

    if (b.type === "ajouter_plan") {
      const titre = texteNet(b.titre);
      const description = texteNet(b.description);
      const s = b.secondes;
      if (!titre) {
        refuse(b, "Un plan ajouté a besoin d'un titre (\"titre\").");
        continue;
      }
      if (typeof s !== "number" || !Number.isInteger(s) || s < DUREE_GENERATION_MIN || s > DUREE_GENERATION_MAX) {
        refuse(b, typeof s === "number" ? `Durée ${s} s pour le plan ajouté : un plan dure ${DUREE_GENERATION_MIN} à ${DUREE_GENERATION_MAX} s entières.` : `Le plan ajouté « ${titre} » n'a pas de durée : renseigne le champ "secondes" (entier de ${DUREE_GENERATION_MIN} à ${DUREE_GENERATION_MAX}) ; "consigne" ne sert qu'à refondre_fiche.`);
        continue;
      }
      let position: Position | null = null;
      if (b.avant && b.apres) {
        // « Entre P03 et P04 »: the two markers must be neighbours, otherwise we do not know where to place the clip.
        const apresPlan = planParPoignee(vue, b.apres);
        const avantPlan = planParPoignee(vue, b.avant);
        if (!apresPlan || !avantPlan) {
          refuse(b, `Repère « ${!apresPlan ? b.apres : b.avant} » introuvable pour placer le plan ajouté.`);
          continue;
        }
        if (avantPlan.position !== apresPlan.position + 1) {
          refuse(b, `${apresPlan.handle} et ${avantPlan.handle} ne se suivent pas : entre lesquels placer le plan ajouté ?`);
          continue;
        }
        position = { apresPlanUuid: apresPlan.uuid };
      } else if (b.avant) {
        const cible = planParPoignee(vue, b.avant);
        if (!cible) {
          refuse(b, `Repère « ${b.avant} » introuvable pour placer le plan ajouté.`);
          continue;
        }
        // « Avant P05 » = after the clip that precedes P05 (or at the start if it is the first): the draft and the application keep the reading order
        // of several clips added at the same place.
        const precedent = vue.plans[cible.position - 2];
        position = precedent ? { apresPlanUuid: precedent.uuid } : { debut: true };
      } else if (b.apres) {
        const cible = planParPoignee(vue, b.apres);
        if (!cible) {
          refuse(b, `Repère « ${b.apres} » introuvable pour placer le plan ajouté.`);
          continue;
        }
        position = { apresPlanUuid: cible.uuid };
      } else if (b.position === "debut") position = { debut: true };
      else if (b.position === "fin") position = { fin: true };
      if (!position) {
        refuse(b, "Où placer le plan ajouté ? Il faut \"avant\" ou \"apres\" un plan, ou \"position\" debut / fin.");
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
      // « avant », « apres » and « position » are alternatives: only one marker per move.
      if ([b.avant, b.apres, b.position].filter(Boolean).length > 1) {
        refuse(b, `Un seul repère pour déplacer ${p.handle} : « avant » un plan, « apres » un plan, ou « position » debut / fin.`);
        continue;
      }
      if (b.avant) {
        const cible = planParPoignee(vue, b.avant);
        if (!cible) {
          refuse(b, `Repère « ${b.avant} » introuvable pour déplacer ${p.handle}.`);
          continue;
        }
        if (cible.uuid === p.uuid) {
          refuse(b, `${p.handle} ne peut pas être placé avant lui-même.`);
          continue;
        }
        // « Avant P02 » = after the clip that precedes P02 (or at the start if it is the first).
        const precedent = vue.plans[cible.position - 2];
        if (precedent?.uuid === p.uuid) {
          refuse(b, `${p.handle} est déjà juste avant ${cible.handle}.`);
          continue;
        }
        position = precedent ? { apresPlanUuid: precedent.uuid } : { debut: true };
      } else if (b.apres) {
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
        refuse(b, `Où placer ${p.handle} ? Il faut « avant un plan », « après un plan », « debut » ou « fin ».`);
        continue;
      }
      valides.push({ type: "deplacer_plan", planUuid: p.uuid, position });
    } else {
      const titre = texteNet(b.titre);
      const description = texteNet(b.description);
      // The link with the previous clip: « suite » or « coupe » (the first clip has nothing to change: it is always a cut).
      const liaison = estLiaison(b.liaison) ? b.liaison : undefined;
      if (b.liaison && !liaison) {
        refuse(b, `${p.handle} : liaison « ${b.liaison} » inconnue (suite ou coupe).`);
        continue;
      }
      if (!titre && !description && !liaison) {
        refuse(b, `${p.handle} : ni nouveau titre, ni nouvelle description, ni nouvelle liaison.`);
        continue;
      }
      valides.push({ type: "modifier_plan", planUuid: p.uuid, ...(titre ? { titre } : {}), ...(description ? { description } : {}), ...(liaison ? { liaison } : {}) });
    }
  }
  return { valides, refusees };
}
