import { ERREUR_ANNULEE } from "./cancellation";
import type { DecisionsAffichees, DecisionsIteration, PlaceScene } from "../agents/types";
import type { DecisionIteration } from "../clips/clip-sheet";

/** `en_attente` (2026-11-09, docs/PLAN_FILE_CONSIGNES.md): an iteration posted while another holds the place. It does not yet post any task; its instruction
 * remains editable; the pilot makes it `en_cours` when no iteration is in progress any more (the oldest first). */
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
/** The steps of a waiting iteration: none has started. */
export const etapesIterationEnAttente = (): EtapeDemande[] => ETAPES_ITERATION_PLAN.map((e) => ({ cle: e.cle, libelle: e.libelle, statut: "a_venir" as const }));

/** « Itérer » that adds references without an image or creates missing assets (wave 4a): the steps `assets`, `prompts` and `images` are inserted between
 * the agent and the recompilation, which only leaves once all the images are there. `assetsCrees`: the number of assets created (0: the step is passed). Pure;
 * no effect if the steps are already there. */
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

/** What is needed to finish a clip iteration, written on request then completed at each step. */
export type ContexteIteration = {
  consigne: string;
  /** What is needed to start an iteration left waiting (the pilot then creates the agent's task): the clip's conversation, the base attempt, the contact sheet. */
  conversationUuid?: string;
  renduId?: number | null;
  planche?: boolean;
  depuisNumero: number | null;
  /** Settings retouched by hand on the page (duration, FPS, seed), written with the attempt. */
  reglages: { dureeGenerationSecondes?: number; fps?: number; seed?: string };
  /** The agent task of the current step (agent, then the Open H3 IR recompilation). */
  runUuid?: string;
  /** The agent's decisions (before → after), shown by the page during the recompilation and after. */
  decisions?: DecisionsAffichees | null;
  /** The decisions TO RECOMPILE (references added included, assets created included), kept while the images are awaited. */
  decisionsARecompiler?: DecisionsIteration;
  /** Assets created, prompts and images expected before the recompilation (same mechanism as a clip's sheet). */
  preparation?: { assetsCrees?: string[]; promptsPropositionUuid?: string; imagesLancees?: string[] };
  /** What the agent reported (decisions, low confidence): kept on the attempt with the application's notes. */
  notesAgent?: string[];
  /** The render created, once the correction is applied. */
  jobId?: number;
  numeroRendu?: number;
  notes?: string[];
};

export const estEtapeFinale = (e: Pick<EtapeDemande, "statut">) => e.statut === "fait" || e.statut === "passe";
export const etapeCouranteDemande = (etapes: EtapeDemande[]): EtapeDemande | null => etapes.find((e) => !estEtapeFinale(e)) ?? null;

export function progressionDemande(etapes: EtapeDemande[]): { faites: number; total: number } {
  return { faites: etapes.filter(estEtapeFinale).length, total: etapes.length };
}

