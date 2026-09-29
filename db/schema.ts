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
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

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
// dans la queue Shots qu'une fois "développé" (action explicite qui bascule
// vers en_attente). Clarifié avec l'utilisateur le 2026-09-27 : l'app doit
// suivre l'ordre réel du pipeline (Scénario → Fiche de plan → Assets → Shots).
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

// Structure en mouvements narratifs du scénario (skill `scenario` — ex. "Le
// Spectacle", "La Confrontation", "La Fuite"). Plage indicative, pas une FK
// stricte vers les plans : un plan garde sa propre mouvementId, les deux
// peuvent légèrement diverger sans casser quoi que ce soit — c'est du
// récit, pas de la génération. episodeId, lui, est une vraie FK : un
// mouvement appartient à un seul épisode (2026-09-28).
export const mouvements = pgTable("mouvements", {
  id: serial("id").primaryKey(),
  episodeId: integer("episode_id")
    .notNull()
    .references(() => episodes.id, { onDelete: "cascade" }),
  ordre: integer("ordre").notNull(),
  titre: varchar("titre", { length: 255 }).notNull(),
  planNumeroDebut: integer("plan_numero_debut").notNull(),
  planNumeroFin: integer("plan_numero_fin").notNull(),
  fonction: text("fonction"),
  dureeApproxSecondes: integer("duree_approx_secondes"),
});

// Le plan est la table pivot du système (numéro jamais réutilisé ni
// renuméroté — voir docs/FRICTIONS.md F03). numeros_source garde la trace
// des fusions/scissions d'affichage, ce n'est jamais une clé.
//
// Continuité du numéro : à l'échelle de l'ÉPISODE (révisé 2026-09-28 — un
// numéro élevé dans un épisode récent laisserait sinon penser à tort qu'on
// est loin dans la série, alors que ce serait son premier plan). Chaque
// épisode a sa propre séquence, jamais partagée avec les autres — `numero`
// seul n'identifie donc plus un plan sans ambiguïté dès qu'un projet a
// plusieurs épisodes. L'identifiant réel reste `id` (jamais exposé) ;
// l'étiquette humaine non ambiguë (ex. "E01_P010") se calcule à la volée
// depuis episode.numero + numero, jamais stockée.
// projectId est dénormalisé (dérivable via episodeId → seasons → projects)
// uniquement pour éviter une jointure à 3 tables sur chaque requête "tous
// les plans du projet X" — il ne porte plus de contrainte d'unicité.
//
// Champs "scénario" (sujet → assetsRequis) : remplis dès la naissance du
// plan, au stade brouillon (skill `scenario`). Champs "fiche de plan"
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
  numero: integer("numero").notNull(),
  numerosSource: integer("numeros_source").array(),
  titre: varchar("titre", { length: 255 }).notNull(),
  acte: varchar("acte", { length: 100 }),
  mouvementId: integer("mouvement_id").references(() => mouvements.id),
  valeur: text("valeur"),
  sujet: text("sujet"),
  decor: text("decor"),
  lumiere: text("lumiere"),
  mouvementCamera: text("mouvement_camera"),
  son: text("son"),
  intention: text("intention"),
  assetsRequis: text("assets_requis"),
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
}, (table) => [
  unique().on(table.episodeId, table.numero),
]);

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

// La voix prime sur les bruitages en cas de concurrence de slots audio
// (arbitrage F02, 2026-09-17). dureeSecondes est mesurée, jamais estimée.
export const planDialogues = pgTable("plan_dialogues", {
  id: serial("id").primaryKey(),
  planId: integer("plan_id")
    .notNull()
    .references(() => plans.id, { onDelete: "cascade" }),
  slot: integer("slot").notNull(),
  locuteur: varchar("locuteur", { length: 100 }).notNull(),
  assetVoixId: integer("asset_voix_id").references(() => assets.id),
  replique: text("replique").notNull(),
  dureeSecondes: integer("duree_secondes"),
});

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
  fichier: varchar("fichier", { length: 255 }),
  critique: boolean("critique").notNull().default(false),
  deriveDeId: integer("derive_de_id"),
}, (table) => [
  unique().on(table.projectId, table.code),
]);

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
  mouvement: one(mouvements, { fields: [plans.mouvementId], references: [mouvements.id] }),
  project: one(projects, { fields: [plans.projectId], references: [projects.id] }),
  episode: one(episodes, { fields: [plans.episodeId], references: [episodes.id] }),
}));

export const mouvementsRelations = relations(mouvements, ({ many, one }) => ({
  plans: many(plans),
  episode: one(episodes, { fields: [mouvements.episodeId], references: [episodes.id] }),
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
  mouvements: many(mouvements),
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
  assetVoix: one(assets, { fields: [planDialogues.assetVoixId], references: [assets.id] }),
}));

export const jobsRelations = relations(jobs, ({ one }) => ({
  plan: one(plans, { fields: [jobs.planId], references: [plans.id] }),
}));
