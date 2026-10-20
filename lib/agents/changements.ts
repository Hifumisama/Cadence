import type { Avertissement, CibleType, Operation, Position } from "./types";

/** Un changement tel que le construisent les convertisseurs (squelette, sorties de
 * skills) AVANT enrichissement par l'applicateur de sa cible (état courant, écrasement,
 * contrôles). Pur : aucune lecture. */
export type ChangementBrut = {
  /** Groupe d'affichage stable : brief | projet | episodes | scenes | plans | fiches | assets
   * (un lot : `ep-<id>`, un groupe par épisode). */
  groupe: string;
  /** Clé symbolique d'une création (« episode-2 ») citée par ses enfants. */
  cle?: string | null;
  cibleType: CibleType;
  /** Référence stable de l'existant (id interne, uuid du plan, clé de section) ; null = création. */
  cibleRef: string | null;
  libelle: string;
  operation: Operation;
  avant?: unknown;
  apres?: unknown;
  position?: Position | null;
  avertissements?: Avertissement[];
  ecrase?: string | null;
  /** Refusé d'office (non pris en charge, hors portée, parent refusé). */
  refuseRaison?: string | null;
  /** Lot : titre de la scène sous laquelle la revue range ce plan ou cette réplique. */
  sousGroupe?: string | null;
  /** Coché d'office MALGRÉ la règle (suppression décochée par défaut) : le convertisseur sait que le geste est sans risque (un plan sans fiche ni
   * rendu que la relecture du scénario fusionne dans son voisin). N'enlève jamais un refus, un blocage ni un écrasement (cochage.ts). */
  cocheOffice?: boolean;
};

/** Une ligne de proposition_changements, jsonb en `unknown`. */
export type LigneChangement = {
  id: number;
  propositionId: number;
  ordre: number;
  groupe: string;
  cle: string | null;
  cibleType: CibleType;
  cibleRef: string | null;
  libelle: string;
  operation: Operation;
  avant: unknown;
  apres: unknown;
  position: Position | null;
  avertissements: Avertissement[];
  ecrase: string | null;
  coche: boolean;
  refuseRaison: string | null;
  sousGroupe?: string | null;
};

export const TITRES_GROUPES: Record<string, string> = {
  ecrasement: "Risque d'écrasement",
  brief: "Brief",
  projet: "Projet",
  episodes: "Épisodes",
  scenes: "Scènes",
  plans: "Plans",
  fiches: "Fiches de plan",
  assets: "Assets",
};

/** Ordre d'affichage des groupes ; l'écrasement vient toujours en tête. */
export const ORDRE_GROUPES = ["ecrasement", "brief", "projet", "episodes", "scenes", "plans", "fiches", "assets"];

/** Les clés symboliques des parents qu'un changement cite (créés par la même proposition). */
export const CLES_PARENT = ["episodeCle", "sceneCle", "deriveDeCle"] as const;

export function clesParent(apres: unknown): string[] {
  if (!apres || typeof apres !== "object") return [];
  const a = apres as Record<string, unknown>;
  const liste = Array.isArray(a.dependDeCles) ? a.dependDeCles.filter((v): v is string => typeof v === "string") : []; // une fiche qui cite des assets créés ici
  return [...CLES_PARENT.map((c) => a[c]).filter((v): v is string => typeof v === "string"), ...liste];
}

/** Ordre d'application : celui de la proposition, sauf qu'un changement qui dépend d'une clé créée par un
 * changement PLUS LOIN passe après lui (un lot range ses sous-tâches dans l'ordre de leur première pose : un
 * asset manquant dérivé d'un autre, proposé par un autre plan du lot, peut précéder son parent). Stable ; un
 * cycle garde l'ordre d'origine (l'applicateur refusera, avec sa raison). */
export function ordonnerParDependances<T extends { cle: string | null; apres: unknown }>(changements: T[]): T[] {
  const produites = new Set(changements.map((c) => c.cle).filter((c): c is string => !!c));
  const restants = [...changements];
  const sortie: T[] = [];
  const faites = new Set<string>();
  while (restants.length) {
    const i = restants.findIndex((c) => clesParent(c.apres).every((k) => !produites.has(k) || faites.has(k)));
    const [c] = restants.splice(i >= 0 ? i : 0, 1);
    sortie.push(c!);
    if (c!.cle) faites.add(c!.cle);
  }
  return sortie;
}
