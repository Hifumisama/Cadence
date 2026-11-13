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
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";

// Root of every hierarchy: a project is a film, with its single episode (never shown in the nav). The series concept
// (seasons, project type) was removed on 2026-10-20; the episode remains the unit to which scenes and clips attach.

// "previsualise" distinguishes a clip whose last successful generation was
// a preview (without upscale) from "termine" (final upscaled render) —
// clarified with the user on 2026-09-27, the confusion came from
// the absence of this intermediate state in the mockup.
// "brouillon": clip born from the screenplay, narrative breakdown written but clip
// sheet (H3 prompt, refs, generation duration) not yet written — only enters
// the Clips queue once "développé" (an explicit action that switches it
// to en_attente). Clarified with the user on 2026-09-27: the app must
// follow the real pipeline order (Scénario → Fiche de plan → Assets → Plans).
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

// Root of a video project: a film. 2026-10-02: `clauseStyle` and
// `notes` are now DENORMALIZED COPIES of the BRIEF (single source: `briefs.contenu`
// style.clause / notes), written solely by `synchroniserClauseStyle` (lib/agents/brief-db.ts);
// NEVER write them anywhere else. History: clauseStyle
// held the setting that does not change at project scale (user
// feedback: "des prompts qui vont pas bouger à l'échelle de la saison
// voire du projet") — former global DEFAULT of lib/params.ts, migrated here. A single
// level of inheritance on purpose: no override per season/episode
// until the need is felt (consistent with the FRICTIONS.md doctrine:
// no investment before a concrete friction costs time).
//
// The scenario_arc/style/continuite/rimes/pieges fields (2026-09-28→2026-
// 09-28) were removed the same day they were added: user feedback,
// they duplicated the episode summary (episodes.resume) and the
// style clause, or belonged to the user's vigilance rather than a field to fill. Replaced by `notes`, free text without
// imposed structure.
export const projects = pgTable("projects", {
  id: serial("id").primaryKey(),
  nom: varchar("nom", { length: 255 }).notNull(),
  // Film poster ("affiche de film") (2026-09-28) — same convention as
  // assets.fichier: just the file name, storage path resolved by
  // lib/media.ts. Fallback when there is no file: handled at render time (no
  // value here), no real placeholder image to generate.
  posterFichier: varchar("poster_fichier", { length: 255 }),
  clauseStyle: text("clause_style").notNull().default(""),
  // LONG style prompt (images). Denormalized copy of briefs.contenu.style.promptImage, like clause_style (written by
  // synchroniserClauseStyle); empty for a project without design: the images then fall back to the clause.
  stylePromptImage: text("style_prompt_image").notNull().default(""),
  notes: text("notes").notNull().default(""),
  // Open H3 IR (lib/h3ir/settings.ts): creativity and staging style of the project, inherited by its scenes then its clips. Null = default setting.
  // Varchar controlled by the application (not a Postgres enum); the style is one of the 7 profiles or « aucun ».
  creativite: varchar("creativite", { length: 12 }),
  styleCamera: varchar("style_camera", { length: 20 }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const episodes = pgTable("episodes", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  numero: integer("numero").notNull(),
  titre: varchar("titre", { length: 255 }).notNull(),
  resume: text("resume").notNull().default(""),
  posterFichier: varchar("poster_fichier", { length: 255 }),
});

// Scenes of an episode (2026-09-29 — formerly « mouvements »: an episode is made
// of scenes). A clip attaches to a scene (plans.sceneId, nullable) as
// it goes. The number range and duration of a scene are NOT stored:
// they are derived from the attached clips (min/max of the numbers, sum of the
// edit durations), so never out of sync when a clip is inserted,
// deleted or moved. `ordre` only serves to break ties between empty scenes or
// scenes with the same first clip. episodeId is a real FK: a scene belongs to
// a single episode.
export const scenes = pgTable("scenes", {
  id: serial("id").primaryKey(),
  episodeId: integer("episode_id")
    .notNull()
    .references(() => episodes.id, { onDelete: "cascade" }),
  ordre: integer("ordre").notNull(),
  titre: varchar("titre", { length: 255 }).notNull(),
  fonction: text("fonction"),
  // Scene genre (action, dialogue, montage, contemplatif, tension): REMOVED on 2026-11-09 (too many ambiguous cases).
  // The column stays in the database without a migration, neither read nor written by the application; to be dropped in a future migration.
  genre: varchar("genre", { length: 20 }),
  // Visual frame held across the whole scene (time of day, weather, general light): continuity between clips.
  ambiance: text("ambiance"),
  // Open H3 IR: creativity and staging style of the scene (null = inherits from the project; style « aucun » = forces no style). lib/h3ir/settings.ts.
  creativite: varchar("creativite", { length: 12 }),
  styleCamera: varchar("style_camera", { length: 20 }),
  // The treatment of the scene (lib/agents/treatment.ts): what it tells, where it starts, where it ends, its target duration.
  traitement: jsonb("traitement").$type<{ intention: string; etatEntree: string; etatSortie: string; dureeCibleSecondes: number; momentsDeLAuteur: string }>(),
});

// The clip is the pivot table of the system. Identification (revised 2026-09-29,
// see docs/FRICTIONS.md F03): no clip number at all any more. `uuid` is
// the public, stable identifier, used in URLs; `id` (serial) remains the
// internal technical key (FK, worker render folders), never exposed.
// The ORDER of clips is `ordre`; what is displayed is the position (rank within
// the episode). numeros_source only keeps the trace of the markdown import
// (numbers of the merged source clips) — never a key for the application.
//
// projectId is denormalized (derivable via episodeId → seasons → projects)
// only to avoid a 3-table join on every "all clips of project X" query — it no longer carries a uniqueness constraint.
//
// "Screenplay" field (description): filled as soon as the clip is born, at the
// draft stage. Stays narrative (2026-09-29): value/set/light/camera/sound
// are prompt decisions, written by [Shot N] in
// detailed_description, never duplicated here. No field references another
// clip (continuity/exit removed the same day: they go out of sync
// as soon as a clip is inserted or deleted). Assets are NOT declared in the
// screenplay: the story is written first, then assets are attached/created
// (plan_refs) from the clip sheet. "Clip sheet" fields
// (dureeGenerationSecondes, fps, mode, seed) only make real sense once
// the clip is developed (planPromptSections written) — see "brouillon"
// above. The two sets of fields share the same row rather than
// two tables, per the CDC principle: the clip is THE pivot table.
export const plans = pgTable("plans", {
  id: serial("id").primaryKey(),
  // Cascade on both (2026-09-28, deletion rules): a clip never
  // survives the deletion of its episode or its project — see
  // docs/FRICTIONS.md, section on cascade deletion.
  projectId: integer("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  episodeId: integer("episode_id")
    .notNull()
    .references(() => episodes.id, { onDelete: "cascade" }),
  uuid: uuid("uuid").notNull().defaultRandom().unique(),
  // Position of the clip in the episode (2026-09-29): it is this, and not a number,
  // that gives the order of the SCREENPLAY. Reorderable by drag and drop;
  // densely rewritten (0..n) at each move, never a key. The order of the
  // final edit (what is watched and exported) is separate: `montage_entrees`.
  ordre: integer("ordre").notNull().default(0),
  numerosSource: integer("numeros_source").array(),
  titre: varchar("titre", { length: 255 }).notNull(),
  sceneId: integer("scene_id").references(() => scenes.id),
  description: text("description"),
  // The clip text (`description`) as it was when the sheet was written (agent or Open H3 IR): if the description is no longer the same, the sheet must be
  // regenerated (lib/clips/intent.ts, `intentionChangee`). Compared by value, never rewritten on its own; null = sheet written before this tracking, unknown.
  ficheDescription: text("fiche_description"),
  // Link with the PREVIOUS clip of the episode (2026-10-14, lib/clips/clip-link.ts): « suite » = the clip picks up where the other one ends (same place, roughly
  // the same instant); « coupe » = a clean break (other place, other moment, free angle). Set by the screenplay, editable by hand.
  liaison: varchar("liaison", { length: 10 }).notNull().default("suite"),
  // Open H3 IR: creativity and staging style of THIS clip (null = inherits from the scene, then from the project; style « aucun » = forces no style). lib/h3ir/settings.ts.
  creativite: varchar("creativite", { length: 12 }),
  styleCamera: varchar("style_camera", { length: 20 }),
  dureeMontageSecondes: integer("duree_montage_secondes").notNull(),
  dureeGenerationSecondes: integer("duree_generation_secondes").notNull(),
  fps: integer("fps").notNull().default(24),
  // Render resolution (0,2 / 0,3 / 0,4 MP: lib/renders/resolution-video.ts), node `22:9` of the video workflow.
  megapixels: real("megapixels").notNull().default(0.2),
  timecodeMusique: varchar("timecode_musique", { length: 50 }),
  statut: planStatutEnum("statut").notNull().default("brouillon"),
  // One seed PER CLIP, drawn at creation (2026-10-03, F04): without it all clips and all reruns
  // shared the seed written in the workflow file. « Relancer » (rerun) keeps it (same result if nothing
  // changed); « Nouvelle variante » (new variant) draws another one.
  seed: text("seed").default(sql`floor(random() * 1000000000000000)::bigint::text`),
  // Clip sheet « table de montage » (edit table) (2026-10-12): the displayed state of a clip is DERIVED (lib/clips/clip-sheet.ts, etatPlan): without an attempt =
  // draft, pret_upscale_at set = ready to upscale, otherwise in iteration. No additional enum value. A new attempt clears both.
  pretUpscaleAt: timestamp("pret_upscale_at"),
  // The attempt (job) validated when the clip is ready; reset to null if it is deleted.
  renduRetenuId: integer("rendu_retenu_id").references((): AnyPgColumn => jobs.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// The H3 prompt split by section (official MiniMax H3 format — see
// docs/references/h3-guide-fullref.md). A retouch
// almost always targets detailed_description: isolating it by section is the
// point that unblocks the F03 loop (2 to 30 iterations/clip).
export const planPromptSections = pgTable("plan_prompt_sections", {
  id: serial("id").primaryKey(),
  planId: integer("plan_id")
    .notNull()
    .references(() => plans.id, { onDelete: "cascade" }),
  section: varchar("section", { length: 40 }).notNull(), // subject_definitions | summary | retention_analysis | detailed_description | overall_soundscape | non_diegetic_music
  ordre: integer("ordre").notNull(),
  contenu: text("contenu").notNull().default(""),
});

// History of a clip's prompt (2026-10-31): each save of the free-text prompt keeps its full text, so one can go back to it.
// The first time, the previous prompt (source « avant ») is kept too. The prompts sent with each attempt remain on the job.
export const planPromptVersions = pgTable("plan_prompt_versions", {
  id: serial("id").primaryKey(),
  planId: integer("plan_id")
    .notNull()
    .references(() => plans.id, { onDelete: "cascade" }),
  texte: text("texte").notNull(),
  source: varchar("source", { length: 20 }).notNull(), // avant | enregistrement | compilation (Open H3 IR sheet)
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Image/video/audio references of a clip — max 6 picture+video, max 3 audio
// (MiniMax H3 constraints, checked on the application side, not in the DB).
export const planRefs = pgTable("plan_refs", {
  id: serial("id").primaryKey(),
  planId: integer("plan_id")
    .notNull()
    .references(() => plans.id, { onDelete: "cascade" }),
  type: refTypeEnum("type").notNull(),
  slot: integer("slot").notNull(), // the N of <Picture N> / <Audio N> / <Video N>
  assetId: integer("asset_id").references(() => assets.id),
  role: text("role"),
  retention: varchar("retention", { length: 30 }), // no longer written (it was for audio references)
});

// There is no longer a table of lines (migration 0062, 2026-10-14): the dialogue lives in the video prompt (`<d>`).

// Asset registry as a tree by subject (deriveDeId) — see
// lib/queries.ts:getAssetsTree. Full manual editing from /assets.
// Attached to the PROJECT (2026-09-28), not to the episode: a character (Maya)
// exists across the whole series, not only in a given episode. code
// stays unique, but per project — two distinct projects can each have
// an asset with the same name without collision.
export const assets = pgTable("assets", {
  id: serial("id").primaryKey(),
  // Cascade (2026-09-28, deletion rules): the only case where an asset
  // disappears is the deletion of the whole project — a deleted clip/
  // episode, on the other hand, only detaches its refs from the asset (see
  // plan_refs, which has no cascade to assets).
  projectId: integer("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  code: varchar("code", { length: 100 }).notNull(), // CHAR_maya, DEC_auberge_salle...: the IDENTIFIER, immutable (names the file, cited as is by the backend)
  // The name the user gives and can change: it takes precedence in the interface, never on the backend side. null = the readable code is displayed
  // (`libelleAsset`, lib/assets/assetCode.ts).
  label: varchar("label", { length: 120 }),
  type: varchar("type", { length: 30 }).notNull(), // personnage | decor | prop | vfx | keyframe | oth
  description: text("description"),
  // Generation prompt (Krea 2 / Qwen Image Edit / Qwen3-TTS depending on the
  // type) — distinct from the canonical description: one describes the subject
  // for narrative continuity, the other is what gets pasted into ComfyUI.
  promptGeneration: text("prompt_generation"),
  // How the image is made: "generation" (text-to-image, Krea 2) or
  // "edition" (Qwen Image Edit, from the parent's image). Distinct from the
  // deriveDeId link, which only says which family the asset belongs to:
  // an effect (flames, lightning) attached to a master is generated from scratch. null =
  // not yet chosen (a master takes "generation"). Not applicable to a voice.
  methodeGeneration: varchar("methode_generation", { length: 12 }),
  fichier: varchar("fichier", { length: 255 }),
  // When the file was set or replaced (adoption, import, voice take): a clip whose last render is
  // earlier is « périmé » (stale) (lib/clips/stale-clips.ts). null = never set.
  fichierAt: timestamp("fichier_at"),
  // Validated by hand (or by default on file import). The displayed status and criticality are COMPUTED (lib/assets/asset-state.ts):
  // no more `statut` or `critique` column. A file replaced by an adopted generation goes back to false.
  valide: boolean("valide").notNull().default(false),
  deriveDeId: integer("derive_de_id"),
}, (table) => [
  unique().on(table.projectId, table.code),
]);

// ---------------------------------------------------------------------
// Image generations of an asset (dedicated ComfyUI task, 2026-09-30): each
// row is a request, with a snapshot of what was submitted (prompt,
// style clause, format, seed). The result is a CANDIDATE: it only enters
// the registry (assets.fichier) when the user adopts it, never on its
// own (F01: an image replaces the node, it does not accumulate in the asset).
// `statut`: en_attente | en_cours | termine | echoue (varchar controlled on the
// application side, not a pg enum). `methode`: "generation" (text-to-image, Krea 2);
// "edition" (Qwen Image Edit) will come later.
export const assetGenerations = pgTable("asset_generations", {
  id: serial("id").primaryKey(),
  uuid: uuid("uuid").notNull().defaultRandom().unique(),
  assetId: integer("asset_id")
    .notNull()
    .references(() => assets.id, { onDelete: "cascade" }),
  methode: varchar("methode", { length: 12 }).notNull().default("generation"),
  statut: varchar("statut", { length: 12 }).notNull().default("en_attente"),
  prompt: text("prompt").notNull(),
  // The instruction in French that the user gave on the sheet (« les cheveux plus courts »): an agent translates it into a prompt
  // (Krea 2 or Qwen Image Edit). null for a generation launched without an instruction (batch, poster, old attempt). As long as the translation
  // is not done, the status is « traduction » and `prompt` is empty.
  consigne: text("consigne"),
  clauseStyle: text("clause_style").notNull().default(""),
  aspect: varchar("aspect", { length: 8 }).notNull().default("1:1"),
  megapixels: real("megapixels").notNull().default(1),
  // « From images » mode (edition method): true = Lightning 4 steps,
  // false = « Qualité » (40 steps CFG 4). null for text mode.
  lightning: boolean("lightning"),
  seed: text("seed").notNull(),
  comfyuiPromptId: varchar("comfyui_prompt_id", { length: 100 }),
  fichier: varchar("fichier", { length: 255 }),
  erreur: text("erreur"),
  // Progress relayed by the worker (ComfyUI WebSocket): the browser does not
  // talk to ComfyUI. Reset to null at the end of the task; the preview is a file
  // overwritten under generations/<assetId>/, `apercuAt` serves as the version in the URL.
  progressionValeur: integer("progression_valeur"),
  progressionMax: integer("progression_max"),
  etapeLibelle: varchar("etape_libelle", { length: 80 }),
  // Generation launched by a BATCH: the worker adopts it automatically at its end (it becomes the asset's image).
  adoptionAuto: boolean("adoption_auto").notNull().default(false),
  apercuFichier: varchar("apercu_fichier", { length: 255 }),
  apercuAt: timestamp("apercu_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  startedAt: timestamp("started_at"),
  finishedAt: timestamp("finished_at"),
  // « Vu » (seen): the user has taken note of the result or the failure
  // (header indicator). null = not yet seen.
  vuAt: timestamp("vu_at"),
  // Removed from the generations panel list (« vider la liste » (clear the list), ✕): nothing is deleted.
  masqueAt: timestamp("masque_at"),
  // When this attempt became the asset's image (same value as `assets.fichier_at` at that moment): used to mark the kept attempt.
  adopteAt: timestamp("adopte_at"),
  // Cancellation of a task IN PROGRESS: the interface sets the flag, the worker acts
  // (lib/tasks/cancellation.ts). A pending task is cancelled directly, without a flag.
  annulationDemandeeAt: timestamp("annulation_demandee_at"),
});

// Source images of a « from images » generation (IMG_Simple_Edit: from 1
// to 3, position 1 is the modified target). `fichier` is a SNAPSHOT taken at
// launch: for an 'asset' source, the asset's file name (under
// assets/); for an 'import' source, the name under generations/<assetId>/sources/
// (disposable, never attached to the registry). Deleted along with their generation.
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

// The F04 queue lives here, not in plans.statut alone: a clip accumulates
// several jobs (failures + replays), plans.statut is only the projection
// of the last job.
export const jobs = pgTable("jobs", {
  id: serial("id").primaryKey(),
  planId: integer("plan_id")
    .notNull()
    .references(() => plans.id, { onDelete: "cascade" }),
  statut: jobStatutEnum("statut").notNull().default("en_attente"),
  // AUTOMATIC replays of the same render after a failure (F04); this is NOT the render number.
  tentative: integer("tentative").notNull().default(1),
  // Render number within the clip (1, 2, 3…), set when the job is created; what the history displays.
  numeroRendu: integer("numero_rendu").notNull().default(1),
  // The REQUEST whose last step this render is (iteration of a clip): the panel only shows the request's line for it.
  demandeId: integer("demande_id"),
  // The natural-language instruction that produced this attempt (clip sheet, 2026-10-12) and the number of the attempt it started from.
  // Null for a first generation, an import and earlier renders.
  consigne: text("consigne"),
  depuisNumeroRendu: integer("depuis_numero_rendu"),
  // What the « Itérer » (iterate) agent flagged while applying its correction (doubt about its diagnosis, change refused by a check…):
  // information kept on the attempt, never a block (lib/clips/clip-sheet.ts, `decisionIteration`). Null outside iteration.
  alertesIteration: jsonb("alertes_iteration").$type<string[]>(),
  // What the worker actually submitted: the assembled prompt and the duration (the seed is in `seedUtilisee`).
  // Used to compare two renders, and to explain why two reruns give the same clip.
  promptUtilise: text("prompt_utilise"),
  dureeUtilisee: integer("duree_utilisee"),
  // The resolution of THIS render, copied from the clip at launch. Above 0.2 MP, `activer_upscale` (« rendu final » (final render)) is set automatically and the render is native, without upscale.
  megapixels: real("megapixels").notNull().default(0.2),
  // The description (intent) of the clip at the time of submission: versioned per attempt like the prompt (2026-10-14).
  descriptionUtilisee: text("description_utilisee"),
  // The attempt (of ANOTHER clip: the previous one) whose last image served as the first image of this one (lib/clips/clip-continuity.ts, 2026-10-14); null
  // without a match cut. Used to see that a clip follows a render that has changed since. The image is never kept as an asset.
  raccordJobId: integer("raccord_job_id").references((): AnyPgColumn => jobs.id, { onDelete: "set null" }),
  // Three-step video (2026-10-30, docs/PLAN_INTEGRATION_WORKER.md). A preview (0.4 MP generation) keeps the folder of its latents on
  // ComfyUI (`output/h3_latents/<dossier>/gen` and `/up`); a final render (upscale then finishing) points to the preview it starts from and is
  // only launched if the sheet has not changed since then (same comparison as lib/clips/stale-clips.ts, against that preview).
  latentDossier: varchar("latent_dossier", { length: 255 }),
  jobSourceId: integer("job_source_id").references((): AnyPgColumn => jobs.id, { onDelete: "set null" }),
  // How this render extends the previous clip (clip in sequence): « latent » (Motion Context, `raccord_job_id` = the attempt whose latent serves as context) or
  // « image » (fallback: the last image of `raccord_job_id`). Null outside a sequence, or for a render from before the column (lib/renders/video-steps.ts, `continuiteEffective`).
  continuite: varchar("continuite", { length: 10 }),
  // Progress of the render in progress (2026-10-03): the step (H3 generation, interpolation, encoding) and, if ComfyUI gives
  // one, value / max. Reset to null at the end of the render. No image preview (H3 generation is an API node).
  progressionValeur: integer("progression_valeur"),
  progressionMax: integer("progression_max"),
  etapeLibelle: varchar("etape_libelle", { length: 80 }),
  // Preview/final render toggle (F04, decided on 2026-09-26): the
  // low-resolution output (without upscale) serves fast prompt iterations
  // (F03), the final render upscales once the clip is validated.
  activerUpscale: boolean("activer_upscale").notNull().default(true),
  comfyuiPromptId: varchar("comfyui_prompt_id", { length: 100 }),
  workflowFichier: varchar("workflow_fichier", { length: 255 }).notNull(),
  seedUtilisee: text("seed_utilisee"),
  cheminSortie: varchar("chemin_sortie", { length: 500 }),
  erreur: text("erreur"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  startedAt: timestamp("started_at"),
  finishedAt: timestamp("finished_at"),
  // « Vu » (seen): see asset_generations.vuAt.
  vuAt: timestamp("vu_at"),
  masqueAt: timestamp("masque_at"),
  // Cancellation: see asset_generations.annulationDemandeeAt. A cancelled video ends
  // `echoue` with the error « Annulée » (no additional enum status).
  annulationDemandeeAt: timestamp("annulation_demandee_at"),
});

// ---------------------------------------------------------------------
// Edit (2026-11-07, docs/PLAN_MONTAGE.md). TWO ORDERS coexist, neither replacing the other:
// - the SCREENPLAY order remains `plans.ordre` (+ `plans.scene_id`): unchanged, it is still the one that gives a clip's position
//   (« 04 »), the order of the sheets, of match cuts (previous clip) and of agents;
// - the FINAL EDIT order (the film as it is watched and exported) is carried by the ENTRIES below, ADDED alongside.
// An entry points to a clip (0, 1 or several entries per clip: duplicating = one more entry on the same clip, no file
// copied), the render kept for THIS entry and a non-destructive trim (the render stays whole). Removing a clip from the edit
// deletes its entry, never the clip nor its renders. `rang` is a position densely rewritten (0..n), never a key (F03).
export const montageEntrees = pgTable(
  "montage_entrees",
  {
    id: serial("id").primaryKey(),
    episodeId: integer("episode_id")
      .notNull()
      .references(() => episodes.id, { onDelete: "cascade" }),
    planId: integer("plan_id")
      .notNull()
      .references(() => plans.id, { onDelete: "cascade" }),
    // The render (job) kept for this entry. null = the clip's default render: its kept attempt (`plans.rendu_retenu_id`), otherwise the most
    // recent readable one; a deleted render therefore automatically falls back to the default (`set null`).
    renduRetenuId: integer("rendu_retenu_id").references(() => jobs.id, { onDelete: "set null" }),
    rang: integer("rang").notNull(),
    // Trim in seconds, relative to the start of the render. `fin` null = up to the end of the render (the whole clip, whatever its duration).
    debutSecondes: real("debut_secondes").notNull().default(0),
    finSecondes: real("fin_secondes"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [index("montage_entrees_episode_idx").on(table.episodeId, table.rang)],
);

// Episode exports (button « Exporter l'épisode »): a request posted by the interface, processed by the worker (ffmpeg, no GPU).
// `segments` is the snapshot taken on click (file, start, end of each exportable entry, in edit order): the edit may
// move during encoding without changing what comes out. `statut`: en_attente | en_cours | termine | echoue (varchar, not a pg enum).
// The produced file is UNIQUE per episode (`montage/<episodeId>/episode.mp4`), replaced at each export (no versioning, F01).
export const montageExports = pgTable("montage_exports", {
  id: serial("id").primaryKey(),
  episodeId: integer("episode_id")
    .notNull()
    .references(() => episodes.id, { onDelete: "cascade" }),
  statut: varchar("statut", { length: 12 }).notNull().default("en_attente"),
  segments: jsonb("segments").notNull(),
  nbIgnores: integer("nb_ignores").notNull().default(0),
  fichier: varchar("fichier", { length: 255 }),
  dureeSecondes: real("duree_secondes"),
  erreur: text("erreur"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  startedAt: timestamp("started_at"),
  finishedAt: timestamp("finished_at"),
  // Task-banner panel (key `montage:<id>`, lib/montage/montage-task.ts): « vu » (seen) and « retiré de la liste » (removed from the list), like jobs.vuAt/masqueAt.
  vuAt: timestamp("vu_at"),
  masqueAt: timestamp("masque_at"),
});

// Global key/value settings, technical and independent of the story: duration
// cap (15s), breathing margin, number of attempts (2 — F04). The
// style clause and the screenplay settings (arc, style, continuity, rhymes,
// pitfalls) migrated to `projects` on 2026-09-28 — these are settings
// specific to a story, not constants of the pipeline.
export const parametres = pgTable("parametres", {
  cle: varchar("cle", { length: 100 }).primaryKey(),
  valeur: text("valeur").notNull(),
});

export const plansRelations = relations(plans, ({ many, one }) => ({
  promptSections: many(planPromptSections),
  refs: many(planRefs),
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
  episodes: many(episodes),
  plans: many(plans),
  assets: many(assets),
}));

export const episodesRelations = relations(episodes, ({ many, one }) => ({
  project: one(projects, { fields: [episodes.projectId], references: [projects.id] }),
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

export const jobsRelations = relations(jobs, ({ one }) => ({
  plan: one(plans, { fields: [jobs.planId], references: [plans.id] }),
}));

// Log of each execution of an agent skill (LLM block, lib/llm/): what the
// model received, what it returned, what the validation said about it. This is the
// automated friction log and the evaluation set (docs/CONCEPTION_AGENTS.md
// §7 and §10). The link to a proposal will come with the proposals.
export const agentTraces = pgTable("agent_traces", {
  id: serial("id").primaryKey(),
  uuid: uuid("uuid").notNull().defaultRandom().unique(),
  skill: varchar("skill", { length: 40 }).notNull(),
  fournisseur: varchar("fournisseur", { length: 30 }).notNull(),
  modele: varchar("modele", { length: 80 }).notNull(),
  // ok | invalide (output off-schema even after a retry) | echoue (server,
  // network, timeout) | interrompu (cancelled). Varchar controlled by the application.
  statut: varchar("statut", { length: 12 }).notNull(),
  projectId: integer("project_id").references(() => projects.id, { onDelete: "set null" }),
  // Input messages (excluding the system prompt, which is the skill's: we keep its
  // fingerprint to know which version of the files produced it).
  messages: jsonb("messages").notNull(),
  systemeEmpreinte: varchar("systeme_empreinte", { length: 64 }).notNull(),
  systemeCaracteres: integer("systeme_caracteres").notNull(),
  sortieBrute: text("sortie_brute"),
  // Model reasoning (reasoning_content), capped: used to understand WHY an output drifts (recipe 2026-10-04).
  reflexion: text("reflexion"),
  json: jsonb("json"),
  erreursValidation: jsonb("erreurs_validation"),
  erreur: text("erreur"),
  renvois: integer("renvois").notNull().default(0),
  tokensEntree: integer("tokens_entree").notNull().default(0),
  tokensSortie: integer("tokens_sortie").notNull().default(0),
  // Prompt cache rate (`timings` block of llama-server): tokens reused from the cache / prefilled. Null = not measured.
  tokensCache: integer("tokens_cache"),
  tokensPrefill: integer("tokens_prefill"),
  dureeMs: integer("duree_ms").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [index("agent_traces_skill_created_idx").on(table.skill, table.createdAt)]);

// Queue of LLM calls (« llm » kind of the worker, see worker/llm.ts): a call to
// an agent skill stored in the database, picked up by the worker like an image generation.
// The GPU is a single resource shared with ComfyUI: the scheduler
// (worker/scheduler.ts) slots these tasks between images and videos.
// `statut`: en_attente | en_cours | termine | echoue | annulee (varchar controlled
// by the application, not a pg enum). `entree` is what `executerSkill` receives
// (text, object or conversation); `resultat` the JSON validated against the schema of the
// skill. The full trace (messages, raw output, tokens) is in agent_traces.
export const agentRuns = pgTable("agent_runs", {
  id: serial("id").primaryKey(),
  uuid: uuid("uuid").notNull().defaultRandom().unique(),
  skill: varchar("skill", { length: 40 }).notNull(),
  projectId: integer("project_id").references(() => projects.id, { onDelete: "set null" }),
  entree: jsonb("entree").notNull(),
  // { modele?: string } — model override; empty = the one from the configuration.
  options: jsonb("options"),
  statut: varchar("statut", { length: 12 }).notNull().default("en_attente"),
  // Output tokens received as they stream (the maximum is unknown: no
  // percentage bar, just a counter). Reset to null at the end of the task.
  progressionJetons: integer("progression_jetons"),
  // Streaming (2026-10-03): the response text (capped) and the END of the reasoning, written at most 1×/s during
  // the call, reset to null at the end of the call.
  fluxTexte: text("flux_texte"),
  fluxReflexion: text("flux_reflexion"),
  resultat: jsonb("resultat"),
  erreur: text("erreur"),
  traceId: integer("trace_id").references(() => agentTraces.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  startedAt: timestamp("started_at"),
  finishedAt: timestamp("finished_at"),
  vuAt: timestamp("vu_at"),
  annulationDemandeeAt: timestamp("annulation_demandee_at"),
  masqueAt: timestamp("masque_at"),
  // The REQUEST (iteration of a clip…) of which this task is a step: the panel then only shows one line for it, the request's line.
  demandeId: integer("demande_id"),
  // What the result becomes (agent system, docs/CONCEPTION_AGENTS.md §14):
  // `but` = turn (conversation reply) | brief | proposition; the ids link the
  // task to its conversation / its proposal (plain integers, no foreign key:
  // the agent tables already point to agent_runs, no circular reference).
  but: varchar("but", { length: 12 }),
  conversationId: integer("conversation_id"),
  propositionId: integer("proposition_id"),
  // BATCH (2026-10-02, « scénarios d'épisodes » (episode screenplays) step): a proposal can be composed of
  // several tasks, one per subtask (e.g. an episode). `cleSousTache` identifies it in the
  // batch (« ep:12 »); `libelleSousTache` is what the review and the header say about it. Empty
  // for a single task (conversation turn, brief, simple proposal).
  cleSousTache: varchar("cle_sous_tache", { length: 80 }),
  libelleSousTache: varchar("libelle_sous_tache", { length: 200 }),
}, (table) => [
  index("agent_runs_statut_idx").on(table.statut, table.createdAt),
  index("agent_runs_proposition_idx").on(table.propositionId),
]);

// ---------------------------------------------------------------------
// Agent system (2026-10-02): conversation → brief → proposal → review →
// application. See docs/CONCEPTION_AGENTS.md §14. No pg enum: values in
// varchar, controlled by the application (lib/agents/types.ts).
// ---------------------------------------------------------------------

// One conversation per (project, scope, target): reopening resumes it; starting a
// « new » one on the same target overwrites the previous one (uniqueness below).
// `portee`: projet | episode | plan | asset; `cibleId` = internal id of the
// targeted episode / clip / asset (null for the project). `etape`:
// consigne | conversation | brief | proposition | applique. `propositionId` = the
// current proposal (plain integer: proposals point to the conversation).
export const agentConversations = pgTable("agent_conversations", {
  id: serial("id").primaryKey(),
  uuid: uuid("uuid").notNull().defaultRandom().unique(),
  projectId: integer("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  portee: varchar("portee", { length: 10 }).notNull(),
  cibleId: integer("cible_id"),
  profondeur: varchar("profondeur", { length: 10 }).notNull().default("courte"),
  etape: varchar("etape", { length: 12 }).notNull().default("consigne"),
  // [{ role: "user" | "assistant", content, at }] — the turns of the conversation.
  messages: jsonb("messages").notNull().default(sql`'[]'::jsonb`),
  consigne: text("consigne").notNull().default(""),
  // The notes sheet is complete (decided in code, lib/agents/sheet.ts): the user can move on to the briefing.
  briefPret: boolean("brief_pret").notNull().default(false),
  // What remains to be defined with the user (list of short sentences, updated by the agent at each turn);
  // `briefPret` is only true when it is empty.
  resteADefinir: jsonb("reste_a_definir").notNull().default(sql`'[]'::jsonb`),
  // The interview notes sheet (lib/agents/sheet.ts): the brief being filled in, { contenu, statuts }, maintained by the code.
  fiche: jsonb("fiche"),
  propositionId: integer("proposition_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  // One conversation per (project, scope, depth, target).
  uniqueIndex("agent_conversations_cible_idx").on(table.projectId, table.portee, table.profondeur, sql`coalesce(${table.cibleId}, 0)`),
]);

// The style library of a project's design. SEEDED from lib/styles/library.json + clauses.json (db/seed-styles.ts,
// re-run at each `db:migrate`): the JSON remains the source to sort by hand, the database is what the application reads. `apercus`: the
// subjects (lib/styles/subjects.ts) whose image exists under `styles/<id>/<sujet>.webp`; the images remain files (MEDIA_ROOT).
export const styles = pgTable("styles", {
  id: varchar("id", { length: 120 }).primaryKey(),
  nom: varchar("nom", { length: 200 }).notNull(),
  descriptor: text("descriptor").notNull(),
  categories: jsonb("categories").notNull().default(sql`'[]'::jsonb`),
  filtres: jsonb("filtres").notNull(),
  clause: text("clause").notNull().default(""),
  apercus: jsonb("apercus").notNull().default(sql`'[]'::jsonb`),
  ordre: integer("ordre").notNull().default(0),
});

// The installer (2026-10-03): creating a project end to end, step by step and without an
// intermediate validation. One row per project; `statut`: en_cours | termine | echoue | arretee; `etapes`: the ordered list
// of steps and their state (lib/agents/creation.ts), which the worker advances at each loop turn.
export const creationsProjet = pgTable("creations_projet", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").notNull().unique().references(() => projects.id, { onDelete: "cascade" }),
  statut: varchar("statut", { length: 10 }).notNull().default("en_cours"),
  etapes: jsonb("etapes").notNull().default(sql`'[]'::jsonb`),
  erreur: text("erreur"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// A REQUEST (2026-10-17): a user gesture spanning several steps (iterating a clip: the agent reads the instruction, the
// sheet is rewritten if needed, the render starts). ONE row in the queue and the panel, from click to result, instead of a chain of
// tasks handing off to each other with gaps between them. It is only a pilot: the tasks (agent runs, video jobs, image
// generations) keep their lanes and their GPU lock (see lib/tasks/requests.ts). `type`: iteration-plan | (to come) iteration-asset;
// `statut`: en_cours | termine | echoue | annulee; only one request in progress per target (partial unique index).
export const demandes = pgTable(
  "demandes",
  {
    id: serial("id").primaryKey(),
    uuid: uuid("uuid").notNull().defaultRandom().unique(),
    projectId: integer("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
    type: varchar("type", { length: 24 }).notNull(),
    cibleType: varchar("cible_type", { length: 8 }).notNull(),
    cibleId: integer("cible_id").notNull(),
    statut: varchar("statut", { length: 10 }).notNull().default("en_cours"),
    etapes: jsonb("etapes").notNull().default(sql`'[]'::jsonb`),
    // What is needed to finish: instruction, starting attempt, settings, current task, render created (lib/tasks/requests.ts).
    contexte: jsonb("contexte").notNull().default(sql`'{}'::jsonb`),
    erreur: text("erreur"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
    finishedAt: timestamp("finished_at"),
    vuAt: timestamp("vu_at"),
    masqueAt: timestamp("masque_at"),
  },
  (table) => [uniqueIndex("demandes_une_en_cours_par_cible").on(table.cibleType, table.cibleId).where(sql`${table.statut} = 'en_cours'`)],
);

// The brief: the project's REFERENCE document (only one per project), editable after
// the fact. `contenu` follows the schema of lib/agents/brief-schema.json;
// `statuts` says, section by section (top-level key), who set it:
// fourni (stated by the user) | deduit (concluded by the agent) | a_valider (invented
// or uncertain). `statut`: brouillon (out of a conversation, not yet
// applied) | valide.
export const briefs = pgTable("briefs", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").notNull().unique().references(() => projects.id, { onDelete: "cascade" }),
  statut: varchar("statut", { length: 10 }).notNull().default("brouillon"),
  source: varchar("source", { length: 12 }).notNull().default("conversation"),
  contenu: jsonb("contenu").notNull(),
  statuts: jsonb("statuts").notNull().default(sql`'{}'::jsonb`),
  version: integer("version").notNull().default(1),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// The project design (2026-10-07): the choices made BEFORE the interview (format, genres, tone, duration, pace, language, style),
// as the user made them (lib/projects/design.ts). The brief receives the derived values; this row keeps the raw choices
// (tone adjusted or not, default values not visited, number of episodes planned) to redisplay them.
export const conceptions = pgTable("conceptions", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").notNull().unique().references(() => projects.id, { onDelete: "cascade" }),
  contenu: jsonb("contenu").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// A batch of changes set aside, never applied without the user. `statut`:
// en_generation | prete | appliquee | annulee | echouee. The conversation
// may disappear (overwritten) without taking the history with it: `set null`. `parentId` =
// the refined proposal (the user's free feedback in `retour`).
export const propositions = pgTable("propositions", {
  id: serial("id").primaryKey(),
  uuid: uuid("uuid").notNull().defaultRandom().unique(),
  conversationId: integer("conversation_id").references(() => agentConversations.id, { onDelete: "set null" }),
  projectId: integer("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  skill: varchar("skill", { length: 40 }).notNull(),
  portee: varchar("portee", { length: 10 }).notNull(),
  cibleId: integer("cible_id"),
  statut: varchar("statut", { length: 14 }).notNull().default("en_generation"),
  runId: integer("run_id").references(() => agentRuns.id, { onDelete: "set null" }),
  parentId: integer("parent_id"),
  consigne: text("consigne").notNull().default(""),
  retour: text("retour"),
  resume: text("resume").notNull().default(""),
  // « Contexte utilisé » (context used): what the agent read automatically ([{ type, libelle, ref? }]).
  contexte: jsonb("contexte").notNull().default(sql`'[]'::jsonb`),
  erreur: text("erreur"),
  // « En lot » (batch) proposal: its generation is composed of several `agent_runs` tasks
  // (one per subtask); it stays `en_generation` as long as some are still active.
  lot: boolean("lot").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  appliedAt: timestamp("applied_at"),
}, (table) => [index("propositions_projet_idx").on(table.projectId, table.createdAt)]);

// A proposal change. `cibleType`: brief | projet | episode |
// scene | asset | plan. `cibleRef`: STABLE reference of the existing item (internal id, clip uuid,
// brief section key); null for a creation, which carries a symbolic `cle`
// (« episode-2 ») that its children cite in `apres`.
// `avant`/`apres`: what is read / what will be written (jsonb). `position`: where to
// insert (plan: { apresPlanUuid } | { debut: true } | { fin: true }). `ecrase`: in
// plain terms, what will be lost (null if nothing). `coche`: kept for application;
// `refuseRaison`: refused outright (out of scope, not supported…).
export const propositionChangements = pgTable("proposition_changements", {
  id: serial("id").primaryKey(),
  propositionId: integer("proposition_id").notNull().references(() => propositions.id, { onDelete: "cascade" }),
  ordre: integer("ordre").notNull(),
  groupe: varchar("groupe", { length: 40 }).notNull(),
  cle: varchar("cle", { length: 60 }),
  cibleType: varchar("cible_type", { length: 12 }).notNull(),
  cibleRef: varchar("cible_ref", { length: 100 }),
  libelle: text("libelle").notNull(),
  operation: varchar("operation", { length: 10 }).notNull(),
  avant: jsonb("avant"),
  apres: jsonb("apres"),
  position: jsonb("position"),
  avertissements: jsonb("avertissements").notNull().default(sql`'[]'::jsonb`),
  ecrase: text("ecrase"),
  coche: boolean("coche").notNull().default(false),
  refuseRaison: text("refuse_raison"),
  appliqueAt: timestamp("applique_at"),
  // Batch: the subtask (key of agent_runs.cle_sous_tache) that produced this change, so that
  // only ITS rows are replaced when it is rerun; `sousGroupe` = the title of the scene
  // under which the review files a clip or a line of dialogue.
  sousTache: varchar("sous_tache", { length: 80 }),
  sousGroupe: varchar("sous_groupe", { length: 200 }),
}, (table) => [index("proposition_changements_prop_idx").on(table.propositionId, table.ordre)]);
