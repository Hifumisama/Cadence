import type { NoteAffichee } from "./sheet-display";
/** Agent system — types shared by the server, the worker and the interface
 * (conversation → brief → proposal → review → application). No database, disk
 * or Next access here: this file is importable everywhere, including by client components.
 * See docs/CONCEPTION_AGENTS.md §14 and the decisions of 2026-10-02 (docs/FRICTIONS.md). */

// ---------------------------------------------------------------------------
// Vocabulary
// ---------------------------------------------------------------------------

/** What the request targets. `projet` = everything; `asset` = a single asset (internal id). */
export const PORTEES = ["projet", "episode", "plan", "asset"] as const;
export type Portee = (typeof PORTEES)[number];

/** `courte`: Instruction → Proposal → Applied (targeted iterations).
 * `complete`: Conversation → Brief → Proposal → Applied (project creation,
 * large interconnected elements). The Brief step only exists at full depth.
 */
const PROFONDEURS = ["courte", "complete"] as const;
export type Profondeur = (typeof PROFONDEURS)[number];

/** Current step of a conversation (the popup's step strip). */
const ETAPES = ["consigne", "conversation", "brief", "proposition", "applique"] as const;
export type Etape = (typeof ETAPES)[number];

const STATUTS_PROPOSITION = ["en_generation", "prete", "appliquee", "annulee", "echouee"] as const;
export type StatutProposition = (typeof STATUTS_PROPOSITION)[number];

const OPERATIONS = ["creer", "modifier", "supprimer"] as const;
export type Operation = (typeof OPERATIONS)[number];

/** What a change touches. Appliers exist for all these types. `fiche` (2026-10-02, step 3 "fiches de plan"):
 * a clip's H3 prompt (its six sections), its picture/audio references and its generation duration;
 * whole write (Open H3 IR) or partial (only some sections, iteration-plan). */
const CIBLES = ["brief", "projet", "episode", "scene", "asset", "plan", "fiche"] as const;
export type CibleType = (typeof CIBLES)[number];

/** Who set a brief field: `fourni` (the user said or corrected it),
 * `deduit` (the agent concluded it), `a_valider` (invented or uncertain). */
const STATUTS_CHAMP = ["fourni", "deduit", "a_valider"] as const;
export type StatutChamp = (typeof STATUTS_CHAMP)[number];

const TYPES_AVERTISSEMENT = [
  "ecrase_valide", // overwrites an already validated / protected element
  "invention", // the agent added what the brief did not say
  "hors_portee", // out of the requested scope: refused at application
  "bloque_controle", // a mechanical check fails (e.g. duration > 15 s): to fix
  "contredit_brief", // contradicts the brief
  "non_pris_en_charge", // target or field the application cannot write yet
  "alerte_controle", // an output check flags a defect that does not block (e.g. shot under 1.5 s)
  "info",
] as const;
type TypeAvertissement = (typeof TYPES_AVERTISSEMENT)[number];
export type Avertissement = { type: TypeAvertissement; texte: string };

/** Where to insert a clip. No clip number (F03): an existing clip's uuid, or the
 * start/end of the episode. The review shows the ranks that move (`rangsDeplaces`). */
export type Position = { apresPlanUuid: string } | { debut: true } | { fin: true };

/** Where to insert a SCENE: after an existing scene (id), or at the start of the film. */
export type PlaceScene = { apresSceneId: number } | { debut: true };

/** How the UI designates an existing target; the server resolves it to an internal id.
 * Episode: `id` (the pages already use these ids); clip: `uuid`; asset: `code`
 * (or `id`). Null/absent for the `projet` scope. */
export type CibleDemandee = { id?: number; uuid?: string; code?: string };

// ---------------------------------------------------------------------------
// Messages, tasks
// ---------------------------------------------------------------------------

/** A choice card proposed by the screenwriter (validated by lib/agents/choice.ts). `multiple` is true only for a list. */
export type OptionChoix = { libelle: string; description?: string };
export type Choix = { question?: string; multiple: boolean; options: OptionChoix[] };

/** `choix`: cards proposed with an agent message. `choisis`: labels kept, carried by the user message
 * that answers with a card (absent when they wrote their answer). */
