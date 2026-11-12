import type { NoteAffichee } from "./fiche-affichage";
/** Système d'agents — types partagés par le serveur, le worker et l'interface
 * (conversation → brief → proposition → revue → application). Aucun accès base, disque
 * ni Next ici : ce fichier est importable partout, y compris par des composants client.
 * Voir docs/CONCEPTION_AGENTS.md §14 et les décisions du 2026-10-02 (docs/FRICTIONS.md). */

// ---------------------------------------------------------------------------
// Vocabulaire
// ---------------------------------------------------------------------------

/** Ce que la demande vise. `projet` = tout ; `asset` = un seul asset (id interne). */
export const PORTEES = ["projet", "episode", "plan", "asset"] as const;
export type Portee = (typeof PORTEES)[number];

/** `courte` : Consigne → Proposition → Appliqué (itérations ciblées).
 * `complete` : Conversation → Brief → Proposition → Appliqué (création de projet,
 * gros éléments interconnectés). L'étape Brief n'existe qu'en profondeur complète.
 */
const PROFONDEURS = ["courte", "complete"] as const;
export type Profondeur = (typeof PROFONDEURS)[number];

/** Étape courante d'une conversation (le fil d'étapes de la popup). */
const ETAPES = ["consigne", "conversation", "brief", "proposition", "applique"] as const;
export type Etape = (typeof ETAPES)[number];

const STATUTS_PROPOSITION = ["en_generation", "prete", "appliquee", "partielle", "rejetee", "echouee"] as const;
export type StatutProposition = (typeof STATUTS_PROPOSITION)[number];

const OPERATIONS = ["creer", "modifier", "supprimer"] as const;
export type Operation = (typeof OPERATIONS)[number];

/** Ce qu'un changement touche. Les applicateurs existent pour tous ces types. `fiche` (2026-10-02, étape 3 « fiches de plan ») :
 * le prompt H3 d'un plan (ses six sections), ses références picture/audio et sa durée de génération ;
 * écriture complète (Open H3 IR) ou partielle (seulement certaines sections, iteration-plan). */
const CIBLES = ["brief", "projet", "episode", "scene", "asset", "plan", "fiche"] as const;
export type CibleType = (typeof CIBLES)[number];

/** Qui a posé un champ du brief : `fourni` (l'utilisateur l'a dit ou corrigé),
 * `deduit` (l'agent l'a conclu), `a_valider` (inventé ou incertain). */
const STATUTS_CHAMP = ["fourni", "deduit", "a_valider"] as const;
export type StatutChamp = (typeof STATUTS_CHAMP)[number];

const TYPES_AVERTISSEMENT = [
  "ecrase_valide", // écrase un élément déjà validé / protégé
  "invention", // l'agent a ajouté ce que le brief ne disait pas
  "hors_portee", // hors de la portée demandée : refusé à l'application
  "bloque_controle", // un contrôle mécanique échoue (ex. durée > 15 s) : à corriger
  "contredit_brief", // contredit le brief
  "non_pris_en_charge", // cible ou champ que l'application ne sait pas encore écrire
  "alerte_controle", // un contrôle de la sortie signale un défaut qui ne bloque pas (ex. shot sous 1,5 s)
  "info",
] as const;
type TypeAvertissement = (typeof TYPES_AVERTISSEMENT)[number];
export type Avertissement = { type: TypeAvertissement; texte: string };

/** Où insérer un plan. Pas de numéro de plan (F03) : un uuid de plan existant, ou le
 * début/la fin de l'épisode. La revue affiche les rangs qui bougent (`rangsDeplaces`). */
export type Position = { apresPlanUuid: string } | { debut: true } | { fin: true };

/** Où insérer une SCÈNE : après une scène existante (id), ou au début du film. */
export type PlaceScene = { apresSceneId: number } | { debut: true };

/** Comment l'UI désigne une cible existante ; le serveur la résout en id interne.
 * Épisode : `id` (les pages utilisent déjà ces ids) ; plan : `uuid` ; asset : `code`
 * (ou `id`). Null/absent pour la portée `projet`. */
export type CibleDemandee = { id?: number; uuid?: string; code?: string };

// ---------------------------------------------------------------------------
// Messages, tâches
// ---------------------------------------------------------------------------

