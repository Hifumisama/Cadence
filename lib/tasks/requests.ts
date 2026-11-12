import { ERREUR_ANNULEE } from "./cancellation";
import type { DecisionsAffichees, DecisionsIteration, PlaceScene } from "../agents/types";
import type { DecisionIteration } from "../clips/clip-sheet";

/** `en_attente` (2026-11-09, docs/PLAN_FILE_CONSIGNES.md) : une itération posée alors qu'une autre tient la place. Elle ne pose encore aucune tâche, sa consigne
 * reste modifiable ; le pilote la fait passer `en_cours` quand plus aucune itération n'est en cours (la plus ancienne d'abord). */
export type StatutDemande = "en_attente" | "en_cours" | "termine" | "echoue" | "annulee";
export type StatutEtapeDemande = "a_venir" | "en_cours" | "fait" | "passe";

const ETAPES_ITERATION_PLAN = [
  { cle: "agent", libelle: "L'agent lit la consigne" },
  { cle: "reecriture", libelle: "Recompilation de la fiche (Open H3 IR)" },
  { cle: "rendu", libelle: "Rendu de l'essai" },
] as const;
export type CleEtapeIteration = (typeof ETAPES_ITERATION_PLAN)[number]["cle"];

export type EtapeDemande = { cle: string; libelle: string; statut: StatutEtapeDemande };

export const etapesIterationPlan = (): EtapeDemande[] => ETAPES_ITERATION_PLAN.map((e, i) => ({ cle: e.cle, libelle: e.libelle, statut: i === 0 ? ("en_cours" as const) : ("a_venir" as const) }));
/** Les étapes d'une itération en attente : aucune n'a commencé. */
export const etapesIterationEnAttente = (): EtapeDemande[] => ETAPES_ITERATION_PLAN.map((e) => ({ cle: e.cle, libelle: e.libelle, statut: "a_venir" as const }));

/** « Itérer » qui ajoute des références sans image ou crée des assets manquants (vague 4a) : les étapes `assets`, `prompts` et `images` s'insèrent entre
 * l'agent et la recompilation, qui ne part qu'une fois toutes les images là. `assetsCrees` : le nombre d'assets créés (0 : l'étape est passée). Pur ;
 * sans effet si les étapes y sont déjà. */
export function insererEtapesImagesIteration(etapes: EtapeDemande[], assetsCrees: number): EtapeDemande[] {
  if (etapes.some((e) => e.cle === "images")) return etapes;
  const i = etapes.findIndex((e) => e.cle === "reecriture");
  const nouvelles: EtapeDemande[] = [
    { cle: "assets", libelle: assetsCrees > 0 ? `Création d'assets (${assetsCrees})` : "Création d'assets", statut: assetsCrees > 0 ? "fait" : "passe" },
    { cle: "prompts", libelle: "Prompts d'assets", statut: "a_venir" },
    { cle: "images", libelle: "Images", statut: "a_venir" },
  ];
  return i < 0 ? [...etapes, ...nouvelles] : [...etapes.slice(0, i), ...nouvelles, ...etapes.slice(i)];
}

/** Ce qu'il faut pour finir une itération de plan, écrit à la demande puis complété à chaque étape. */
export type ContexteIteration = {
  consigne: string;
  /** Ce qu'il faut pour démarrer une itération restée en attente (le pilote crée alors la tâche de l'agent) : la conversation du plan, l'essai de base, la planche. */
  conversationUuid?: string;
  renduId?: number | null;
  planche?: boolean;
  depuisNumero: number | null;
  /** Réglages retouchés à la main dans la page (durée, FPS, seed), écrits avec l'essai. */
  reglages: { dureeGenerationSecondes?: number; fps?: number; seed?: string };
  /** La tâche d'agent de l'étape courante (agent, puis la recompilation Open H3 IR). */
  runUuid?: string;
  /** Les décisions de l'agent (avant → après), montrées par la page pendant la recompilation et après. */
  decisions?: DecisionsAffichees | null;
  /** Les décisions À RECOMPILER (références ajoutées comprises, assets créés inclus), gardées pendant l'attente des images. */
  decisionsARecompiler?: DecisionsIteration;
  /** Assets créés, prompts et images attendus avant la recompilation (même mécanique que la fiche d'un plan). */
  preparation?: { assetsCrees?: string[]; promptsPropositionUuid?: string; imagesLancees?: string[] };
  /** Ce que l'agent a signalé (décisions, confiance faible) : gardé sur l'essai avec les notes de l'application. */
  notesAgent?: string[];
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
  | { type: "reecrire"; decisions: DecisionsIteration; affichage: DecisionsAffichees | null; notes: string[] }
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
  if (etape === "agent") return { type: "reecrire", decisions: d.decisions, affichage: d.affichage, notes: d.notes };
  return { type: "echouer", erreur: "La recompilation de la fiche demande encore d'être recompilée : relance « Itérer »." };
}

// --- « Ajouter un plan » (page Scénario) -------------------------------------------------------------------------------------------------
// Une demande à deux étapes : l'agent écrit le plan, puis il est ajouté à la scène SANS relecture (on le relit dans sa fiche). Une seule à la fois
// par film (la cible est l'épisode) : deux ajouts qui se lisent l'un l'autre sans se connaître donneraient des plans qui se répètent.