export type MessageConversation = { role: "user" | "assistant"; content: string; at: string; choix?: Choix; choisis?: string[] };

/** The queue task (agent_runs) linked to a step: a conversation turn, the
 * brief generation or a proposal. Null when nothing is running. */
export type EtatTache = {
  runUuid: string;
  /** The task's `but`: what it produces. */
  but: "tour" | "brief" | "proposition" | "affiche" | "essai";
  statut: "en_attente" | "en_cours" | "termine" | "echoue" | "annulee";
  /** Output tokens received (the maximum is unknown: a counter, not a bar). */
  progressionJetons: number | null;
  /** Streaming: the reply text (JSON being written, capped) and the end of the reasoning, during the call. */
  fluxTexte?: string | null;
  fluxReflexion?: string | null;
  erreur: string | null;
  /** Rank in the queue of pending GPU tasks (1 = next); null if running/finished. */
  positionFile: number | null;
};

// ---------------------------------------------------------------------------
// Brief
// ---------------------------------------------------------------------------

export const RYTHMES_BRIEF = ["lent", "mesure", "soutenu", "rapide", "variable"] as const;
export type RythmeBrief = (typeof RYTHMES_BRIEF)[number];

/** A brief character. `age` and `apparence` are mandatory for any new brief (they feed the image
 * AND the voice); they stay optional here for briefs written before. */
export type PersonnageBrief = {
  nom: string;
  role: string;
  reconnaissable: string;
  /** Apparent, concrete age ("adolescente, 15 ans", "homme d'une quarantaine d'années"). */
  age?: string;
  /** What is SEEN: body, face, hair, costume. Never a role, a voice nor an action. */
  apparence?: string;
  /** How they move or act when that is what defines them (combat, trade, bearing). */
  gestuelle?: string;
  voix?: string;
  /** The costume, precise enough to draw the character's sheet (optional; `statut` set by the code from the quotes). */
  tenue?: TenueBrief;
  statut?: string;
};

/** Status of a brief detail (costume, look of a place, element), set by the CODE from the quotes (lib/agents/sheet.ts): `incertain` =
 * said, but in vague terms ("inspirée de…" without colour nor material). */
type StatutDetailBrief = "fourni" | "deduit" | "delegue" | "incertain";

type TenueBrief = {
  coupe?: string;
  couleurs?: string;
  matieres?: string;
  accessoires?: string;
  signeDistinctif?: string;
  /** Costume continuity: does it change over the film, and when. */
  evolution?: string;
  statut?: StatutDetailBrief;
};

type LieuBrief = {
  nom: string;
  description: string;
  /** The place's look (optional): light and time of day, materials, palette, ambiance. */
  aspect?: { lumiere?: string; matieres?: string; palette?: string; ambiance?: string; statut?: StatutDetailBrief };
  statut?: string;
};

/** A visual effect (`vfx`) or an object that matters on screen (`prop`), like the asset types of the same name. */
type ElementBrief = {
  nom: string;
  nature: "vfx" | "prop";
  description: string;
  couleur?: string;
  ampleur?: string;
  comportement?: string;
  statut?: StatutDetailBrief;
};

/** The stored brief (`lib/agents/brief-schema.json`; its sections are filled via `notes-entretien`). The top-level keys are the brief's "sections".
 * The old "Contraintes" sections (continuite, rimes, progressions, pieges) no longer exist: an old brief that still carries them
 * is read without them (`sansClesAbandonnees`, brief.ts). */
export type BriefContenu = {
  titre: string;
  source: "pitch" | "texte" | "reconstitue";
  arc: string;
  genreTon?: string;
  /** `promptImage` (English, long: generates the images) and `image` (2:3, presentation) are set by the CODE when the project is created
   * (design, lib/projects/design.ts), never by an agent; `clause` (short) goes to the video. */
  style: { nom: string; clause: string; promptImage?: string; image?: string };
  langueDialogues: string;
  /** Absent in a "partiel" brief (set by hand: style, notes). */
  dureeEpisodeSecondes?: number;
  /** General pace (slow → fast): it sets the clips' duration and cut density. */
  rythme?: RythmeBrief;
  /** A pre-existing work or universe whose names, looks and rules are respected; empty for an original project. */
  univers?: string;
  episodes: { titre: string; resume: string; portee?: string }[];
  personnages: PersonnageBrief[];
  lieux: LieuBrief[];
  /** Visual effects and props that matter (optional: absent from briefs written before 2026-11-08). */
  elements?: ElementBrief[];
  inventions: string[];
  questionsOuvertes: string[];
  /** The project's free notes (formerly "scenario globals"); the user's text, never invented. */
  notes?: string;
};

