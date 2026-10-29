import { ERREUR_ANNULEE } from "./annulation";
import type { PlaceScene } from "./agents/types";
import type { DecisionIteration } from "./fiche-plan";

/** Les DEMANDES (2026-10-17) : un geste de l'utilisateur qui tient en plusieurs étapes est UNE ligne dans la file et le panneau, du clic
 * au résultat — pas une suite de tâches qui se relaient avec des trous entre elles (ce qui donne l'impression d'un plantage alors qu'on
 * attend la suite). Règles PURES (étapes, décision) ; les lectures, écritures et appels au service sont dans lib/demandes-db.ts, piloté
 * par le worker (un tour = au plus une transition par demande : reprise sur redémarrage, rien en mémoire).
 *
 * Une demande n'est QU'UN PILOTE : les tâches qu'elle pose (run d'agent, job vidéo, génération d'image) gardent leurs voies et le verrou
 * GPU (worker/index.ts). Elle ne tient ni voie ni verrou entre deux étapes. Une seule demande en cours par cible (plan, asset). */

export type TypeDemande = "iteration-plan" | "ajout-plan" | "ajout-scene";
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
  reglages: { dureeGenerationSecondes?: number; fps?: number; seed?: string };
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

// --- « Ajouter un plan » (page Scénario) -------------------------------------------------------------------------------------------------
// Une demande à deux étapes : l'agent écrit le plan, puis il est ajouté à la scène SANS relecture (on le relit dans sa fiche). Une seule à la fois
// par film (la cible est l'épisode) : deux ajouts qui se lisent l'un l'autre sans se connaître donneraient des plans qui se répètent.

export const ETAPES_AJOUT_PLAN = [
  { cle: "agent", libelle: "L'agent écrit le plan" },
  { cle: "ajout", libelle: "Ajout à la scène" },
] as const;

export const etapesAjoutPlan = (): EtapeDemande[] => ETAPES_AJOUT_PLAN.map((e, i) => ({ cle: e.cle, libelle: e.libelle, statut: i === 0 ? ("en_cours" as const) : ("a_venir" as const) }));

/** Ce qu'il faut pour finir un ajout de plan : la consigne, où il va (scène + place), la tâche d'agent, puis le plan créé. */
export type ContexteAjoutPlan = {
  consigne: string;
  sceneId: number | null;
  /** « III · La Fuite » : pour la file et la page. */
  scene: string;
  /** La place dans l'épisode : après un plan, ou au début. */
  position: { apresPlanUuid: string } | { debut: true };
  runUuid?: string;
  /** Le plan créé, une fois ajouté (la file y mène). */
  planUuid?: string;
  titre?: string;
};

/** Ce que la proposition de l'agent permet de faire d'un ajout de plan. Pure : ne regarde que le changement qui CRÉE le plan. */
export type DecisionAjout = { action: "attendre" } | { action: "fait" } | { action: "echec"; erreur: string } | { action: "appliquer"; planChangementId: number; changementIds: number[]; titre: string };

type PropositionAjout = {
  statut: string;
  erreur: string | null;
  groupes: { changements: { id: number; cibleType: string; operation: string; bloque: boolean; refuseRaison: string | null; avertissements: { type: string; texte: string }[]; libelle: string; apres: unknown }[] }[];
};

export function decisionAjoutPlan(prop: PropositionAjout | null): DecisionAjout {
  if (!prop || prop.statut === "en_generation") return { action: "attendre" };
  if (prop.statut === "appliquee" || prop.statut === "partielle") return { action: "fait" };
  if (prop.statut === "echouee") return { action: "echec", erreur: prop.erreur ?? "L'agent n'a pas réussi à écrire ce plan." };
  if (prop.statut === "rejetee") return { action: "echec", erreur: "La proposition a été rejetée." };
  const tous = prop.groupes.flatMap((g) => g.changements);
  const plan = tous.find((c) => c.cibleType === "plan" && c.operation === "creer");
  if (!plan) return { action: "echec", erreur: "L'agent n'a pas proposé de plan à ajouter." };
  if (plan.refuseRaison) return { action: "echec", erreur: plan.refuseRaison };
  if (plan.bloque) return { action: "echec", erreur: plan.avertissements.find((w) => w.type === "bloque_controle")?.texte ?? "Un contrôle empêche d'ajouter ce plan." };
  const titre = typeof (plan.apres as { titre?: unknown } | null)?.titre === "string" ? ((plan.apres as { titre: string }).titre) : plan.libelle;
  return { action: "appliquer", planChangementId: plan.id, changementIds: tous.map((c) => c.id), titre };
}

