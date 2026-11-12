/** Pipeline phase (Screenplay -> Clip sheet -> Assets -> Clips),
 * derived automatically from the clip statuses of an episode — never
 * entered by hand (user feedback 2026-09-28, see docs/FRICTIONS.md).
 * Ported from the Opus mockup of the same day. */

import type { plans } from "@/db/schema";

export type PlanStatut = (typeof plans.$inferSelect)["statut"];

/** Grouping of the 7 clip statuses into 4 display buckets — "actif"
 * covers everything that has gone past draft without being finished (en_cours,
 * rejoue, echoue, previsualise): the detail of these 4 states matters for the
 * clip strip, not for this per-episode/project overview. */
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

/** An episode that has at least one finished clip (even without an "actif" clip)
 * counts as "en production", not "fiches en cours" — otherwise an episode
 * half-shot then paused would wrongly fall back into the previous step
 * (user feedback, review of the v2 mockup). */
export function phaseDe(b: StatutBuckets): Phase {
  const n = totalBuckets(b);
  if (!n) return "vide";
  if (b.termine === n) return "fini";
  if (b.actif || b.termine) return "prod";
  if (b.brouillon === n) return "ecriture";
  return "fiches";
}

