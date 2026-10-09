import { appliquerAuBrouillon } from "./brouillon";
import { validerOperations } from "./operations";
import type { Constat, Operation, OperationBrute, Piste, StatutDecision } from "./types";
import type { VueEpisode } from "./vue-episode";

/** Ce que le modèle rend pour un tour (skill `realisateur-analyse`) et ce que le code en fait. `interpreterAnalyse` est PUR : il
 * valide, crée, modifie, retire, choisit des pistes, retient les jugements narratifs ; la base ne sert qu'à charger l'état avant et
 * à le ranger après (revision-db.ts). Les décisions sont désignées par un identifiant COURT (« D3 » = la 3e créée dans cette
 * conversation, jamais réutilisé). */

export type SortieAnalyse = {
  reflexion?: string;
  decisions: { id: string | null; titre: string; raison: string; operations: OperationBrute[] }[];
  retirer: string[];
  pistes: { titre: string; resume: string; operations: OperationBrute[] }[];
  /** Numéros (base 1) des pistes en attente que l'utilisateur accepte. */
  retenirPistes: number[];
  /** Les jugements que seul le modèle peut porter (plan orphelin, réplique sans cause, contradiction narrative). */
  narratif: { decision: string; niveau: "alerte" | "conflit"; texte: string }[];
};

export type DecisionEtat = {
  /** Numéro dans la conversation (D1, D2…), monotone. */
  ordre: number;
  titre: string;
  raison: string;
  operations: Operation[];
  /** Les constats du MODÈLE (source « modele »), conservés tant que la décision ne change pas. */
  narratifs: Constat[];
};

export type EtatAvantTour = { vue: VueEpisode; decisions: DecisionEtat[]; pistes: Piste[]; ordreSuivant: number };

export type ResultatAnalyse = {
  decisions: DecisionEtat[];
  pistes: Piste[];
  ordreSuivant: number;
  creees: number[];
  modifiees: number[];
  retirees: number[];
  pistesChoisies: number[];
  refus: { contexte: string; raison: string }[];
};

export const idCourt = (ordre: number): string => `D${ordre}`;

export function ordreDeDecision(id: string | null | undefined): number | null {
  const m = /^\s*D\s*0*(\d+)\s*$/i.exec(id ?? "");
  const n = m ? Number(m[1]) : NaN;
  return Number.isInteger(n) && n > 0 ? n : null;
}

const MAX_PISTES = 3;
const signature = (ops: Operation[]): string => JSON.stringify(ops);

