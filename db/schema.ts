import {
  pgTable,
  serial,
  integer,
  text,
  varchar,
  boolean,
  timestamp,
  pgEnum,
  unique,
  uniqueIndex,
  uuid,
  real,
  jsonb,
  index,
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";

// Racine de toute hiérarchie : un OneShot est un projet à 1 saison + 1
// épisode créés automatiquement (jamais montrés dans la nav) — un seul
// schéma pour les deux types, décidé avec l'utilisateur le 2026-09-28 pour
// éviter deux chemins de code différents dans les pages/requêtes.
export const projectTypeEnum = pgEnum("project_type", ["oneshot", "serie"]);

// "previsualise" distingue un plan dont la dernière génération réussie était
// une prévisualisation (sans upscale) de "termine" (rendu final upscale) —
// clarifié avec l'utilisateur le 2026-09-27, la confusion venait de
// l'absence de cet état intermédiaire dans le mockup.
// "brouillon" : plan né du scénario, découpage narratif écrit mais fiche de
// plan (prompt H3, refs, durée de génération) pas encore rédigée — n'entre
// dans la queue Plans qu'une fois "développé" (action explicite qui bascule
// vers en_attente). Clarifié avec l'utilisateur le 2026-09-27 : l'app doit
// suivre l'ordre réel du pipeline (Scénario → Fiche de plan → Assets → Plans).
export const planStatutEnum = pgEnum("plan_statut", [
  "brouillon",
  "en_attente",
  "en_cours",
  "echoue",
  "rejoue",
  "previsualise",
  "termine",
]);

export const jobStatutEnum = pgEnum("job_statut", [
  "en_attente",
  "en_cours",
  "echoue",
  "termine",
]);

export const refTypeEnum = pgEnum("ref_type", ["picture", "video", "audio"]);

export const assetStatutEnum = pgEnum("asset_statut", [
  "a_produire",
  "en_cours",
  "valide",
]);

// Racine d'un projet vidéo — OneShot ou Série (2026-09-28). clauseStyle
// porte le réglage qui ne bouge pas à l'échelle du projet (retour
// utilisateur : "des prompts qui vont pas bouger à l'échelle de la saison
// voire du projet") — ex-DEFAULT global de lib/params.ts, migré ici. Un seul
// niveau d'héritage volontairement : pas de surcharge par saison/épisode
// tant que le besoin ne s'est pas fait sentir (cohérent avec la doctrine
// FRICTIONS.md : pas d'investissement avant qu'une friction concrète ne
// coûte du temps).
//
// Les champs scenario_arc/style/continuite/rimes/pieges (2026-09-28→2026-
// 09-28) ont été retirés le même jour que leur ajout : retour utilisateur,
// ils faisaient doublon avec le résumé d'épisode (episodes.resume) et la
// clause de style, ou relevaient de la vigilance de l'utilisateur plutôt
// que d'un champ à remplir. Remplacés par `notes`, texte libre sans
// structure imposée.
export const projects = pgTable("projects", {
  id: serial("id").primaryKey(),
  nom: varchar("nom", { length: 255 }).notNull(),
  type: projectTypeEnum("type").notNull(),
  // Poster "affiche de film" (2026-09-28) — même convention que
  // assets.fichier : juste le nom de fichier, chemin de stockage résolu par
  // lib/media.ts. Repli en l'absence de fichier : géré côté rendu (pas de
  // valeur ici), pas de vraie image placeholder à générer.
  posterFichier: varchar("poster_fichier", { length: 255 }),
  clauseStyle: text("clause_style").notNull().default(""),
  notes: text("notes").notNull().default(""),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const seasons = pgTable("seasons", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  numero: integer("numero").notNull(),
  titre: varchar("titre", { length: 255 }).notNull(),
  posterFichier: varchar("poster_fichier", { length: 255 }),
});

export const episodes = pgTable("episodes", {
  id: serial("id").primaryKey(),
  seasonId: integer("season_id")
    .notNull()
    .references(() => seasons.id, { onDelete: "cascade" }),
  numero: integer("numero").notNull(),
  titre: varchar("titre", { length: 255 }).notNull(),
  resume: text("resume").notNull().default(""),
  posterFichier: varchar("poster_fichier", { length: 255 }),
});

// Scènes d'un épisode (2026-09-29 — ex-« mouvements » : un épisode est composé
// de scènes). Un plan se rattache à une scène (plans.sceneId, nullable) au fur
// et à mesure. Plage de numéros et durée d'une scène ne sont PAS stockées :
// elles se déduisent des plans rattachés (min/max des numéros, somme des
// durées de montage), donc jamais désynchronisées quand un plan est inséré,
// supprimé ou déplacé. `ordre` ne sert qu'à départager les scènes vides ou
// de même premier plan. episodeId est une vraie FK : une scène appartient à
// un seul épisode.
export const scenes = pgTable("scenes", {
  id: serial("id").primaryKey(),
  episodeId: integer("episode_id")
    .notNull()
    .references(() => episodes.id, { onDelete: "cascade" }),
  ordre: integer("ordre").notNull(),
  titre: varchar("titre", { length: 255 }).notNull(),
  fonction: text("fonction"),
});

// Le plan est la table pivot du système. Identification (révisé 2026-09-29,
// voir docs/FRICTIONS.md F03) : plus AUCUN numéro de plan. `uuid` est
// l'identifiant public, stable, utilisé dans les URL ; `id` (serial) reste la
// clé technique interne (FK, dossiers de rendu du worker), jamais exposée.
// L'ORDRE des plans est `ordre` ; ce qu'on affiche est la position (rang dans
// l'épisode). numeros_source ne garde que la trace de l'import du markdown
// (numéros des plans source fusionnés) — jamais une clé pour l'application.
//
// projectId est dénormalisé (dérivable via episodeId → seasons → projects)
// uniquement pour éviter une jointure à 3 tables sur chaque requête "tous
// les plans du projet X" — il ne porte plus de contrainte d'unicité.
//
// Champ "scénario" (description) : rempli dès la naissance du plan, au stade
// brouillon. Reste narratif (2026-09-29) : valeur/décor/lumière/caméra/son
// sont des décisions de prompt, écrites par [Shot N] dans
// detailed_description, jamais dupliquées ici. Aucun champ ne référence un
// autre plan (raccord/sortie retirés le même jour : ils se désynchronisent
// dès qu'on insère ou supprime un plan). Les assets ne sont PAS déclarés au
// scénario : on écrit d'abord l'histoire, puis on rattache/crée les assets
// (plan_refs) depuis la fiche de plan. Champs "fiche de plan"
// (dureeGenerationSecondes, fps, mode, seed) : n'ont de sens réel qu'une
// fois le plan développé (planPromptSections écrites) — voir "brouillon"
// ci-dessus. Les deux jeux de champs cohabitent sur la même ligne plutôt que
// deux tables, conformément au principe du CDC : le plan est LA table pivot.
export const plans = pgTable("plans", {
  id: serial("id").primaryKey(),
  // Cascade sur les deux (2026-09-28, règles de suppression) : un plan ne
  // survit jamais à la suppression de son épisode ou de son projet — voir
  // docs/FRICTIONS.md, section suppression en cascade.
  projectId: integer("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  episodeId: integer("episode_id")
    .notNull()
    .references(() => episodes.id, { onDelete: "cascade" }),
  uuid: uuid("uuid").notNull().defaultRandom().unique(),
  // Position du plan dans l'épisode (2026-09-29) : c'est elle, et non un numéro,
  // qui donne l'ordre de lecture/montage. Réordonnable par glisser-déposer ;
  // réécrite densément (0..n) à chaque déplacement, jamais une clé.
  ordre: integer("ordre").notNull().default(0),
  numerosSource: integer("numeros_source").array(),
  titre: varchar("titre", { length: 255 }).notNull(),
  acte: varchar("acte", { length: 100 }),
  sceneId: integer("scene_id").references(() => scenes.id),
  description: text("description"),
  dureeMontageSecondes: integer("duree_montage_secondes").notNull(),
  dureeGenerationSecondes: integer("duree_generation_secondes").notNull(),
  fps: integer("fps").notNull().default(24),
  mode: varchar("mode", { length: 20 }).notNull().default("full-reference"),
  timecodeMusique: varchar("timecode_musique", { length: 50 }),
  statut: planStatutEnum("statut").notNull().default("brouillon"),
  seed: text("seed"),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// Le prompt H3 découpé par section (format officiel MiniMax H3 — voir
// .claude/skills/fiche-de-plan/references/h3-guide-fullref.md). Une retouche
// vise presque toujours detailed_description : l'isoler par section est le
// point qui débloque la boucle F03 (2 à 30 itérations/plan).
export const planPromptSections = pgTable("plan_prompt_sections", {
  id: serial("id").primaryKey(),
  planId: integer("plan_id")
    .notNull()
    .references(() => plans.id, { onDelete: "cascade" }),
  section: varchar("section", { length: 40 }).notNull(), // subject_definitions | summary | retention_analysis | detailed_description | overall_soundscape | non_diegetic_music
  ordre: integer("ordre").notNull(),
  contenu: text("contenu").notNull().default(""),
});

// Références image/vidéo/audio d'un plan — max 6 picture+video, max 3 audio
// (contraintes MiniMax H3, vérifiées côté application, pas en DB).
export const planRefs = pgTable("plan_refs", {
  id: serial("id").primaryKey(),
  planId: integer("plan_id")
    .notNull()
    .references(() => plans.id, { onDelete: "cascade" }),
  type: refTypeEnum("type").notNull(),
  slot: integer("slot").notNull(), // le N de <Picture N> / <Audio N> / <Video N>
  assetId: integer("asset_id").references(() => assets.id),
  role: text("role"),
  retention: varchar("retention", { length: 30 }), // audio uniquement : "reference"...
});

// Réplique = entité autonome (2026-09-30, docs/FRICTIONS.md F02 révision) :
// elle naît du scénario ou du casting, AVANT toute fiche de plan, et survit à
// la suppression d'un plan qui la cite. Identifiant public `uuid` (comme les
// plans) ; `ordre` = position dans l'épisode (dense, réécrite à chaque
// déplacement, jamais une clé).
//
// Locuteur : `locuteurId` (asset personnage) quand c'est un personnage ; sinon
// `locuteurTexte` libre (foule, « inconnu »). La VOIX se déduit du personnage
// (voix_fiches.personnageId) — `voixId` n'existe que pour un locuteur qui n'est
// PAS un personnage (voix off, conspirateurs de S01 : des voix du catalogue sans
// asset personnage) et ne se remplit jamais pour un personnage qui a sa voix.
//
// `fichier` = prise audio (nom de fichier, rangée sous repliques/<id>/, voir
// lib/media.ts) ; `fichierTexte` = le texte au moment où la prise a été posée,
// pour signaler « prise à refaire » quand le texte change ensuite.
// `dureeSecondes` est MESURÉE sur la prise (F03), jamais estimée. `statut`
// (a_produire | prise_posee | validee) : varchar contrôlé côté application
// (lib/repliques.ts), pas d'enum pg.
export const repliques = pgTable("repliques", {
  id: serial("id").primaryKey(),
  uuid: uuid("uuid").notNull().defaultRandom().unique(),
  projectId: integer("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  episodeId: integer("episode_id")
    .notNull()
    .references(() => episodes.id, { onDelete: "cascade" }),
  sceneId: integer("scene_id").references(() => scenes.id, { onDelete: "set null" }),
  ordre: integer("ordre").notNull().default(0),
  // Sans cascade vers assets (comme plan_refs) : un personnage/une voix cité
  // ne se supprime pas tant qu'il est lié (voir app/assets/actions.ts).
  locuteurId: integer("locuteur_id").references(() => assets.id),
  locuteurTexte: varchar("locuteur_texte", { length: 100 }).notNull().default(""),
  voixId: integer("voix_id").references(() => assets.id),
  texte: text("texte").notNull(),
  fichier: varchar("fichier", { length: 255 }),
  fichierTexte: text("fichier_texte"),
  dureeSecondes: real("duree_secondes"),
  statut: varchar("statut", { length: 20 }).notNull().default("a_produire"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// Table d'assemblage plan ↔ réplique (n-n) : plusieurs répliques par plan
// (champ-contrechamp), une même réplique dans plusieurs plans. `slot` = son
// emplacement <Audio N> dans le plan (3 max, MiniMax H3) : l'audio de la
// réplique EST la référence audio, dérivée d'ici, jamais recopiée dans
// plan_refs. La voix prime sur les bruitages en cas de concurrence de slots
// (arbitrage F02, 2026-09-17). `debutSecondes` : indicatif (le moment où la
// réplique est dite se dit dans le prompt H3), jamais une contrainte.
export const planDialogues = pgTable("plan_dialogues", {
  id: serial("id").primaryKey(),
  planId: integer("plan_id")
    .notNull()
    .references(() => plans.id, { onDelete: "cascade" }),
  repliqueId: integer("replique_id")
    .notNull()
    .references(() => repliques.id, { onDelete: "cascade" }),
  slot: integer("slot").notNull(),
  debutSecondes: real("debut_secondes"),
}, (table) => [
  unique().on(table.planId, table.slot),
  unique().on(table.planId, table.repliqueId),
]);

// Registre d'assets en arborescence par sujet (deriveDeId) — voir
// lib/queries.ts:getAssetsTree. Édition manuelle complète depuis /assets.
// Rattaché au PROJET (2026-09-28), pas à l'épisode : un personnage (Maya)
// existe sur toute la série, pas seulement dans un épisode donné. code
// reste unique, mais par projet — deux projets distincts peuvent avoir
// chacun un asset nommé pareil sans collision.
export const assets = pgTable("assets", {
  id: serial("id").primaryKey(),
  // Cascade (2026-09-28, règles de suppression) : le seul cas où un asset
  // disparaît, c'est la suppression du projet entier — un plan/épisode/
  // saison supprimé, lui, ne fait que détacher ses refs vers l'asset (voir
  // plan_refs/plan_dialogues, qui n'ont pas de cascade vers assets).
  projectId: integer("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  code: varchar("code", { length: 100 }).notNull(), // CHAR_maya, DEC_auberge_salle...
  type: varchar("type", { length: 30 }).notNull(), // personnage | decor | voix | prop | vfx | sfx | keyframe | oth
  statut: assetStatutEnum("statut").notNull().default("a_produire"),
  description: text("description"),
  // Prompt de génération (Krea 2 / Qwen Image Edit / Qwen3-TTS selon le
  // type) — distinct de la description canonique : l'un décrit le sujet
  // pour la continuité narrative, l'autre est ce qu'on colle dans ComfyUI.
  promptGeneration: text("prompt_generation"),
  // Comment l'image se fabrique : "generation" (text-to-image, Krea 2) ou
  // "edition" (Qwen Image Edit, à partir de l'image du parent). Distinct du
  // lien deriveDeId, qui dit seulement à quelle famille l'asset appartient :
  // un effet (flammes, éclairs) rattaché à un master se génère de zéro. null =
  // pas encore choisi (un master vaut "generation"). Sans objet pour une voix.
  methodeGeneration: varchar("methode_generation", { length: 12 }),
  fichier: varchar("fichier", { length: 255 }),
  critique: boolean("critique").notNull().default(false),
  deriveDeId: integer("derive_de_id"),
}, (table) => [
  unique().on(table.projectId, table.code),
]);

// ---------------------------------------------------------------------
// Casting vocal (F06, CDC §6 — 2026-09-30). Une voix RESTE un asset de type
// "voix" (code VOICE_*, statut, critique, fichier = référence de clonage,
// promptGeneration = instruction VoiceDesign retenue) : le catalogue n'est
// qu'une vue spécialisée du registre, pas un second registre. Ces tables ne
// portent que ce que le registre générique ne sait pas dire — le carnet
// d'atelier du skill voix-comfyui (ex-REGISTRE_VOIX.md, jamais créé).
//
// Aucun enum pg : verdicts en varchar, contrôlés côté application (voir
// lib/voix.ts) — évite le piège « ajouter + utiliser une valeur d'enum dans
// le même lot de migrations ».
// ---------------------------------------------------------------------

// Fiche 1:1 d'un asset voix. Le personnage rattaché est un simple lien (pas
// deriveDeId) : F01 range la voix dans son propre catalogue, séparé de
// l'arbre des dérivés du personnage.
//
// Casting en quatre étapes (2026-09-30) : 1. la voix (`source` = "design" :
// instruction VoiceDesign dans assets.promptGeneration ; "reference" : audio
// fourni, rogné à la longueur de la réplique, dans assets.fichier) + `refText`
// (texte de la référence, au mot près dans les deux cas) ; 2. la référence
// générée (assets.fichier) ; 3. le test vidéo (décor, personnage, texte, audio
// optionnel) ; 4. les répliques. Plus de règle absolue, de température, de
// seed, de carnet de candidats ni de test de tenue.
export const voixFiches = pgTable("voix_fiches", {
  assetId: integer("asset_id")
    .primaryKey()
    .references(() => assets.id, { onDelete: "cascade" }),
  personnageId: integer("personnage_id").references(() => assets.id, { onDelete: "set null" }),
  source: varchar("source", { length: 12 }).notNull().default("design"), // design | reference
  langue: varchar("langue", { length: 40 }).notNull().default("French"),
  // Texte lu dans la référence — au mot près, que la référence soit générée
  // (design) ou fournie (audio).
  refText: text("ref_text").notNull().default(""),
  // Test vidéo (ex-plan utilitaire T1) : décor et personnage optionnels, texte
  // libre, audio déjà prêt (sinon la voix de référence), rendu déposé à la main.
  testDecorId: integer("test_decor_id").references(() => assets.id, { onDelete: "set null" }),
  testPersonnageId: integer("test_personnage_id").references(() => assets.id, { onDelete: "set null" }),
  testTexte: text("test_texte").notNull().default(""),
  testAudio: varchar("test_audio", { length: 255 }),
  testVideo: varchar("test_video", { length: 255 }),
}, (table) => [
  // Un personnage a au plus UNE voix (2026-09-30) ; personnageId reste
  // nullable (voix off, narrateur). À relâcher si un personnage reçoit un jour
  // plusieurs voix.
  uniqueIndex("voix_fiches_personnage_unique")
    .on(table.personnageId)
    .where(sql`${table.personnageId} is not null`),
]);

// Générations d'images d'un asset (tâche ComfyUI dédiée, 2026-09-30) : chaque
// ligne est une demande, avec un instantané de ce qui a été soumis (prompt,
// clause de style, format, seed). Le résultat est un CANDIDAT : il n'entre dans
// le registre (assets.fichier) que quand l'utilisateur l'adopte, jamais tout
// seul (F01 : une image remplace le nœud, elle ne s'accumule pas dans l'asset).
// `statut` : en_attente | en_cours | termine | echoue (varchar contrôlé côté
// application, pas d'enum pg). `methode` : "generation" (text-to-image, Krea 2) ;
// "edition" (Qwen Image Edit) viendra ensuite.
export const assetGenerations = pgTable("asset_generations", {
  id: serial("id").primaryKey(),
  uuid: uuid("uuid").notNull().defaultRandom().unique(),
  assetId: integer("asset_id")
    .notNull()
    .references(() => assets.id, { onDelete: "cascade" }),
  methode: varchar("methode", { length: 12 }).notNull().default("generation"),
  statut: varchar("statut", { length: 12 }).notNull().default("en_attente"),
  prompt: text("prompt").notNull(),
  clauseStyle: text("clause_style").notNull().default(""),
  aspect: varchar("aspect", { length: 8 }).notNull().default("1:1"),
  megapixels: real("megapixels").notNull().default(1),
  loraPersonnage: boolean("lora_personnage").notNull().default(false),
  // Mode « à partir d'images » (méthode edition) : true = Lightning 4 étapes,
  // false = « Qualité » (40 étapes CFG 4). null pour le mode texte.
  lightning: boolean("lightning"),
  seed: text("seed").notNull(),
  comfyuiPromptId: varchar("comfyui_prompt_id", { length: 100 }),
  fichier: varchar("fichier", { length: 255 }),
  erreur: text("erreur"),
  // Progression relayée par le worker (WebSocket ComfyUI) : le navigateur ne
  // parle pas à ComfyUI. Remis à null en fin de tâche ; l'aperçu est un fichier
  // écrasé sous generations/<assetId>/, `apercuAt` sert de version à l'URL.
  progressionValeur: integer("progression_valeur"),
  progressionMax: integer("progression_max"),
  etapeLibelle: varchar("etape_libelle", { length: 80 }),
  apercuFichier: varchar("apercu_fichier", { length: 255 }),
  apercuAt: timestamp("apercu_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  startedAt: timestamp("started_at"),
  finishedAt: timestamp("finished_at"),
  // « Vu » : l'utilisateur a pris connaissance du résultat ou de l'échec
  // (indicateur du header). null = pas encore vu.
  vuAt: timestamp("vu_at"),
  // Annulation d'une tâche EN COURS : l'interface pose le drapeau, le worker agit
  // (lib/annulation.ts). Une tâche en attente s'annule directement, sans drapeau.
  annulationDemandeeAt: timestamp("annulation_demandee_at"),
});

// Images sources d'une génération « à partir d'images » (IMG_Simple_Edit : de 1
// à 3, la position 1 est la cible modifiée). `fichier` est un INSTANTANÉ pris au
// lancement : pour une source 'asset', le nom du fichier de l'asset (sous
// assets/) ; pour une source 'import', le nom sous generations/<assetId>/sources/
// (jetable, jamais rattaché au registre). Supprimées avec leur génération.
export const assetGenerationSources = pgTable(
  "asset_generation_sources",
  {
    id: serial("id").primaryKey(),
    generationId: integer("generation_id")
      .notNull()
      .references(() => assetGenerations.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    origine: varchar("origine", { length: 8 }).notNull(),
    assetId: integer("asset_id").references(() => assets.id, { onDelete: "set null" }),
    fichier: varchar("fichier", { length: 255 }).notNull(),
  },
  (t) => [unique("asset_generation_sources_position_unique").on(t.generationId, t.position)],
);

// La queue F04 vit ici, pas dans plans.statut seul : un plan accumule
// plusieurs jobs (échecs + rejeux), plans.statut n'est que la projection
// du dernier job.
export const jobs = pgTable("jobs", {
  id: serial("id").primaryKey(),
  planId: integer("plan_id")
    .notNull()
    .references(() => plans.id, { onDelete: "cascade" }),
  statut: jobStatutEnum("statut").notNull().default("en_attente"),
  tentative: integer("tentative").notNull().default(1),
  // Toggle prévisualisation/rendu final (F04, décidé le 2026-09-26) : la
  // sortie basse résolution (sans upscale) sert aux itérations rapides de
  // prompt (F03), le rendu final upscale une fois le plan validé.
  activerUpscale: boolean("activer_upscale").notNull().default(true),
  comfyuiPromptId: varchar("comfyui_prompt_id", { length: 100 }),
  workflowFichier: varchar("workflow_fichier", { length: 255 }).notNull(),
  seedUtilisee: text("seed_utilisee"),
  cheminSortie: varchar("chemin_sortie", { length: 500 }),
  erreur: text("erreur"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  startedAt: timestamp("started_at"),
  finishedAt: timestamp("finished_at"),
  // « Vu » : voir asset_generations.vuAt.
  vuAt: timestamp("vu_at"),
  // Annulation : voir asset_generations.annulationDemandeeAt. Une vidéo annulée finit
  // `echoue` avec l'erreur « Annulée » (pas de statut d'enum de plus).
  annulationDemandeeAt: timestamp("annulation_demandee_at"),
});

// Réglages globaux clé/valeur, techniques et indépendants du récit : plafond
// de durée (15s), marge de respiration, nombre de tentatives (2 — F04). La
// clause de style et les réglages scénario (arc, style, continuité, rimes,
// pièges) ont migré sur `projects` le 2026-09-28 — ce sont des réglages
// propres à une histoire, pas des constantes du pipeline.
export const parametres = pgTable("parametres", {
  cle: varchar("cle", { length: 100 }).primaryKey(),
  valeur: text("valeur").notNull(),
});

export const plansRelations = relations(plans, ({ many, one }) => ({
  promptSections: many(planPromptSections),
  refs: many(planRefs),
  dialogues: many(planDialogues),
  jobs: many(jobs),
  scene: one(scenes, { fields: [plans.sceneId], references: [scenes.id] }),
  project: one(projects, { fields: [plans.projectId], references: [projects.id] }),
  episode: one(episodes, { fields: [plans.episodeId], references: [episodes.id] }),
}));

export const scenesRelations = relations(scenes, ({ many, one }) => ({
  plans: many(plans),
  episode: one(episodes, { fields: [scenes.episodeId], references: [episodes.id] }),
}));

export const projectsRelations = relations(projects, ({ many }) => ({
  seasons: many(seasons),
  plans: many(plans),
  assets: many(assets),
}));

export const seasonsRelations = relations(seasons, ({ many, one }) => ({
  project: one(projects, { fields: [seasons.projectId], references: [projects.id] }),
  episodes: many(episodes),
}));

export const episodesRelations = relations(episodes, ({ many, one }) => ({
  season: one(seasons, { fields: [episodes.seasonId], references: [seasons.id] }),
  scenes: many(scenes),
  plans: many(plans),
}));

export const assetsRelations = relations(assets, ({ one }) => ({
  project: one(projects, { fields: [assets.projectId], references: [projects.id] }),
}));

export const planPromptSectionsRelations = relations(
  planPromptSections,
  ({ one }) => ({
    plan: one(plans, { fields: [planPromptSections.planId], references: [plans.id] }),
  }),
);

export const planRefsRelations = relations(planRefs, ({ one }) => ({
  plan: one(plans, { fields: [planRefs.planId], references: [plans.id] }),
  asset: one(assets, { fields: [planRefs.assetId], references: [assets.id] }),
}));

export const planDialoguesRelations = relations(planDialogues, ({ one }) => ({
  plan: one(plans, { fields: [planDialogues.planId], references: [plans.id] }),
  replique: one(repliques, { fields: [planDialogues.repliqueId], references: [repliques.id] }),
}));

export const repliquesRelations = relations(repliques, ({ many, one }) => ({
  episode: one(episodes, { fields: [repliques.episodeId], references: [episodes.id] }),
  liaisons: many(planDialogues),
}));

export const jobsRelations = relations(jobs, ({ one }) => ({
  plan: one(plans, { fields: [jobs.planId], references: [plans.id] }),
}));

// Journal de chaque exécution d'un skill d'agent (brique LLM, lib/llm/) : ce que
// le modèle a reçu, ce qu'il a rendu, ce que la validation en a dit. C'est le
// journal de frictions automatisé et le jeu d'évaluation (docs/CONCEPTION_AGENTS.md
// §7 et §10). Le lien vers une proposition viendra avec les propositions.
export const agentTraces = pgTable("agent_traces", {
  id: serial("id").primaryKey(),
  uuid: uuid("uuid").notNull().defaultRandom().unique(),
  skill: varchar("skill", { length: 40 }).notNull(),
  fournisseur: varchar("fournisseur", { length: 30 }).notNull(),
  modele: varchar("modele", { length: 80 }).notNull(),
  // ok | invalide (sortie hors schéma même après renvoi) | echoue (serveur,
  // réseau, délai) | interrompu (annulé). Varchar contrôlé par l'application.
  statut: varchar("statut", { length: 12 }).notNull(),
  projectId: integer("project_id").references(() => projects.id, { onDelete: "set null" }),
  // Messages d'entrée (hors prompt système, qui est celui du skill : on garde son
  // empreinte pour savoir quelle version des fichiers l'a produit).
  messages: jsonb("messages").notNull(),
  systemeEmpreinte: varchar("systeme_empreinte", { length: 64 }).notNull(),
  systemeCaracteres: integer("systeme_caracteres").notNull(),
  sortieBrute: text("sortie_brute"),
  json: jsonb("json"),
  erreursValidation: jsonb("erreurs_validation"),
  erreur: text("erreur"),
  renvois: integer("renvois").notNull().default(0),
  tokensEntree: integer("tokens_entree").notNull().default(0),
  tokensSortie: integer("tokens_sortie").notNull().default(0),
  dureeMs: integer("duree_ms").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [index("agent_traces_skill_created_idx").on(table.skill, table.createdAt)]);

// File des appels LLM (genre « llm » du worker, voir worker/llm.ts) : un appel à
// un skill d'agent posé en base, pris par le worker comme une génération d'image.
// Le GPU est une ressource unique partagée avec ComfyUI : l'ordonnanceur
// (worker/ordonnanceur.ts) range ces tâches entre les images et les vidéos.
// `statut` : en_attente | en_cours | termine | echoue | annulee (varchar contrôlé
// par l'application, pas d'enum pg). `entree` est ce que `executerSkill` reçoit
// (texte, objet ou conversation) ; `resultat` le JSON validé contre le schéma du
// skill. La trace complète (messages, sortie brute, jetons) est dans agent_traces.
export const agentRuns = pgTable("agent_runs", {
  id: serial("id").primaryKey(),
  uuid: uuid("uuid").notNull().defaultRandom().unique(),
  skill: varchar("skill", { length: 40 }).notNull(),
  projectId: integer("project_id").references(() => projects.id, { onDelete: "set null" }),
  entree: jsonb("entree").notNull(),
  // { modele?: string } — surcharge du modèle ; vide = celui de la configuration.
  options: jsonb("options"),
  statut: varchar("statut", { length: 12 }).notNull().default("en_attente"),
  // Jetons de sortie reçus au fil de l'eau (le maximum est inconnu : pas de barre
  // à pourcentage, un simple compteur). Remis à null en fin de tâche.
  progressionJetons: integer("progression_jetons"),
  resultat: jsonb("resultat"),
  erreur: text("erreur"),
  traceId: integer("trace_id").references(() => agentTraces.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  startedAt: timestamp("started_at"),
  finishedAt: timestamp("finished_at"),
  vuAt: timestamp("vu_at"),
  annulationDemandeeAt: timestamp("annulation_demandee_at"),
}, (table) => [index("agent_runs_statut_idx").on(table.statut, table.createdAt)]);
