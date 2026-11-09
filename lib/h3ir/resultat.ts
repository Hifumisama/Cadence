import type { BriefH3ir, LienFichier } from "./brief";
import type { EnveloppeH3ir, Tentative } from "./compilateur";

/** Ce que la tâche « fiche de plan » avec Open H3 IR range dans `agent_runs.resultat` (worker/h3ir.ts l'écrit, lib/h3ir/conversion.ts le lit). */

/** Le skill « virtuel » de la fiche d'un plan avec Open H3 IR (`agent_runs.skill`, `propositions.skill`) : pas de dossier sous agents/skills, le worker lance le
 * compilateur au lieu d'un appel de skill. `SKILL_TRADUCTION` : le vrai skill qui traduit l'intent avant. */
export const SKILL_H3IR = "plan-h3ir";
export const SKILL_TRADUCTION = "traduction-intent";

/** L'entrée de la tâche (`agent_runs.entree`). `description` / `dureeSecondes` : à compiler à la place de celles du plan (réécriture d'« Itérer »). */
export type EntreeH3ir = {
  planUuid: string;
  shots?: number | null;
  director?: string | null;
  creativity?: string | null;
  description?: string | null;
  dureeSecondes?: number | null;
};

/** L'enveloppe du compilateur réduite à ce que la fiche et le suivi utilisent. */
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
  /** Le brief tel qu'envoyé à la compilation (intent déjà en anglais, seed de la tentative gagnante). */
  brief: BriefH3ir;
  intentFrancais: string;
  intentAnglais: string;
  liens: LienFichier[];
  avertissements: string[];
  compilation: CompilationReduite;
  /** Empreinte → chemin des fichiers envoyés (relie le manifeste aux assets). */
  fichiers: Record<string, string>;
  tentatives: Tentative[];
  seedUtilisee: number;
  modeleTraduction: string;
};