/** Displayable brief sections, in order, with their label and group
 * (the popup sorts the sections by group: Univers, Style, Épisodes…). */
export const SECTIONS_BRIEF = [
  { cle: "titre", libelle: "Titre", groupe: "Univers" },
  { cle: "arc", libelle: "Arc", groupe: "Univers" },
  { cle: "genreTon", libelle: "Genre et ton", groupe: "Univers" },
  { cle: "langueDialogues", libelle: "Langue des dialogues", groupe: "Univers" },
  { cle: "dureeEpisodeSecondes", libelle: "Durée d'un épisode (s)", groupe: "Univers" },
  { cle: "rythme", libelle: "Rythme (lent, mesure, soutenu, rapide, variable)", groupe: "Univers" },
  { cle: "univers", libelle: "Univers ou œuvre de référence", groupe: "Univers" },
  { cle: "style", libelle: "Style et clause de style", groupe: "Style" },
  { cle: "episodes", libelle: "Épisodes", groupe: "Épisodes" },
  { cle: "personnages", libelle: "Personnages", groupe: "Personnages" },
  { cle: "lieux", libelle: "Lieux", groupe: "Lieux" },
  { cle: "elements", libelle: "Effets visuels et objets", groupe: "Lieux" },
  { cle: "inventions", libelle: "Inventions de l'agent", groupe: "Notes de l'agent" },
  { cle: "questionsOuvertes", libelle: "Questions encore ouvertes", groupe: "Notes de l'agent" },
  { cle: "notes", libelle: "Notes du projet", groupe: "Notes" },
] as const;
export type CleSectionBrief = (typeof SECTIONS_BRIEF)[number]["cle"];

export type SectionBrief = {
  cle: CleSectionBrief;
  libelle: string;
  groupe: string;
  statut: StatutChamp;
  valeur: unknown;
};

export type VueBrief = {
  projectId: number;
  /** `brouillon`: out of a conversation, not yet applied; `valide`: the project's reference;
   * `partiel`: set by hand (style, notes…) without a complete brief — it is the SOURCE of the project's
   * style clause even when the agent has not written anything yet. */
  statut: "partiel" | "brouillon" | "valide";
  source: "conversation" | "reconstitue";
  version: number;
  contenu: BriefContenu;
  /** The sections in display order, with the status of each. */
  sections: SectionBrief[];
  updatedAt: string;
};

// ---------------------------------------------------------------------------
// Conversation
// ---------------------------------------------------------------------------

export type VueConversation = {
  uuid: string;
  projectId: number;
  portee: Portee;
  cibleId: number | null;
  /** The target in the shape `ouvrirConversation` expects (episode: `{ id }`, clip:
   * `{ uuid }`, asset: `{ code }`): to be reused as is to reopen the conversation;
   * null for the `projet` scope. */
  cible: CibleDemandee | null;
  /** Readable label of the target ("Épisode 1 · Le sel", "CHAR_maya", "Projet"). */
  cibleLibelle: string;
  profondeur: Profondeur;
  etape: Etape;
  messages: MessageConversation[];
  consigne: string;
  /** The agent considers it has enough to write the brief: the UI offers "Vers le briefing". */
  briefPret: boolean;
  /** What is still to be defined with the user (short sentences), updated by the agent on each turn. */
  resteADefinir: string[];
  /** The interview's notes sheet, formatted for the screen (interview subjects first); empty outside the intake interview. */
  notes: NoteAffichee[];
  propositionUuid: string | null;
  /** Task running or the last unseen one (turn, brief); null otherwise. */
  tache: EtatTache | null;
  createdAt: string;
  updatedAt: string;
};