/** What the pilot observes for the current step's task. */
export type ObservationIteration = {
  tache:
    | { genre: "run"; statut: string; erreur: string | null }
    | { genre: "job"; statut: string; erreur: string | null }
    | null;
  /** The iteration decision read from the task's proposal (agent and rewrite steps, finished run). */
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

/** The next step to take for a clip iteration's current step. Pure: all the chaining logic is here (tested). */
export function deciderIteration(etape: CleEtapeIteration, obs: ObservationIteration): DecisionDemande {
  const t = obs.tache;
  if (!t) return { type: "echouer", erreur: "La tâche de cette étape n'existe plus." };
  if (ACTIF.includes(t.statut)) return { type: "attendre" };

  if (etape === "rendu") {
    if (t.statut === "termine") return { type: "terminer" };
    if (t.statut === "echoue") return t.erreur === ERREUR_ANNULEE ? { type: "annuler" } : { type: "echouer", erreur: t.erreur ?? "Le rendu a échoué." };
    return { type: "echouer", erreur: "Le rendu n'a pas abouti." };
  }

  // agent, rewrite: the agent task is finished, its proposal says what comes next.
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

// --- « Ajouter un plan » (Screenplay page) -----------------------------------------------------------------------------------------------
// A two-step request: the agent writes the clip, then it is added to the scene WITHOUT review (we re-read it in its sheet). Only one at a time
// per film (the target is the episode): two additions that read each other without knowing each other would give clips that repeat.

const ETAPES_AJOUT_PLAN = [
  { cle: "agent", libelle: "L'agent écrit le plan" },
  { cle: "ajout", libelle: "Ajout à la scène" },
] as const;

export const etapesAjoutPlan = (): EtapeDemande[] => ETAPES_AJOUT_PLAN.map((e, i) => ({ cle: e.cle, libelle: e.libelle, statut: i === 0 ? ("en_cours" as const) : ("a_venir" as const) }));

/** What is needed to finish a clip addition: the instruction, where it goes (scene + place), the agent task, then the clip created. */
export type ContexteAjoutPlan = {
  consigne: string;
  sceneId: number | null;
  /** « III · La Fuite »: for the queue and the page. */
  scene: string;
  /** The place in the episode: after a clip, or at the start. */
  position: { apresPlanUuid: string } | { debut: true };
  runUuid?: string;
  /** The clip created, once added (the queue leads to it). */
  planUuid?: string;
  titre?: string;
};

/** What the agent's proposal allows for a clip addition. Pure: only looks at the change that CREATES the clip. */
export type DecisionAjout = { action: "attendre" } | { action: "fait" } | { action: "echec"; erreur: string } | { action: "appliquer"; planChangementId: number; changementIds: number[]; titre: string };

type PropositionAjout = {
  statut: string;
  erreur: string | null;
  groupes: { changements: { id: number; cibleType: string; operation: string; bloque: boolean; refuseRaison: string | null; avertissements: { type: string; texte: string }[]; libelle: string; apres: unknown }[] }[];
};

export function decisionAjoutPlan(prop: PropositionAjout | null): DecisionAjout {
  if (!prop || prop.statut === "en_generation") return { action: "attendre" };
  if (prop.statut === "appliquee") return { action: "fait" };
  if (prop.statut === "echouee") return { action: "echec", erreur: prop.erreur ?? "L'agent n'a pas réussi à écrire ce plan." };
  if (prop.statut === "annulee") return { action: "echec", erreur: "La proposition a été annulée." };
  const tous = prop.groupes.flatMap((g) => g.changements);
  const plan = tous.find((c) => c.cibleType === "plan" && c.operation === "creer");
  if (!plan) return { action: "echec", erreur: "L'agent n'a pas proposé de plan à ajouter." };
  if (plan.refuseRaison) return { action: "echec", erreur: plan.refuseRaison };
  if (plan.bloque) return { action: "echec", erreur: plan.avertissements.find((w) => w.type === "bloque_controle")?.texte ?? "Un contrôle empêche d'ajouter ce plan." };
  const titre = typeof (plan.apres as { titre?: unknown } | null)?.titre === "string" ? ((plan.apres as { titre: string }).titre) : plan.libelle;
  return { action: "appliquer", planChangementId: plan.id, changementIds: tous.map((c) => c.id), titre };
}

// --- « Nouvelle scène » (Screenplay page) -----------------------------------------------------------------------------------------------
// Same mechanism as the clip addition: the agent writes ONE scene (its title, its function, its genre, its mood and its clips, reading the
// neighbouring scenes), it is added to the film WITHOUT review, and we re-read it on the page. Same target (the episode): only one request of
// this kind at a time per film, clip or scene (the partial unique index of `demandes`).

const ETAPES_AJOUT_SCENE = [
  { cle: "agent", libelle: "L'agent écrit la scène" },
  { cle: "ajout", libelle: "Ajout au film" },
] as const;

export const etapesAjoutScene = (): EtapeDemande[] => ETAPES_AJOUT_SCENE.map((e, i) => ({ cle: e.cle, libelle: e.libelle, statut: i === 0 ? ("en_cours" as const) : ("a_venir" as const) }));

export type { PlaceScene };

export type ContexteAjoutScene = {
  /** The author's briefing; empty = the agent proposes what follows. */
  consigne: string;
  place: PlaceScene;
  /** « Après III · La Fuite » or « Au début du film »: for the queue. */
  apres: string;
  runUuid?: string;
  /** The scene created, once added (the queue leads to it). */
  sceneId?: number;
  titre?: string;
};

/** What the agent's proposal allows for a new scene: it must create ONE scene (and its clips); everything else stays unticked. Pure. */
export type DecisionAjoutScene = { action: "attendre" } | { action: "fait" } | { action: "echec"; erreur: string } | { action: "appliquer"; changementIds: number[]; tous: number[]; titre: string };

export function decisionAjoutScene(prop: PropositionAjout | null): DecisionAjoutScene {
  if (!prop || prop.statut === "en_generation") return { action: "attendre" };
  if (prop.statut === "appliquee") return { action: "fait" };
  if (prop.statut === "echouee") return { action: "echec", erreur: prop.erreur ?? "L'agent n'a pas réussi à écrire cette scène." };
  if (prop.statut === "annulee") return { action: "echec", erreur: "La proposition a été annulée." };
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

// --- « Générer la fiche » of a clip (Screenplay and Clip pages) --------------------------------------------------------------------------
// Target = the clip: only one request at a time per clip, and never at the same time as an iteration of this clip (same partial unique index).
// Since wave 4a (2026-11-09, lib/h3ir/preparation.ts), Open H3 IR is the ONLY engine: the request PREPARES the clip (references, missing assets,
// prompts, images) then COMPILES it; the sheet is saved WITHOUT review (we re-read it on the clip's page) and may replace an existing sheet
// (the click is confirmation; the old prompt stays in the history). Fast path: a clip whose references all have their image goes straight to
// compilation (the preparation steps are « passées »).

/** The steps of an Open H3 IR sheet (preparation then compilation). The labels of the assets / prompts / images steps are completed along the way
 * (« Création d'assets (2) », « Images (1/3) »). */
const ETAPES_PREPARATION_FICHE = [
  { cle: "references", libelle: "Choix des références" },
  { cle: "assets", libelle: "Création d'assets" },
  { cle: "prompts", libelle: "Prompts d'assets" },
  { cle: "images", libelle: "Images" },
  { cle: "compilation", libelle: "Compilation Open H3 IR" },
] as const;

/** `preparation`: clip to prepare; `rapide`: references ready (direct compilation). */
export type ParcoursFichePlan = "preparation" | "rapide";

export const etapesFichePlan = (parcours: ParcoursFichePlan = "preparation"): EtapeDemande[] => {
  return ETAPES_PREPARATION_FICHE.map((e, i) => ({
    cle: e.cle,
    libelle: e.libelle,
    statut: parcours === "rapide" ? (e.cle === "compilation" ? ("en_cours" as const) : ("passe" as const)) : i === 0 ? ("en_cours" as const) : ("a_venir" as const),
  }));
};

/** Changes the label of a step (counters « Images (1/3) »). Pure. */
export const renommerEtape = (etapes: EtapeDemande[], cle: string, libelle: string): EtapeDemande[] => etapes.map((e) => (e.cle === cle ? { ...e, libelle } : e));

/** What a clip's preparation keeps between two turns of the pilot (nothing in memory). */
type ContextePreparation = {
  /** Re-choose the references even if the clip already has some (explicit request; never by default). */
  rechoisir?: boolean;
  /** The `references-plan` task (only posted in case of doubt from the code). */
  referencesRunUuid?: string;
  /** The assets created for this clip (missing ones), by code. */
  assetsCrees?: string[];
  /** The `prompt-asset` batch posted for the references without a prompt. */
  promptsPropositionUuid?: string;
  /** The codes whose image generation was launched by this request. */
  imagesLancees?: string[];
};

export type ContexteFichePlan = {
  /** The clip's title: for the queue. */
  titre: string;
  planUuid: string;
  /** The last agent task posted (choice of references, prompts, compilation): the panel's line follows its state. */
  runUuid?: string;
  /** Open H3 IR settings chosen at launch (absent: those of the clip, its scene or the project). */
  reglagesH3ir?: { shots?: number | null; director?: string | null; creativity?: string | null };
  preparation?: ContextePreparation;
  /** What the request has to say at the end (references chosen, assets created). */
  notes?: string[];
};

/** What the agent's proposal allows for a sheet: it must write the sheet; the missing assets it cites are created with it (it
 * is applied after them). Pure. */
export type DecisionFichePlan = { action: "attendre" } | { action: "fait" } | { action: "echec"; erreur: string } | { action: "appliquer"; changementIds: number[] };

export function decisionFichePlan(prop: PropositionAjout | null): DecisionFichePlan {
  if (!prop || prop.statut === "en_generation") return { action: "attendre" };
  if (prop.statut === "appliquee") return { action: "fait" };
  if (prop.statut === "echouee") return { action: "echec", erreur: prop.erreur ?? "L'agent n'a pas réussi à écrire cette fiche." };
  if (prop.statut === "annulee") return { action: "echec", erreur: "La proposition a été annulée." };
  const tous = prop.groupes.flatMap((g) => g.changements);
  const fiche = tous.find((c) => c.cibleType === "fiche");
  if (!fiche) return { action: "echec", erreur: "L'agent n'a pas proposé de fiche." };
  if (fiche.refuseRaison) return { action: "echec", erreur: fiche.refuseRaison };
  if (fiche.bloque) return { action: "echec", erreur: fiche.avertissements.find((w) => w.type === "bloque_controle")?.texte ?? "Un contrôle empêche d'enregistrer cette fiche." };
  // The asset creations refused or blocked stay unticked; the sheet itself depends only on those it cites.
  const retenus = tous.filter((c) => c.id === fiche.id || (c.cibleType === "asset" && c.operation === "creer" && !c.refuseRaison && !c.bloque));
  return { action: "appliquer", changementIds: retenus.map((c) => c.id) };
}

/** Moves step `cle` to `statut` and launches the next one if we have just finished it; `sauter` marks them « passées » (e.g. no rewrite). */
export function avancerEtapes(etapes: EtapeDemande[], cle: string, statut: StatutEtapeDemande, sauter: string[] = []): EtapeDemande[] {
  const res = etapes.map((e) => (e.cle === cle ? { ...e, statut } : sauter.includes(e.cle) ? { ...e, statut: "passe" as const } : e));
  if (statut === "fait" || statut === "passe") {
    const suivante = res.find((e) => !estEtapeFinale(e));
    if (suivante && suivante.statut === "a_venir") return res.map((e) => (e.cle === suivante.cle ? { ...e, statut: "en_cours" as const } : e));
  }
  return res;
}
