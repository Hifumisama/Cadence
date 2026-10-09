import { appliquerAuBrouillon, plansTouches } from "./brouillon";
import { fmtDuree } from "./format";
import type { Operation, StatutDecision } from "./types";
import type { VueEpisode } from "./vue-episode";

/** Ce que l'écran de la révision montre, calculé SANS base ni React (pur, testé) : les scènes que le brouillon touche (et elles seulement),
 * et la phrase de la barre du bas avec l'état de la glissière. Port de la maquette (docs/maquettes/revision-episode.html). */

export type RepliqueScene = { handle: string; locuteur: string; texte: string; texteOriginal: string; supprimee: boolean };

export type PlanScene = {
  uuid: string;
  handle: string;
  titre: string;
  duree: number;
  dureeOriginale: number;
  coupe: boolean;
  deplace: boolean;
  /** Plan ajouté par le brouillon (il n'existe pas encore). */
  ajoute: boolean;
  /** Sa fiche est écrite ou réécrite juste après l'application. */
  fiche: boolean;
  etat: string;
  repliques: RepliqueScene[];
};

export type SceneTouchee = { titre: string; dureeAvant: number; dureeApres: number; plans: PlanScene[] };

/** Les scènes touchées par ces opérations, avec leurs plans dans l'ordre du brouillon. Une scène non touchée n'y figure pas ; un plan
 * déplacé reste rangé dans sa scène d'origine (il est signalé « déplacé »). */
export function scenesTouchees(vue: VueEpisode, operations: Operation[]): SceneTouchee[] {
  if (operations.length === 0) return [];
  const brouillon = appliquerAuBrouillon(vue, operations);
  const touches = plansTouches(operations, vue);
  const parUuid = new Map(vue.plans.map((p) => [p.uuid, p]));
  const repParUuid = new Map(brouillon.repliques.map((r) => [r.uuid, r]));
  // Un plan ajouté rejoint la scène du plan qui le précède dans le brouillon (ou, en tête d'épisode, celle du premier plan existant).
  const sceneDe = new Map<string, string>();
  let derniere: string | null = null;
  for (const b of brouillon.plans) {
    const reel = parUuid.get(b.uuid);
    if (reel) derniere = reel.sceneTitre ?? "Sans scène";
    if (reel || derniere) sceneDe.set(b.uuid, derniere!);
  }
  const premiere = vue.plans[0]?.sceneTitre ?? "Sans scène";
  const nomScene = (uuid: string) => sceneDe.get(uuid) ?? premiere;

  const titres: string[] = [];
  for (const p of vue.plans) {
    const t = p.sceneTitre ?? "Sans scène";
    if (!titres.includes(t)) titres.push(t);
  }
  const touchees = new Set([...touches].map(nomScene));

  return titres
    .filter((t) => touchees.has(t))
    .map((titre) => {
      const plans = brouillon.plans
        .filter((b) => nomScene(b.uuid) === titre)
        .map((b): PlanScene => {
          const p = parUuid.get(b.uuid);
          return {
            uuid: b.uuid,
            handle: b.handle,
            titre: b.titre,
            duree: b.duree,
            dureeOriginale: b.dureeOriginale,
            coupe: b.coupe,
            deplace: b.deplace,
            ajoute: b.ajoute,
            fiche: b.fiche,
            etat: p?.etat ?? "brouillon",
            repliques: (p?.repliques ?? []).flatMap((u) => {
              const r = repParUuid.get(u);
              return r ? [{ handle: r.handle, locuteur: r.locuteur, texte: r.texte, texteOriginal: r.texteOriginal, supprimee: r.supprimee }] : [];
            }),
          };
        });
      return {
        titre,
        dureeAvant: plans.reduce((a, p) => a + p.dureeOriginale, 0),
        dureeApres: plans.reduce((a, p) => a + (p.coupe ? 0 : p.duree), 0),
        plans,
      };
    });
}

export type Segment = { t: string; fort?: boolean; rouge?: boolean };

export type DecisionPourBarre = {
  id: string;
  statut: StatutDecision;
  aReverifier: boolean;
  operations: Operation[];
  /** Combien d'éléments validés (rendu réussi, prise validée) cette décision écrase. */
  ecrasements: number;
};

export type ResumeChantier = {
  segments: Segment[];
  /** La glissière ne se tire pas : rien à appliquer, un conflit, ou une décision à relire. */
  inerte: boolean;
  /** La glissière est rouge : l'application écrase des éléments validés (le geste vaut confirmation). */
  danger: boolean;
};