// --- « Nouvelle scène » (page Scénario) --------------------------------------------------------------------------------------------------
// Même mécanique que l'ajout d'un plan : l'agent écrit UNE scène (son titre, sa fonction, son genre, son ambiance et ses plans, en lisant les scènes
// voisines), elle est ajoutée au film SANS relecture, et on la relit dans la page. Même cible (l'épisode) : une seule demande de ce genre à la fois
// par film, plan ou scène (l'index unique partiel de `demandes`).

export const ETAPES_AJOUT_SCENE = [
  { cle: "agent", libelle: "L'agent écrit la scène" },
  { cle: "ajout", libelle: "Ajout au film" },
] as const;

export const etapesAjoutScene = (): EtapeDemande[] => ETAPES_AJOUT_SCENE.map((e, i) => ({ cle: e.cle, libelle: e.libelle, statut: i === 0 ? ("en_cours" as const) : ("a_venir" as const) }));

export type { PlaceScene };

export type ContexteAjoutScene = {
  /** Le briefing de l'auteur ; vide = l'agent propose la suite. */
  consigne: string;
  place: PlaceScene;
  /** « Après III · La Fuite » ou « Au début du film » : pour la file. */
  apres: string;
  runUuid?: string;
  /** La scène créée, une fois ajoutée (la file y mène). */
  sceneId?: number;
  titre?: string;
};

/** Ce que la proposition de l'agent permet de faire d'une scène neuve : elle doit créer UNE scène (et ses plans) ; tout le reste reste décoché. Pure. */
export type DecisionAjoutScene = { action: "attendre" } | { action: "fait" } | { action: "echec"; erreur: string } | { action: "appliquer"; changementIds: number[]; tous: number[]; titre: string };

export function decisionAjoutScene(prop: PropositionAjout | null): DecisionAjoutScene {
  if (!prop || prop.statut === "en_generation") return { action: "attendre" };
  if (prop.statut === "appliquee" || prop.statut === "partielle") return { action: "fait" };
  if (prop.statut === "echouee") return { action: "echec", erreur: prop.erreur ?? "L'agent n'a pas réussi à écrire cette scène." };
  if (prop.statut === "rejetee") return { action: "echec", erreur: "La proposition a été rejetée." };
  const tous = prop.groupes.flatMap((g) => g.changements);
  const scene = tous.find((c) => c.cibleType === "scene" && c.operation === "creer");
  if (!scene) return { action: "echec", erreur: "L'agent n'a pas proposé de scène à ajouter." };
  const retenus = tous.filter((c) => (c.cibleType === "scene" || c.cibleType === "plan") && c.operation === "creer");
  const refus = retenus.find((c) => c.refuseRaison);
  if (refus) return { action: "echec", erreur: refus.refuseRaison! };
  const bloque = retenus.find((c) => c.bloque);
  if (bloque) return { action: "echec", erreur: bloque.avertissements.find((w) => w.type === "bloque_controle")?.texte ?? "Un contrôle empêche d'ajouter cette scène." };
  if (!retenus.some((c) => c.cibleType === "plan")) return { action: "echec", erreur: "L'agent a proposé une scène sans plan." };
  const titre = typeof (scene.apres as { titre?: unknown } | null)?.titre === "string" ? (scene.apres as { titre: string }).titre : scene.libelle;
  return { action: "appliquer", changementIds: retenus.map((c) => c.id), tous: tous.map((c) => c.id), titre };
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
