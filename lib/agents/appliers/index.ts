import type { CibleType } from "../types";
import { applicateurAsset } from "./asset";
import { applicateurBrief } from "./brief";
import { applicateurFiche } from "./sheet";
import { applicateurPlan } from "./clip";
import type { Applicateur } from "./common";
import { applicateurEpisode, applicateurProjet, applicateurScene } from "./structure";

/** Registry of appliers by target type. A target without an applier is NOT
 * written silently: `refusSansApplicateur` produces an explicit refusal. */
const REGISTRE: Partial<Record<CibleType, Applicateur>> = {
  brief: applicateurBrief,
  projet: applicateurProjet,
  episode: applicateurEpisode,
  scene: applicateurScene,
  asset: applicateurAsset,
  plan: applicateurPlan,
  fiche: applicateurFiche,
};

export function applicateurDe(type: string): Applicateur | null {
  return REGISTRE[type as CibleType] ?? null;
}

export function refusSansApplicateur(type: string): string {
  return `Non pris en charge pour l'instant : « ${type} » ne s'écrit pas encore par une proposition.`;
}

export type { Applicateur } from "./common";