export function interpreterAnalyse(etat: EtatAvantTour, sortie: SortieAnalyse): ResultatAnalyse {
  const decisions: DecisionEtat[] = etat.decisions.map((d) => ({ ...d, operations: [...d.operations], narratifs: [...d.narratifs] }));
  let pistes = etat.pistes;
  let ordreSuivant = etat.ordreSuivant;
  const creees: number[] = [];
  const modifiees: number[] = [];
  const retirees: number[] = [];
  const pistesChoisies: number[] = [];
  const refus: ResultatAnalyse["refus"] = [];
  const parOrdre = (n: number) => decisions.find((d) => d.ordre === n);

  for (const id of sortie.retirer ?? []) {
    const n = ordreDeDecision(id);
    const d = n != null ? parOrdre(n) : undefined;
    if (!d) {
      refus.push({ contexte: `Retirer ${id}`, raison: `Décision « ${id} » introuvable.` });
      continue;
    }
    decisions.splice(decisions.indexOf(d), 1);
    retirees.push(d.ordre);
  }

  const creer = (titre: string, raison: string, operations: Operation[]) => {
    const doublon = decisions.find((d) => signature(d.operations) === signature(operations));
    if (doublon) return; // le modèle répète une décision déjà retenue : pas de doublon
    const d: DecisionEtat = { ordre: ordreSuivant++, titre: titre.trim().slice(0, 200) || "Décision", raison: raison.trim(), operations, narratifs: [] };
    decisions.push(d);
    creees.push(d.ordre);
  };

  for (const proposee of sortie.decisions ?? []) {
    const { valides, refusees } = validerOperations(proposee.operations ?? [], etat.vue);
    for (const r of refusees) refus.push({ contexte: `Décision « ${proposee.titre} »`, raison: r.raison });
    if (valides.length === 0) {
      if (refusees.length === 0) refus.push({ contexte: `Décision « ${proposee.titre} »`, raison: "Aucune opération." });
      continue;
    }
    const n = ordreDeDecision(proposee.id);
    const existante = n != null ? parOrdre(n) : undefined;
    if (proposee.id && !existante) {
      refus.push({ contexte: `Décision « ${proposee.titre} »`, raison: `Décision « ${proposee.id} » introuvable : elle n'a pas été modifiée.` });
      continue;
    }
    if (existante) {
      existante.titre = proposee.titre.trim().slice(0, 200) || existante.titre;
      existante.raison = proposee.raison.trim();
      existante.operations = valides;
      existante.narratifs = []; // la décision a changé : les jugements d'avant ne la concernent plus
      if (!modifiees.includes(existante.ordre)) modifiees.push(existante.ordre);
    } else {
      creer(proposee.titre, proposee.raison, valides);
    }
  }

  for (const numero of sortie.retenirPistes ?? []) {
    const piste = etat.pistes[numero - 1];
    if (!piste) {
      refus.push({ contexte: `Piste ${numero}`, raison: `Piste ${numero} introuvable (il y en a ${etat.pistes.length}).` });
      continue;
    }
    pistesChoisies.push(numero);
    creer(piste.titre, piste.resume, piste.operations);
  }

  if (pistesChoisies.length > 0) pistes = [];
  if ((sortie.pistes ?? []).length > 0) {
    const nouvelles: Piste[] = [];
    for (const p of sortie.pistes.slice(0, MAX_PISTES)) {
      const { valides, refusees } = validerOperations(p.operations ?? [], etat.vue);
      for (const r of refusees) refus.push({ contexte: `Piste « ${p.titre} »`, raison: r.raison });
      if (valides.length > 0) nouvelles.push({ titre: p.titre.trim(), resume: p.resume.trim(), operations: valides });
    }
    if (nouvelles.length > 0) pistes = nouvelles;
  }

  for (const nar of sortie.narratif ?? []) {
    const n = ordreDeDecision(nar.decision);
    const d = n != null ? parOrdre(n) : undefined;
    if (!d || !nar.texte.trim()) continue;
    const constat: Constat = { niveau: nar.niveau === "conflit" ? "bloquant" : "alerte", texte: nar.texte.trim(), source: "modele" };
    if (!d.narratifs.some((c) => c.texte === constat.texte)) d.narratifs.push(constat);
  }

  return { decisions, pistes, ordreSuivant, creees, modifiees, retirees, pistesChoisies, refus };
}

/** Le statut d'une décision, DÉRIVÉ de ses constats : un bloquant (ou un conflit) la met « en conflit » (elle empêche d'appliquer),
 * une alerte « à surveiller », sinon « retenue ». */
export function statutDeDecision(constats: Constat[], enConflit: boolean): StatutDecision {
  if (enConflit || constats.some((c) => c.niveau === "bloquant")) return "conflit";
  if (constats.some((c) => c.niveau === "alerte")) return "attention";
  return "retenue";
}

/** Les chiffres d'une piste à côté du brouillon courant : combien de secondes elle fait gagner, et la durée qui en résulte. */
export function chiffresPiste(vue: VueEpisode, operationsDuBrouillon: Operation[], piste: Piste): { gain: number; totalApres: number } {
  const avant = appliquerAuBrouillon(vue, operationsDuBrouillon).total;
  const apres = appliquerAuBrouillon(vue, [...operationsDuBrouillon, ...piste.operations]).total;
  return { gain: avant - apres, totalApres: apres };
}