/** Une carte de choix proposée par le scénariste (validée par lib/agents/choix.ts). `multiple` n'est vrai que pour une liste. */
export type OptionChoix = { libelle: string; description?: string };
export type Choix = { question?: string; multiple: boolean; options: OptionChoix[] };

/** `choix` : cartes proposées avec un message de l'agent. `choisis` : libellés retenus, portés par le message de l'utilisateur
 * qui répond par une carte (absent quand il a écrit sa réponse). */
export type MessageConversation = { role: "user" | "assistant"; content: string; at: string; choix?: Choix; choisis?: string[] };

/** La tâche de la file (agent_runs) liée à une étape : un tour de conversation, la
 * génération du brief ou d'une proposition. Null quand rien n'est en cours. */
export type EtatTache = {
  runUuid: string;
  /** `but` de la tâche : ce qu'elle produit. */
  but: "tour" | "brief" | "proposition" | "affiche" | "essai";
  statut: "en_attente" | "en_cours" | "termine" | "echoue" | "annulee";
  /** Jetons de sortie reçus (le maximum est inconnu : un compteur, pas une barre). */
  progressionJetons: number | null;
  /** Streaming : le texte de la réponse (JSON en train de s'écrire, borné) et la fin de la réflexion, pendant l'appel. */
  fluxTexte?: string | null;
  fluxReflexion?: string | null;
  erreur: string | null;
  /** Rang dans la file des tâches GPU en attente (1 = la prochaine) ; null si en cours/finie. */
  positionFile: number | null;
};

// ---------------------------------------------------------------------------
// Brief
// ---------------------------------------------------------------------------

export const RYTHMES_BRIEF = ["lent", "mesure", "soutenu", "rapide", "variable"] as const;
export type RythmeBrief = (typeof RYTHMES_BRIEF)[number];

/** Un personnage du brief. `age` et `apparence` sont obligatoires pour tout nouveau brief (ils alimentent l'image
 * ET la voix) ; ils restent optionnels ici pour les briefs écrits avant. */
export type PersonnageBrief = {
  nom: string;
  role: string;
  reconnaissable: string;
  /** Âge apparent, concret (« adolescente, 15 ans », « homme d'une quarantaine d'années »). */
  age?: string;
  /** Ce qu'on VOIT : corps, visage, cheveux, tenue. Jamais un rôle, une voix ni une action. */
  apparence?: string;
  /** Comment il bouge ou agit quand c'est ce qui le définit (combat, métier, démarche). */
  gestuelle?: string;
  voix?: string;
  /** La tenue, assez précise pour dessiner la fiche du personnage (facultative ; `statut` posé par le code depuis les citations). */
  tenue?: TenueBrief;
  statut?: string;
};

/** Statut d'un détail du brief (tenue, aspect d'un lieu, élément), posé par le CODE depuis les citations (lib/agents/fiche.ts) : `incertain` =
 * dit, mais en termes vagues (« inspirée de… » sans couleur ni matière). */
type StatutDetailBrief = "fourni" | "deduit" | "delegue" | "incertain";

type TenueBrief = {
  coupe?: string;
  couleurs?: string;
  matieres?: string;
  accessoires?: string;
  signeDistinctif?: string;
  /** Raccord de tenue : change-t-elle au fil du film, et quand. */
  evolution?: string;
  statut?: StatutDetailBrief;
};

type LieuBrief = {
  nom: string;
  description: string;
  /** L'aspect du lieu (facultatif) : lumière et heure, matières, palette, ambiance. */
  aspect?: { lumiere?: string; matieres?: string; palette?: string; ambiance?: string; statut?: StatutDetailBrief };
  statut?: string;
};

/** Un effet visuel (`vfx`) ou un objet qui compte à l'écran (`prop`), comme les types d'asset du même nom. */
type ElementBrief = {
  nom: string;
  nature: "vfx" | "prop";
  description: string;
  couleur?: string;
  ampleur?: string;
  comportement?: string;
  statut?: StatutDetailBrief;
};

/** Le brief stocké (`lib/agents/brief-schema.json` ; ses sections se remplissent via `notes-entretien`). Les clés de premier niveau sont les « sections » du brief.
 * Les anciennes sections « Contraintes » (continuite, rimes, progressions, pieges) n'existent plus : un brief ancien qui les porte
 * encore est lu sans elles (`sansClesAbandonnees`, brief.ts). */
