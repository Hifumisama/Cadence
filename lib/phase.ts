/** Phase du pipeline (Scénario -> Fiche de plan -> Assets -> Shots),
 * dérivée automatiquement des statuts de plans d'un épisode — jamais
 * saisie à la main (retour utilisateur 2026-09-28, voir docs/FRICTIONS.md).
 * Porté depuis la maquette Opus du même jour. */

import type { plans } from "@/db/schema";

export type PlanStatut = (typeof plans.$inferSelect)["statut"];

/** Regroupement des 7 statuts de plan en 4 buckets d'affichage — "actif"
 * couvre tout ce qui a dépassé le brouillon sans être fini (en_cours,
 * rejoue, echoue, previsualise) : le détail de ces 4 états compte pour la
 * frise Shots, pas pour cette vue d'ensemble par épisode/saison/projet. */
export type StatutBuckets = { termine: number; actif: number; attente: number; brouillon: number };

export function bucketsVides(): StatutBuckets {
  return { termine: 0, actif: 0, attente: 0, brouillon: 0 };
}

export function bucketiserStatuts(statuts: PlanStatut[]): StatutBuckets {
  const b = bucketsVides();
  for (const s of statuts) {
    if (s === "termine") b.termine++;
    else if (s === "brouillon") b.brouillon++;
    else if (s === "en_attente") b.attente++;
    else b.actif++; // en_cours | rejoue | echoue | previsualise
  }
  return b;
}

export function additionnerBuckets(a: StatutBuckets, b: StatutBuckets): StatutBuckets {
  return { termine: a.termine + b.termine, actif: a.actif + b.actif, attente: a.attente + b.attente, brouillon: a.brouillon + b.brouillon };
}

export function totalBuckets(b: StatutBuckets): number {
  return b.termine + b.actif + b.attente + b.brouillon;
}

export type Phase = "vide" | "ecriture" | "fiches" | "prod" | "fini";

export const PHASES: Record<Phase, { label: string; ordre: number }> = {
  vide: { label: "Vide", ordre: 0 },
  ecriture: { label: "Scénario en écriture", ordre: 1 },
  fiches: { label: "Fiches en cours", ordre: 2 },
  prod: { label: "En production", ordre: 3 },
  fini: { label: "Terminé", ordre: 4 },
};

/** Un épisode qui a au moins un plan terminé (même sans plan "actif")
 * compte comme "en production", pas "fiches en cours" — sinon un épisode à
 * moitié tourné puis mis en pause retomberait à tort dans l'étape
 * précédente (retour utilisateur, révision de la maquette v2). */
export function phaseDe(b: StatutBuckets): Phase {
  const n = totalBuckets(b);
  if (!n) return "vide";
  if (b.termine === n) return "fini";
  if (b.actif || b.termine) return "prod";
  if (b.brouillon === n) return "ecriture";
  return "fiches";
}

/** Statut agrégé d'un épisode/saison, pour réutiliser tel quel StatusBadge
 * et statusNodeClass (composants/ui/StatusBadge.tsx) plutôt que d'inventer
 * un système de badge parallèle — "en_attente" sert aussi de repli visuel
 * pour "vide" (anneau creux, sans couleur : sémantiquement proche). */
export function statutAgrege(b: StatutBuckets): PlanStatut {
  const n = totalBuckets(b);
  if (!n) return "en_attente";
  if (b.termine === n) return "termine";
  if (b.actif) return "en_cours";
  if (b.brouillon === n) return "brouillon";
  return "en_attente";
}

export type PhaseAgregee = { phase: Phase | "mixte"; detail: string | null; bornes: [number, number] };

/** Agrège les phases de plusieurs épisodes (saison) : une seule phase si
 * elles sont toutes identiques, "mixte" sinon — jamais une phase choisie
 * arbitrairement qui mentirait sur l'état réel de la saison. */
export function agregerPhases(phases: Phase[]): PhaseAgregee {
  if (phases.length === 0) return { phase: "vide", detail: null, bornes: [0, 0] };
  const uniques = [...new Set(phases)];
  if (uniques.length === 1) {
    const p = uniques[0]!;
    return { phase: p, detail: null, bornes: [PHASES[p].ordre, PHASES[p].ordre] };
  }
  const ordres = uniques.map((p) => PHASES[p].ordre);
  const bornes: [number, number] = [Math.min(...ordres), Math.max(...ordres)];
  const ordreAffichage: Phase[] = ["prod", "fiches", "ecriture", "fini", "vide"];
  const detail = ordreAffichage
    .filter((p) => uniques.includes(p))
    .map((p) => `${phases.filter((x) => x === p).length} ${PHASES[p].label.toLowerCase()}`)
    .join(" · ");
  return { phase: "mixte", detail, bornes };
}