// ---------------------------------------------------------------------------
// Proposal and review
// ---------------------------------------------------------------------------

/** What the agent read automatically (the expandable "contexte utilisé" line). */
export type ContexteUtilise = {
  type: "brief" | "projet" | "episode" | "plan" | "asset" | "registre";
  libelle: string;
  ref?: string;
};

/** A neighbouring clip whose rank changes because of an insertion (review: "the following
 * clips move"). Displayed ranks, base 1. */
export type RangDeplace = { planUuid: string; titre: string; rangAvant: number; rangApres: number };

export type VueChangement = {
  id: number;
  ordre: number;
  /** Batch: the title of the scene under which to file a clip or a line of dialogue (null otherwise). */
  sousGroupe: string | null;
  /** Display group: `ecrasement` (overwrite risk, special section), `brief`, then
   * one group per type/scope ("Épisodes", "Plans de la scène X"…). */
  groupe: string;
  cle: string | null;
  cibleType: CibleType;
  cibleRef: string | null;
  libelle: string;
  operation: Operation;
  avant: unknown;
  apres: unknown;
  position: Position | null;
  /** Clip creation: the existing clips whose rank changes. */
  rangsDeplaces: RangDeplace[];
  avertissements: Avertissement[];
  /** In plain terms: what will be lost (null if nothing). */
  ecrase: string | null;
  /** Kept for application. */
  coche: boolean;
  /** A mechanical check fails (`bloque_controle` warning): not tickable until
   * it is fixed (`corrigerChangement`). */
  bloque: boolean;
  /** Refused outright (out of scope, not supported): never applied; the reason. */
  refuseRaison: string | null;
  appliqueAt: string | null;
};

/** A batch subtask (e.g. "write episode 2"): its current state (the last task
 * set for this key), for the popup's list. */
export type VueSousTache = {
  cle: string;
  libelle: string;
  /** Episode concerned (screenplay batch); null for another kind of batch. */
  episodeId: number | null;
  runUuid: string;
  statut: "en_attente" | "en_cours" | "termine" | "echoue" | "annulee";
  progressionJetons: number | null;
  erreur: string | null;
  /** Rank in the GPU task queue (1 = next); null if it is not waiting. */
  positionFile: number | null;
  /** Changes this subtask produced (0 until it is finished). */
  nbChangements: number;
  /** A re-run has already happened (older task for the same key). */
  relancee: boolean;
};

/** The aggregate state of a batch: "3/12" in the header as in the popup. */
export type VueLot = {
  sousTaches: VueSousTache[];
  total: number;
  terminees: number;
  echecs: number;
  annulees: number;
  /** Pending or running. */
  actives: number;
};

export type VueGroupe = {
  id: string;
  titre: string;
  changements: VueChangement[];
  /** Number of ticked / tickable changes in the group. */
  coches: number;
  total: number;
};

export type CompteursProposition = {
  total: number;
  selectionnes: number;
  ecartes: number;
  bloques: number;
  refuses: number;
  /** Overwrites of validated elements among the selected changes. */
  ecrasementsSelectionnes: number;
  inventions: number;
};

/** What `appliquerSelection` asks to confirm when the selection overwrites validated content. */
export type EcrasementAConfirmer = { changementId: number; libelle: string; ecrase: string };

/** The diagnosis of a correction after viewing (skill `iteration-plan`), as the review displays it: it
 * exists even when nothing is written (incoherent duration, cause outside the prompt, giving up). Read from the task's result
 * (agent_runs.resultat), never stored elsewhere. */
export type DiagnosticIteration = {
  symptome: string;
  cause: string;
  categorie: string | null;
  confiance: "haute" | "moyenne" | "faible";
  verification: string | null;
  dureeCoherente: boolean;
  entreeLexique: { symptome: string; cause: string; formulationQuiTient: string } | null;
  abandon: { propose: boolean; raison: string } | null;
  /** What the agent decides to change (validated, only what changes): the sheet is then recompiled by Open H3 IR with these values, written
   * with it. Null: nothing to recompile (diagnosis only, incoherent duration, giving up, old contract). */
  decisions: DecisionsIteration | null;
  /** The decisions before → after, for the clip's page. */
  affichage: DecisionsAffichees | null;
  /** Assets the agent suggests creating (never created by the iteration, two at most). */
  assetsSuggeres: { code: string; type: string; parent?: string; raison: string }[];
};

