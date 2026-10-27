import { ERREUR_ANNULEE } from "./annulation";
import type { DecisionIteration } from "./fiche-plan";

/** Les DEMANDES (2026-10-17) : un geste de l'utilisateur qui tient en plusieurs étapes est UNE ligne dans la file et le panneau, du clic
 * au résultat — pas une suite de tâches qui se relaient avec des trous entre elles (ce qui donne l'impression d'un plantage alors qu'on
 * attend la suite). Règles PURES (étapes, décision) ; les lectures, écritures et appels au service sont dans lib/demandes-db.ts, piloté
 * par le worker (un tour = au plus une transition par demande : reprise sur redémarrage, rien en mémoire).
 *
 * Une demande n'est QU'UN PILOTE : les tâches qu'elle pose (run d'agent, job vidéo, génération d'image) gardent leurs voies et le verrou
 * GPU (worker/index.ts). Elle ne tient ni voie ni verrou entre deux étapes. Une seule demande en cours par cible (plan, asset). */

export type TypeDemande = "iteration-plan";
export type StatutDemande = "en_cours" | "termine" | "echoue" | "annulee";
export type StatutEtapeDemande = "a_venir" | "en_cours" | "fait" | "passe";

export const ETAPES_ITERATION_PLAN = [
  { cle: "agent", libelle: "L'agent lit la consigne" },
  { cle: "reecriture", libelle: "Réécriture de la fiche" },
  { cle: "rendu", libelle: "Rendu de l'essai" },
] as const;
export type CleEtapeIteration = (typeof ETAPES_ITERATION_PLAN)[number]["cle"];

export type EtapeDemande = { cle: string; libelle: string; statut: StatutEtapeDemande };

export const etapesIterationPlan = (): EtapeDemande[] => ETAPES_ITERATION_PLAN.map((e, i) => ({ cle: e.cle, libelle: e.libelle, statut: i === 0 ? ("en_cours" as const) : ("a_venir" as const) }));

/** Ce qu'il faut pour finir une itération de plan, écrit à la demande puis complété à chaque étape. */
export type ContexteIteration = {
  consigne: string;
  depuisNumero: number | null;
  /** Réglages retouchés à la main dans la page (durée, FPS, seed), écrits avec l'essai. */
  reglages: { dureeGenerationSecondes?: number; fps?: number; megapixels?: number; seed?: string };
  /** La tâche d'agent de l'étape courante (agent, puis plan-h3 d'une réécriture). */
  runUuid?: string;
  /** Le rendu créé, une fois la correction appliquée. */
  jobId?: number;
  numeroRendu?: number;
  notes?: string[];
};

export const estEtapeFinale = (e: Pick<EtapeDemande, "statut">) => e.statut === "fait" || e.statut === "passe";
export const etapeCouranteDemande = (etapes: EtapeDemande[]): EtapeDemande | null => etapes.find((e) => !estEtapeFinale(e)) ?? null;

export function progressionDemande(etapes: EtapeDemande[]): { faites: number; total: number } {
  return { faites: etapes.filter(estEtapeFinale).length, total: etapes.length };
}

/** Ce que le pilote observe pour la tâche de l'étape courante. */
export type ObservationIteration = {
  tache:
    | { genre: "run"; statut: string; erreur: string | null }
    | { genre: "job"; statut: string; erreur: string | null }
    | null;
  /** La décision d'itération lue sur la proposition de la tâche (étapes agent et réécriture, run terminé). */
  decision: DecisionIteration | null;
};

export type DecisionDemande =
  | { type: "attendre" }
  | { type: "appliquer" }
  | { type: "reecrire"; description: string; dureeSecondes?: number }
  | { type: "terminer" }
  | { type: "annuler" }
  | { type: "echouer"; erreur: string };

const ACTIF = ["en_attente", "en_cours"];

/** La suite à donner à l'étape courante d'une itération de plan. Pure : toute la logique de l'enchaînement est ici (testée). */
export function deciderIteration(etape: CleEtapeIteration, obs: ObservationIteration): DecisionDemande {
  const t = obs.tache;
  if (!t) return { type: "echouer", erreur: "La tâche de cette étape n'existe plus." };
  if (ACTIF.includes(t.statut)) return { type: "attendre" };

  if (etape === "rendu") {
    if (t.statut === "termine") return { type: "terminer" };
    if (t.statut === "echoue") return t.erreur === ERREUR_ANNULEE ? { type: "annuler" } : { type: "echouer", erreur: t.erreur ?? "Le rendu a échoué." };
    return { type: "echouer", erreur: "Le rendu n'a pas abouti." };
  }

  // agent, réécriture : la tâche d'agent est finie, sa proposition dit la suite.
  if (t.statut === "annulee") return { type: "annuler" };
  if (t.statut === "echoue") return { type: "echouer", erreur: t.erreur ?? "L'agent a échoué." };
  const d = obs.decision;
  if (!d || d.action === "attendre") return { type: "attendre" };
  if (d.action === "echec") return { type: "echouer", erreur: d.erreur };
  if (d.action === "rien") return { type: "echouer", erreur: d.message };
  if (d.action === "appliquer") return { type: "appliquer" };
  // reecrire
  if (etape === "agent") return { type: "reecrire", description: d.description, ...(d.dureeSecondes ? { dureeSecondes: d.dureeSecondes } : {}) };
  return { type: "echouer", erreur: "La réécriture de la fiche demande encore d'être réécrite : relance « Itérer »." };
}

/** Passe l'étape `cle` à `statut` et lance la suivante si on vient de la finir ; `sauter` les marque « passées » (ex. pas de réécriture). */
export function avancerEtapes(etapes: EtapeDemande[], cle: string, statut: StatutEtapeDemande, sauter: string[] = []): EtapeDemande[] {
  const res = etapes.map((e) => (e.cle === cle ? { ...e, statut } : sauter.includes(e.cle) ? { ...e, statut: "passe" as const } : e));
  if (statut === "fait" || statut === "passe") {
    const suivante = res.find((e) => !estEtapeFinale(e));
    if (suivante && suivante.statut === "a_venir") return res.map((e) => (e.cle === suivante.cle ? { ...e, statut: "en_cours" as const } : e));
  }
  return res;
}
