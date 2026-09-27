import {
  pgTable,
  serial,
  integer,
  text,
  varchar,
  boolean,
  timestamp,
  pgEnum,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

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

// Structure en mouvements narratifs du scénario (skill `scenario` — ex. "Le
// Spectacle", "La Confrontation", "La Fuite"). Plage indicative, pas une FK
// stricte : un plan garde sa propre mouvementId, les deux peuvent légèrement
// diverger sans casser quoi que ce soit — c'est du récit, pas de la génération.
export const mouvements = pgTable("mouvements", {
  id: serial("id").primaryKey(),
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
// Champs "scénario" (sujet → assetsRequis) : remplis dès la naissance du
// plan, au stade brouillon (skill `scenario`). Champs "fiche de plan"
// (dureeGenerationSecondes, fps, mode, seed) : n'ont de sens réel qu'une
// fois le plan développé (planPromptSections écrites) — voir "brouillon"
// ci-dessus. Les deux jeux de champs cohabitent sur la même ligne plutôt que
// deux tables, conformément au principe du CDC : le plan est LA table pivot.
export const plans = pgTable("plans", {
  id: serial("id").primaryKey(),
  numero: integer("numero").notNull().unique(),
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
export const assets = pgTable("assets", {
  id: serial("id").primaryKey(),
  code: varchar("code", { length: 100 }).notNull().unique(), // CHAR_maya, DEC_auberge_salle...
  type: varchar("type", { length: 30 }).notNull(), // personnage | decor | voix | prop | fx | keyframe | autre
  statut: assetStatutEnum("statut").notNull().default("a_produire"),
  description: text("description"),
  // Prompt de génération (Krea 2 / Qwen Image Edit / Qwen3-TTS selon le
  // type) — distinct de la description canonique : l'un décrit le sujet
  // pour la continuité narrative, l'autre est ce qu'on colle dans ComfyUI.
  promptGeneration: text("prompt_generation"),
  fichier: varchar("fichier", { length: 255 }),
  critique: boolean("critique").notNull().default(false),
  deriveDeId: integer("derive_de_id"),
});

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

// Réglages globaux clé/valeur : clause de style, plafond de durée (15s),
// marge de respiration, nombre de tentatives (2 — F04).
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
}));

export const mouvementsRelations = relations(mouvements, ({ many }) => ({
  plans: many(plans),
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