export type BriefContenu = {
  titre: string;
  source: "pitch" | "texte" | "reconstitue";
  arc: string;
  genreTon?: string;
  /** `promptImage` (anglais, long : génère les images) et `image` (2:3, présentation) sont posés par le CODE à la création du projet
   * (conception, lib/projects/conception.ts), jamais par un agent ; `clause` (courte) part vers la vidéo. */
  style: { nom: string; clause: string; promptImage?: string; image?: string };
  langueDialogues: string;
  /** Absente dans un brief « partiel » (posé à la main : style, notes). */
  dureeEpisodeSecondes?: number;
  /** Cadence générale (lent → rapide) : elle règle la durée et la densité de coupes des plans. */
  rythme?: RythmeBrief;
  /** Œuvre ou univers préexistant dont on respecte les noms, apparences et règles ; vide pour un projet original. */
  univers?: string;
  episodes: { titre: string; resume: string; portee?: string }[];
  personnages: PersonnageBrief[];
  lieux: LieuBrief[];
  /** Effets visuels et objets qui comptent (facultatif : absent des briefs écrits avant le 2026-11-08). */
  elements?: ElementBrief[];
  inventions: string[];
  questionsOuvertes: string[];
  /** Notes libres du projet (ex-« globaux du scénario ») ; texte de l'utilisateur, jamais inventé. */
  notes?: string;
};

/** Sections affichables d'un brief, dans l'ordre, avec leur libellé et leur groupe
 * (la popup range les sections par groupe : Univers, Style, Épisodes…). */
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
  /** `brouillon` : sorti d'une conversation, pas encore appliqué ; `valide` : référence du projet ;
   * `partiel` : posé à la main (style, notes…) sans brief complet — c'est la SOURCE de la clause de
   * style du projet même quand l'agent n'a encore rien rédigé. */
  statut: "partiel" | "brouillon" | "valide";
  source: "conversation" | "reconstitue";
  version: number;
  contenu: BriefContenu;
  /** Les sections dans l'ordre d'affichage, avec le statut de chacune. */
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
  /** La cible sous la forme que `ouvrirConversation` attend (épisode : `{ id }`, plan :
   * `{ uuid }`, asset : `{ code }`) : à réutiliser telle quelle pour rouvrir la conversation ;
   * null pour la portée `projet`. */
  cible: CibleDemandee | null;
  /** Libellé lisible de la cible (« Épisode 1 · Le sel », « CHAR_maya », « Projet »). */
  cibleLibelle: string;
  profondeur: Profondeur;
  etape: Etape;
  messages: MessageConversation[];
  consigne: string;
  /** L'agent estime avoir de quoi écrire le brief : l'UI propose « Vers le briefing ». */
  briefPret: boolean;
  /** Ce qu'il reste à définir avec l'utilisateur (phrases courtes), remis à jour par l'agent à chaque tour. */
  resteADefinir: string[];
  /** La fiche de notes de l'entretien, mise en forme pour l'écran (sujets de l'entretien d'abord) ; vide hors entretien d'entrée. */
  notes: NoteAffichee[];
  propositionUuid: string | null;
  /** Tâche en cours ou la dernière non vue (tour, brief) ; null sinon. */
  tache: EtatTache | null;
  createdAt: string;
  updatedAt: string;
};

// ---------------------------------------------------------------------------
// Proposition et revue
// ---------------------------------------------------------------------------

/** Ce que l'agent a lu automatiquement (la ligne « contexte utilisé » dépliable). */
export type ContexteUtilise = {
  type: "brief" | "projet" | "episode" | "plan" | "asset" | "registre";
  libelle: string;
  ref?: string;
};

/** Un plan voisin dont le rang change à cause d'une insertion (revue : « les plans
 * suivants bougent »). Rangs affichés, base 1. */
export type RangDeplace = { planUuid: string; titre: string; rangAvant: number; rangApres: number };