/** An iteration's EFFECTIVE decisions (lib/agents/iteration-clip.ts, `decisionsEffectives`): absent = unchanged. The new value
 * REPLACES the clip's (no directive that accumulates). */
export type DecisionsIteration = {
  /** The new COMPLETE intent (replaces `plans.description`). */
  description?: string;
  /** The new generation duration (4 to 10 s). */
  dureeSecondes?: number;
  /** Registry codes to add / remove from the clip's image references. */
  references?: { ajouter: string[]; retirer: string[] };
  /** Open H3 IR settings of the CLIP (`plans.creativite`, `plans.style_camera`; `"aucun"` = no style). */
  reglages?: { creativite?: string; styleCamera?: string };
  /** Assets to CREATE (two at most, valid code and parent): created outright, their image generated, then added to the references before the recompilation
   * (wave 4a, 2026-11-09). */
  manquants?: { code: string; type: string; parent: string | null; description: string; raison: string }[];
};

/** The decisions as a clip's page shows them ("Itérer"). */
export type DecisionsAffichees = {
  intent: { avant: string; apres: string } | null;
  duree: { avant: number; apres: number } | null;
  referencesAjoutees: string[];
  referencesRetirees: string[];
  reglages: { libelle: string; avant: string; apres: string }[];
  manquants: { code: string; raison: string }[];
};

export type VueProposition = {
  uuid: string;
  conversationUuid: string | null;
  statut: StatutProposition;
  skill: string;
  portee: Portee;
  cibleId: number | null;
  consigne: string;
  /** The user's free feedback that produced this proposal (refinement). */
  retour: string | null;
  parentUuid: string | null;
  resume: string;
  contexte: ContexteUtilise[];
  erreur: string | null;
  groupes: VueGroupe[];
  compteurs: CompteursProposition;
  /** The ticked overwrites that `appliquerSelection` will require confirming. */
  ecrasements: EcrasementAConfirmer[];
  /** Generation task (en_generation); null once ready. For a batch: null (see `lot`). */
  tache: EtatTache | null;
  /** Batch proposal (several subtasks, e.g. one episode each); null otherwise. */
  lot: VueLot | null;
  /** Correction after viewing (`iteration-plan`): the agent's diagnosis; null otherwise or until it has answered. */
  diagnostic: DiagnosticIteration | null;
  createdAt: string;
  appliedAt: string | null;
};

/** An episode that can be offered for writing its screenplay (batch selector). */
export type EpisodePourScenario = {
  id: number;
  numero: number;
  titre: string;
  /** No clip nor scene: the normal case of a skeleton just applied. */
  vide: boolean;
  nbPlans: number;
  nbScenes: number;
};

/** A clip that can be offered for writing its sheet (selector of the "fiches de plan" batch). The identifier
 * is the uuid; `rang` is only a position displayed in the episode (F03). */
export type PlanPourFiche = {
  uuid: string;
  titre: string;
  rang: number;
  episodeId: number;
  episodeLibelle: string;
  sceneTitre: string | null;
  dureeSecondes: number;
  /** At least one non-empty prompt section: rewriting = overwrite risk (unticked outright). */
  aDesSections: boolean;
  /** Picture/audio references already set. */
  nbRefs: number;
  /** A video render exists: the sheet will no longer match it. */
  aUnRendu: boolean;
  /** Clip without intent (description): the agent will only have its title. */
  sansIntention: boolean;
};

// ---------------------------------------------------------------------------
// Action results
// ---------------------------------------------------------------------------

export type Resultat<T extends object = object> = ({ ok: true } & T) | { ok: false; erreur: string };

export type ResultatApplication =
  | { ok: true; statut: "appliquee"; appliques: number; ecartes: number; refuses: number }
  | { ok: false; erreur: string; confirmationRequise?: EcrasementAConfirmer[] };
