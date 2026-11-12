import type { Avertissement, CibleType, Operation, Position } from "./types";

/** A change as built by the converters (skeleton, skill outputs) BEFORE enrichment by the applier of its target (current state, overwrite,
 * checks). Pure: no reads. */
export type ChangementBrut = {
  /** Stable display group: brief | projet | episodes | scenes | plans | fiches | assets
   * (a batch: `ep-<id>`, one group per episode). */
  groupe: string;
  /** Symbolic key of a creation ("episode-2") cited by its children. */
  cle?: string | null;
  cibleType: CibleType;
  /** Stable reference of the existing item (internal id, clip uuid, section key); null = creation. */
  cibleRef: string | null;
  libelle: string;
  operation: Operation;
  avant?: unknown;
  apres?: unknown;
  position?: Position | null;
  avertissements?: Avertissement[];
  ecrase?: string | null;
  /** Refused outright (not supported, out of scope, refused parent). */
  refuseRaison?: string | null;
  /** Batch: title of the scene under which the review files this clip or this line of dialogue. */
  sousGroupe?: string | null;
  /** Ticked outright DESPITE the rule (deletion unticked by default): the converter knows the action is risk-free (a clip with no sheet nor
   * render that the screenplay review merges into its neighbour). Never removes a refusal, a block or an overwrite (checking.ts). */
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

/** Display order of the groups; the overwrite group always comes first. */
export const ORDRE_GROUPES = ["ecrasement", "brief", "projet", "episodes", "scenes", "plans", "fiches", "assets"];

/** The symbolic keys of the parents a change cites (created by the same proposal). */
const CLES_PARENT = ["episodeCle", "sceneCle", "deriveDeCle"] as const;

export function clesParent(apres: unknown): string[] {
  if (!apres || typeof apres !== "object") return [];
  const a = apres as Record<string, unknown>;
  const liste = Array.isArray(a.dependDeCles) ? a.dependDeCles.filter((v): v is string => typeof v === "string") : []; // a sheet citing assets created here
  return [...CLES_PARENT.map((c) => a[c]).filter((v): v is string => typeof v === "string"), ...liste];
}

/** Application order: that of the proposal, except that a change depending on a key created by a
 * change FURTHER ON comes after it (a batch files its subtasks in the order of their first set: a missing
 * asset derived from another, proposed by another clip of the batch, may precede its parent). Stable; a
 * cycle keeps the original order (the applier will refuse, with its reason). */
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