export type VueChangement = {
  id: number;
  ordre: number;
  /** Lot : le titre de la scène sous laquelle ranger un plan ou une réplique (null sinon). */
  sousGroupe: string | null;
  /** Groupe d'affichage : `ecrasement` (risque d'écrasement, section spéciale), `brief`, puis
   * un groupe par type/portée (« Épisodes », « Plans de la scène X »…). */
  groupe: string;
  cle: string | null;
  cibleType: CibleType;
  cibleRef: string | null;
  libelle: string;
  operation: Operation;
  avant: unknown;
  apres: unknown;
  position: Position | null;
  /** Création de plan : les plans existants dont le rang change. */
  rangsDeplaces: RangDeplace[];
  avertissements: Avertissement[];
  /** En clair : ce qui sera perdu (null si rien). */
  ecrase: string | null;
  /** Retenu pour l'application. */
  coche: boolean;
  /** Un contrôle mécanique échoue (avertissement `bloque_controle`) : non cochable tant
   * que ce n'est pas corrigé (`corrigerChangement`). */
  bloque: boolean;
  /** Refusé d'office (hors portée, non pris en charge) : jamais appliqué ; la raison. */
  refuseRaison: string | null;
  appliqueAt: string | null;
};

/** Une sous-tâche d'un lot (ex. « écrire l'épisode 2 ») : son état courant (la dernière tâche
 * posée pour cette clé), pour la liste de la popup. */
export type VueSousTache = {
  cle: string;
  libelle: string;
  /** Épisode concerné (lot de scénarios) ; null pour un autre type de lot. */
  episodeId: number | null;
  runUuid: string;
  statut: "en_attente" | "en_cours" | "termine" | "echoue" | "annulee";
  progressionJetons: number | null;
  erreur: string | null;
  /** Rang dans la file des tâches GPU (1 = la prochaine) ; null si elle n'attend pas. */
  positionFile: number | null;
  /** Changements que cette sous-tâche a produits (0 tant qu'elle n'est pas finie). */
  nbChangements: number;
  /** Une relance a déjà eu lieu (tâche plus ancienne pour la même clé). */
  relancee: boolean;
};

/** L'état agrégé d'un lot : « 3/12 » dans le header comme dans la popup. */
export type VueLot = {
  sousTaches: VueSousTache[];
  total: number;
  terminees: number;
  echecs: number;
  annulees: number;
  /** En attente ou en cours. */
  actives: number;
};

export type VueGroupe = {
  id: string;
  titre: string;
  changements: VueChangement[];
  /** Nombre de changements cochés / cochables du groupe. */
  coches: number;
  total: number;
};

export type CompteursProposition = {
  total: number;
  selectionnes: number;
  ecartes: number;
  bloques: number;
  refuses: number;
  /** Écrasements d'éléments validés parmi les changements sélectionnés. */
  ecrasementsSelectionnes: number;
  inventions: number;
};

/** Ce que `appliquerSelection` demande de confirmer quand la sélection écrase du validé. */
export type EcrasementAConfirmer = { changementId: number; libelle: string; ecrase: string };

/** Le diagnostic d'une correction après visionnage (skill `iteration-plan`), tel que la revue l'affiche : il
 * existe même quand rien n'est écrit (durée incohérente, cause hors du prompt, abandon). Lu depuis le résultat
 * de la tâche (agent_runs.resultat), jamais stocké ailleurs. */
export type DiagnosticIteration = {
  symptome: string;
  cause: string;
  categorie: string | null;
  confiance: "haute" | "moyenne" | "faible";
  verification: string | null;
  dureeCoherente: boolean;
  entreeLexique: { symptome: string; cause: string; formulationQuiTient: string } | null;
  abandon: { propose: boolean; raison: string } | null;
  /** Ce que l'agent décide de changer (validé, seulement ce qui change) : la fiche est alors recompilée par Open H3 IR avec ces valeurs, écrites
   * avec elle. Null : rien à recompiler (diagnostic seul, durée incohérente, abandon, ancien contrat). */
  decisions: DecisionsIteration | null;
  /** Les décisions avant → après, pour la page du plan. */
  affichage: DecisionsAffichees | null;
  /** Assets que l'agent suggère de créer (jamais créés par l'itération, deux au plus). */
  assetsSuggeres: { code: string; type: string; parent?: string; raison: string }[];
};

