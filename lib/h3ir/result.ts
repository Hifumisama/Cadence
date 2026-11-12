import type { BriefH3ir, LienFichier } from "./brief";
import type { EnveloppeH3ir, Tentative } from "./compiler";
import type { EntreeRetouche } from "./retouch";

/** What the clip sheet task with Open H3 IR stores in `agent_runs.resultat` (worker/h3ir.ts writes it, lib/h3ir/conversion.ts reads it). */

/** The « virtual » skill of a clip's sheet with Open H3 IR (`agent_runs.skill`, `propositions.skill`): no folder under agents/skills, the worker launches the
 * compiler instead of a skill call. `SKILL_TRADUCTION`: the real skill that translates the intent before. */
export const SKILL_H3IR = "plan-h3ir";
export const SKILL_TRADUCTION = "traduction-intent";

/** The task's input (`agent_runs.entree`). `description` / `dureeSecondes` / `references` / `reglagesPlan`: to compile instead of what is in the database
 * (decisions of « Itérer », lib/h3ir/brief-clip.ts `SurchargeBrief`); they are only written to the clip with the compiled sheet. */
export type EntreeH3ir = {
  planUuid: string;
  shots?: number | null;
  director?: string | null;
  creativity?: string | null;
  description?: string | null;
  dureeSecondes?: number | null;
  references?: { ajouter: string[]; retirer: string[] } | null;
  reglagesPlan?: { creativite?: string | null; styleCamera?: string | null } | null;
  /** « Partir de cet essai »: retouch the prompt of this attempt (skill `retouche-prompt`) instead of recompiling; if the skill answers « refonte », the compilation
   * above (description, duration, references, settings) takes over. */
  retouche?: EntreeRetouche | null;
};

/** The compiler's envelope, reduced to what the sheet and the tracking use. */
export type CompilationReduite = {
  status: string | null;
  source: string | null;
  mode: string | null;
  promptTokens: number | null;
  sections: Record<string, string>;
  manifest: NonNullable<NonNullable<EnveloppeH3ir["ir"]>["manifest"]>;
  diagnostics: NonNullable<NonNullable<EnveloppeH3ir["ir"]>["diagnostics"]>;
  dureeEffectiveSecondes: number | null;
};

export type ResultatH3ir = {
  moteur: "h3ir";
  planUuid: string;
  /** The brief as sent to the compilation (intent already in English, seed of the winning attempt). */
  brief: BriefH3ir;
  intentFrancais: string;
  intentAnglais: string;
  liens: LienFichier[];
  avertissements: string[];
  compilation: CompilationReduite;
  /** Fingerprint → path of the files sent (links the manifest to the assets). */
  fichiers: Record<string, string>;
  tentatives: Tentative[];
  seedUtilisee: number;
  modeleTraduction: string;
};