const pl = (n: number, un: string, plusieurs: string) => (n > 1 ? plusieurs : un);

/** La phrase de la barre du bas : ce que l'application va faire, ou ce qui manque. */
export function resumerChantier(decisions: DecisionPourBarre[], dureeAvecBrouillon: number, objectifSecondes: number | null): ResumeChantier {
  if (decisions.length === 0) return { segments: [{ t: "Rien en brouillon. Dis ce que tu veux changer." }], inerte: true, danger: false };

  const conflits = decisions.filter((d) => d.statut === "conflit");
  const aRelire = decisions.filter((d) => !conflits.includes(d) && d.aReverifier);
  const ops = decisions.flatMap((d) => d.operations);
  const coupes = new Set(ops.filter((o) => o.type === "couper_plan").map((o) => (o as { planUuid: string }).planUuid));
  const durees = new Set(ops.filter((o) => o.type === "duree_plan").map((o) => (o as { planUuid: string }).planUuid).filter((u) => !coupes.has(u)));
  const deplaces = new Set(ops.filter((o) => o.type === "deplacer_plan").map((o) => (o as { planUuid: string }).planUuid).filter((u) => !coupes.has(u)));
  const ajoutes = ops.filter((o) => o.type === "ajouter_plan").length;
  const fiches = new Set([...ops.filter((o) => o.type === "refondre_fiche").map((o) => (o as { planUuid: string }).planUuid).filter((u) => !coupes.has(u)), ...ops.filter((o) => o.type === "ajouter_plan").map((o) => (o as { ref: string }).ref)]);
  const repliquesChangees = new Set(ops.filter((o) => o.type === "remplacer_replique").map((o) => (o as { repliqueUuid: string }).repliqueUuid));
  const repliquesSupprimees = new Set(ops.filter((o) => o.type === "supprimer_replique").map((o) => (o as { repliqueUuid: string }).repliqueUuid));
  const ecrasements = decisions.reduce((a, d) => a + d.ecrasements, 0);

  const faits: Segment[][] = [];
  if (ajoutes) faits.push([{ t: "ajoute " }, { t: `${ajoutes} plan${pl(ajoutes, "", "s")}`, fort: true }]);
  if (coupes.size) faits.push([{ t: "supprime " }, { t: `${coupes.size} plan${pl(coupes.size, "", "s")}`, fort: true }]);
  if (durees.size) faits.push([{ t: "raccourcit " }, { t: `${durees.size} durée${pl(durees.size, "", "s")}`, fort: true }]);
  if (deplaces.size) faits.push([{ t: "déplace " }, { t: `${deplaces.size} plan${pl(deplaces.size, "", "s")}`, fort: true }]);
  if (repliquesChangees.size) faits.push([{ t: "change " }, { t: `${repliquesChangees.size} réplique${pl(repliquesChangees.size, "", "s")}`, fort: true }]);
  if (repliquesSupprimees.size) faits.push([{ t: "supprime " }, { t: `${repliquesSupprimees.size} réplique${pl(repliquesSupprimees.size, "", "s")}`, fort: true }]);
  if (fiches.size) faits.push([{ t: "réécrit " }, { t: `${fiches.size} fiche${pl(fiches.size, "", "s")}`, fort: true }, { t: " ensuite" }]);
  const segments: Segment[] = [];
  if (conflits.length) {
    segments.push({ t: "Il manque : " }, { t: conflits.length > 1 ? `trancher ${conflits.length} conflits` : "trancher le conflit", rouge: true, fort: true }, { t: " avant d'appliquer. " });
  } else if (aRelire.length) {
    segments.push({ t: "Il manque : " }, { t: `relire ${aRelire.map((d) => d.id).join(", ")}`, rouge: true, fort: true }, { t: " (ce qu'elle vise a changé). " });
  }
  segments.push({ t: `${decisions.length} décision${pl(decisions.length, "", "s")}` });
  if (faits.length) {
    segments.push({ t: " : " });
    faits.forEach((f, i) => {
      if (i > 0) segments.push({ t: ", " });
      segments.push(...f);
    });
  }
  segments.push({ t: ` · ${fmtDuree(dureeAvecBrouillon)}${objectifSecondes != null ? ` pour ${fmtDuree(objectifSecondes)}` : ""}` });
  if (ecrasements) segments.push({ t: " · " }, { t: `écrase ${ecrasements} élément${pl(ecrasements, "", "s")} validé${pl(ecrasements, "", "s")}`, rouge: true, fort: true });

  return { segments, inerte: conflits.length > 0 || aRelire.length > 0, danger: ecrasements > 0 };
}