const ETAPES_AJOUT_PLAN = [
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

const ETAPES_AJOUT_SCENE = [
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

// --- « Générer la fiche » d'un plan (pages Scénario et Plan) -----------------------------------------------------------------------------
// Cible = le plan : une seule demande à la fois par plan, et jamais en même temps qu'une itération de ce plan (même index unique partiel).
// Depuis la vague 4a (2026-11-09, lib/h3ir/preparation.ts), Open H3 IR est le SEUL moteur : la demande PRÉPARE le plan (références, assets manquants,
// prompts, images) puis le COMPILE ; la fiche est enregistrée SANS relecture (on la relit dans la page du plan) et peut remplacer une fiche existante
// (le clic vaut confirmation ; l'ancien prompt reste dans l'historique). Chemin rapide : un plan dont les références ont toutes leur image va droit à
// la compilation (les étapes de préparation sont « passées »).

/** Les étapes d'une fiche Open H3 IR (préparation puis compilation). Les libellés des étapes assets / prompts / images se complètent en cours de route
 * (« Création d'assets (2) », « Images (1/3) »). */
const ETAPES_PREPARATION_FICHE = [
  { cle: "references", libelle: "Choix des références" },
  { cle: "assets", libelle: "Création d'assets" },
  { cle: "prompts", libelle: "Prompts d'assets" },
  { cle: "images", libelle: "Images" },
  { cle: "compilation", libelle: "Compilation Open H3 IR" },
] as const;

/** `preparation` : plan à préparer ; `rapide` : références prêtes (compilation directe). */
export type ParcoursFichePlan = "preparation" | "rapide";

export const etapesFichePlan = (parcours: ParcoursFichePlan = "preparation"): EtapeDemande[] => {
  return ETAPES_PREPARATION_FICHE.map((e, i) => ({
    cle: e.cle,
    libelle: e.libelle,
    statut: parcours === "rapide" ? (e.cle === "compilation" ? ("en_cours" as const) : ("passe" as const)) : i === 0 ? ("en_cours" as const) : ("a_venir" as const),
  }));
};

/** Change le libellé d'une étape (compteurs « Images (1/3) »). Pur. */
export const renommerEtape = (etapes: EtapeDemande[], cle: string, libelle: string): EtapeDemande[] => etapes.map((e) => (e.cle === cle ? { ...e, libelle } : e));

/** Ce que la préparation d'un plan garde entre deux tours du pilote (rien en mémoire). */
type ContextePreparation = {
  /** Rechoisir les références même si le plan en a déjà (demande explicite ; jamais par défaut). */
  rechoisir?: boolean;
  /** La tâche `references-plan` (posée seulement en cas de doute du code). */
  referencesRunUuid?: string;
  /** Les assets créés pour ce plan (manquants), par code. */
  assetsCrees?: string[];
  /** Le lot `prompt-asset` posé pour les références sans prompt. */
  promptsPropositionUuid?: string;
  /** Les codes dont la génération d'image a été lancée par cette demande. */
  imagesLancees?: string[];
};

export type ContexteFichePlan = {
  /** Le titre du plan : pour la file. */
  titre: string;
  planUuid: string;
  /** La dernière tâche d'agent posée (choix des références, prompts, compilation) : la ligne du panneau suit son état. */
  runUuid?: string;
  /** Réglages Open H3 IR choisis au lancement (absents : ceux du plan, de sa scène ou du projet). */
  reglagesH3ir?: { shots?: number | null; director?: string | null; creativity?: string | null };
  preparation?: ContextePreparation;
  /** Ce que la demande a à dire à la fin (références choisies, assets créés). */
  notes?: string[];
};

/** Ce que la proposition de l'agent permet de faire d'une fiche : elle doit écrire la fiche ; les assets manquants qu'elle cite sont créés avec (elle
 * s'applique après eux). Pure. */
export type DecisionFichePlan = { action: "attendre" } | { action: "fait" } | { action: "echec"; erreur: string } | { action: "appliquer"; changementIds: number[] };

export function decisionFichePlan(prop: PropositionAjout | null): DecisionFichePlan {
  if (!prop || prop.statut === "en_generation") return { action: "attendre" };
  if (prop.statut === "appliquee" || prop.statut === "partielle") return { action: "fait" };
  if (prop.statut === "echouee") return { action: "echec", erreur: prop.erreur ?? "L'agent n'a pas réussi à écrire cette fiche." };
  if (prop.statut === "rejetee") return { action: "echec", erreur: "La proposition a été rejetée." };
  const tous = prop.groupes.flatMap((g) => g.changements);
  const fiche = tous.find((c) => c.cibleType === "fiche");
  if (!fiche) return { action: "echec", erreur: "L'agent n'a pas proposé de fiche." };
  if (fiche.refuseRaison) return { action: "echec", erreur: fiche.refuseRaison };
  if (fiche.bloque) return { action: "echec", erreur: fiche.avertissements.find((w) => w.type === "bloque_controle")?.texte ?? "Un contrôle empêche d'enregistrer cette fiche." };
  // Les créations d'assets refusées ou bloquées restent décochées ; la fiche, elle, ne dépend que de celles qu'elle cite.
  const retenus = tous.filter((c) => c.id === fiche.id || (c.cibleType === "asset" && c.operation === "creer" && !c.refuseRaison && !c.bloque));
  return { action: "appliquer", changementIds: retenus.map((c) => c.id) };
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
