import type { CibleType } from "../types";
import { applicateurAsset } from "./asset";
import { applicateurBrief } from "./brief";
import { applicateurFiche } from "./fiche";
import { applicateurPlan } from "./plan";
import { applicateurReplique } from "./replique";
import { applicateurVoix } from "./voix";
import type { Applicateur } from "./commun";
import { applicateurEpisode, applicateurProjet, applicateurSaison, applicateurScene } from "./structure";

/** Registre des applicateurs par type de cible. Une cible sans applicateur n'est PAS
 * écrite en silence : `refusSansApplicateur` produit un refus explicite. */
const REGISTRE: Partial<Record<CibleType, Applicateur>> = {
  brief: applicateurBrief,
  projet: applicateurProjet,
  saison: applicateurSaison,
  episode: applicateurEpisode,
  scene: applicateurScene,
  asset: applicateurAsset,
  plan: applicateurPlan,
  replique: applicateurReplique,
  voix: applicateurVoix,
  fiche: applicateurFiche,
};

export function applicateurDe(type: string): Applicateur | null {
  return REGISTRE[type as CibleType] ?? null;
}

export function refusSansApplicateur(type: string): string {
  return `Non pris en charge pour l'instant : « ${type} » ne s'écrit pas encore par une proposition.`;
}

export type { Applicateur } from "./commun";