/** Les décisions EFFECTIVES d'une itération (lib/agents/iteration-plan.ts, `decisionsEffectives`) : absent = ne change pas. La nouvelle valeur
 * REMPLACE celle du plan (pas de directive qui s'accumule). */
export type DecisionsIteration = {
  /** Le nouvel intent COMPLET (remplace `plans.description`). */
  description?: string;
  /** La nouvelle durée de génération (4 à 10 s). */
  dureeSecondes?: number;
  /** Codes du registre à ajouter / retirer des références d'image du plan. */
  references?: { ajouter: string[]; retirer: string[] };
  /** Réglages Open H3 IR du PLAN (`plans.creativite`, `plans.style_camera` ; `"aucun"` = pas de style). */
  reglages?: { creativite?: string; styleCamera?: string };
  /** Assets à CRÉER (deux au plus, code et parent valides) : créés d'office, leur image générée, puis ajoutés aux références avant la recompilation
   * (vague 4a, 2026-11-09). */
  manquants?: { code: string; type: string; parent: string | null; description: string; raison: string }[];
};

/** Les décisions telles que la page d'un plan les montre (« Itérer »). */
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
  /** Retour libre de l'utilisateur ayant produit cette proposition (affinage). */
  retour: string | null;
  parentUuid: string | null;
  resume: string;
  contexte: ContexteUtilise[];
  erreur: string | null;
  groupes: VueGroupe[];
  compteurs: CompteursProposition;
  /** Les écrasements cochés qu'`appliquerSelection` exigera de confirmer. */
  ecrasements: EcrasementAConfirmer[];
  /** Tâche de génération (en_generation) ; null une fois prête. Pour un lot : null (voir `lot`). */
  tache: EtatTache | null;
  /** Proposition en lot (plusieurs sous-tâches, ex. un épisode chacune) ; null sinon. */
  lot: VueLot | null;
  /** Correction après visionnage (`iteration-plan`) : le diagnostic de l'agent ; null sinon ou tant qu'il n'a pas répondu. */
  diagnostic: DiagnosticIteration | null;
  createdAt: string;
  appliedAt: string | null;
};

/** Un épisode proposable à l'écriture de son scénario (sélecteur du lot). */
export type EpisodePourScenario = {
  id: number;
  numero: number;
  titre: string;
  /** Aucun plan ni scène : le cas normal d'un squelette tout juste appliqué. */
  vide: boolean;
  nbPlans: number;
  nbScenes: number;
};

/** Un plan proposable à l'écriture de sa fiche (sélecteur du lot « fiches de plan »). L'identifiant
 * est l'uuid ; `rang` n'est qu'une position affichée dans l'épisode (F03). */
export type PlanPourFiche = {
  uuid: string;
  titre: string;
  rang: number;
  episodeId: number;
  episodeLibelle: string;
  sceneTitre: string | null;
  dureeSecondes: number;
  /** Au moins une section du prompt non vide : réécrire = risque d'écrasement (décoché d'office). */
  aDesSections: boolean;
  /** Références picture/audio déjà posées. */
  nbRefs: number;
  /** Un rendu vidéo existe : la fiche ne lui correspondra plus. */
  aUnRendu: boolean;
  /** Plan sans intention (description) : l'agent n'aura que son titre. */
  sansIntention: boolean;
};

/** Estimation affichée avant de lancer une génération (au niveau du bouton). */
export type EstimationGeneration = {
  fournisseur: string;
  modele: string;
  /** Local = gratuit ; `null` tant qu'aucun fournisseur payant n'existe. */
  coutEstimeUsd: number | null;
  jetonsEntreeEstimes: number;
  dureeEstimeeSecondes: number;
  /** Tâches GPU en attente devant celle-ci (0 = elle passe tout de suite). */
  tachesDevant: number;
  /** Nom du skill qui sera exécuté (null si la proposition se construit en code, sans LLM). */
  skill: string | null;
};

// ---------------------------------------------------------------------------
// Résultats d'actions
// ---------------------------------------------------------------------------

export type Resultat<T extends object = object> = ({ ok: true } & T) | { ok: false; erreur: string };

export type ResultatApplication =
  | { ok: true; statut: "appliquee" | "partielle"; appliques: number; ecartes: number; refuses: number }
  | { ok: false; erreur: string; confirmationRequise?: EcrasementAConfirmer[] };
