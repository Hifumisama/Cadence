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

// Racine d'un projet vidéo — OneShot ou Série (2026-09-28). 2026-10-02 : `clauseStyle` et
// `notes` sont désormais des COPIES dénormalisées du BRIEF (source unique : `briefs.contenu`
// style.clause / notes), écrites par le seul `synchroniserClauseStyle` (lib/agents/brief-db.ts) ;
// ne JAMAIS les écrire ailleurs. Historique : clauseStyle
// portait le réglage qui ne bouge pas à l'échelle du projet (retour
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
  // Prompt LONG du style (images). Copie dénormalisée de briefs.contenu.style.promptImage, comme clause_style (écrite par
  // synchroniserClauseStyle) ; vide pour un projet sans conception : les images retombent alors sur la clause.
  stylePromptImage: text("style_prompt_image").notNull().default(""),
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
  // Genre de la scène (lib/scene-genres.ts : action, dialogue, montage, contemplatif, tension) : il choisit les guides
  // de rédaction du prompt vidéo de ses plans. Null = standard. Varchar contrôlé par l'application.
  genre: varchar("genre", { length: 20 }),
  // Cadre visuel tenu sur toute la scène (moment de la journée, météo, lumière générale) : la continuité entre plans.
  ambiance: text("ambiance"),
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
  // Liaison avec le plan PRÉCÉDENT de l'épisode (2026-10-14, lib/plan-liaison.ts) : « suite » = le plan reprend là où l'autre finit (même lieu, même
  // instant à peu près) ; « coupe » = rupture franche (autre lieu, autre moment, autre angle libre). Posée par le scénario, modifiable à la main.
  liaison: varchar("liaison", { length: 10 }).notNull().default("suite"),
  dureeMontageSecondes: integer("duree_montage_secondes").notNull(),
  dureeGenerationSecondes: integer("duree_generation_secondes").notNull(),
  fps: integer("fps").notNull().default(24),
  mode: varchar("mode", { length: 20 }).notNull().default("full-reference"),
  timecodeMusique: varchar("timecode_musique", { length: 50 }),
  statut: planStatutEnum("statut").notNull().default("brouillon"),
  // Une seed PAR PLAN, tirée à la création (2026-10-03, F04) : sans elle tous les plans et toutes les relances
  // partageaient la seed écrite dans le fichier du workflow. « Relancer » la garde (même résultat si rien n'a
  // bougé) ; « Nouvelle variante » en tire une autre.
  seed: text("seed").default(sql`floor(random() * 1000000000000000)::bigint::text`),
  notes: text("notes"),
  // Fiche de plan « table de montage » (2026-10-12) : l'état affiché d'un plan est DÉRIVÉ (lib/fiche-plan.ts, etatPlan) : sans essai =
  // brouillon, pret_upscale_at posé = prêt à upscaler, sinon en itération. Pas de valeur d'enum de plus. Un nouvel essai efface les deux.
  pretUpscaleAt: timestamp("pret_upscale_at"),
  // L'essai (job) validé quand le plan est prêt ; remis à null si on le supprime.
  renduRetenuId: integer("rendu_retenu_id").references((): AnyPgColumn => jobs.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// Le prompt H3 découpé par section (format officiel MiniMax H3 — voir
// docs/references/h3-guide-fullref.md). Une retouche
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

// Il n'y a plus de table de répliques (migration 0062, 2026-10-14) : le dialogue vit dans le prompt vidéo (`<d>`), la voix d'un personnage
// est son champ `voix_master`.

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
  // plan_refs, qui n'a pas de cascade vers assets).
  projectId: integer("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  code: varchar("code", { length: 100 }).notNull(), // CHAR_maya, DEC_auberge_salle... : l'IDENTIFIANT, immuable (nomme le fichier, cité tel quel par le backend)
  // Le nom que l'utilisateur donne et peut changer : il prime dans l'interface, jamais côté backend. null = on affiche le code lisible
  // (`libelleAsset`, lib/assetCode.ts).
  label: varchar("label", { length: 120 }),
  type: varchar("type", { length: 30 }).notNull(), // personnage | decor | prop | vfx | sfx | keyframe | oth
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
  // Quand le fichier a été posé ou remplacé (adoption, import, prise de voix) : un plan dont le dernier rendu est
  // antérieur est « périmé » (lib/plans-perimes.ts). null = jamais posé.
  fichierAt: timestamp("fichier_at"),
  // Durée du son retenu, en secondes (type sfx : paramètre de la génération audio,
  // qui n'est pas dans le prompt). null pour les autres types.
  dureeSecondes: real("duree_secondes"),
  // Validé à la main (ou par défaut à l'import d'un fichier). Le statut affiché et la criticité se CALCULENT (lib/asset-etat.ts) :
  // plus de colonne `statut` ni `critique`. Un fichier remplacé par une génération adoptée repasse à false.
  valide: boolean("valide").notNull().default(false),  // Voix du PERSONNAGE (chantier voix/master, 2026-10-14) : une voix n'existe que portée par un personnage (la voix off en est un). Sans
  // objet pour les autres types. `voixDescription` : la voix voulue, en texte libre (null = laissée au modèle) ; `voixRepliqueBase` : la
  // réplique que dit le test ; `voixMaster` : l'audio nettoyé retenu, `voixVideo` : la vidéo de test qui l'a produit (les deux sous
  // voix/<assetId>/). Le master sert de référence audio `<Audio N>` des plans du personnage, sans jamais bloquer.
  voixDescription: text("voix_description"),
  voixRepliqueBase: text("voix_replique_base"),
  voixMaster: varchar("voix_master", { length: 255 }),
  voixVideo: varchar("voix_video", { length: 255 }),
  voixMasterAt: timestamp("voix_master_at"),
  deriveDeId: integer("derive_de_id"),
}, (table) => [
  unique().on(table.projectId, table.code),
]);

// ---------------------------------------------------------------------
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
  // La consigne en français que l'utilisateur a donnée sur la fiche (« les cheveux plus courts ») : un agent la traduit en prompt
  // (Krea 2 ou Qwen Image Edit). null pour une génération lancée sans consigne (lot, affiche, ancien essai). Tant que la traduction
  // n'est pas faite, le statut est « traduction » et `prompt` est vide.
  consigne: text("consigne"),
  clauseStyle: text("clause_style").notNull().default(""),
  aspect: varchar("aspect", { length: 8 }).notNull().default("1:1"),
  megapixels: real("megapixels").notNull().default(1),
  loraPersonnage: boolean("lora_personnage").notNull().default(false),
  // Mode « à partir d'images » (méthode edition) : true = Lightning 4 étapes,
  // false = « Qualité » (40 étapes CFG 4). null pour le mode texte.
  lightning: boolean("lightning"),
  // Génération audio (méthode « audio », Stable Audio 3) : durée demandée en
  // secondes, paramètre séparé du prompt. null pour les images. aspect/megapixels
  // gardent leurs valeurs par défaut pour l'audio : l'affichage se règle sur la
  // méthode, jamais sur ces deux colonnes.
  dureeSecondes: real("duree_secondes"),
  // Master de voix (méthode « master_voix ») : la réplique du test. null pour les images et les sons.
  texteReference: text("texte_reference"),
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
  // Génération lancée par un LOT : le worker l'adopte toute seule à sa fin (elle devient l'image de l'asset).
  adoptionAuto: boolean("adoption_auto").notNull().default(false),
  // Ce que la méthode fige au lancement quand les colonnes ci-dessus ne suffisent pas (voir lib/asset-generation.ts,
  // `ParametresMasterVoix`) : l'image du personnage d'un master de voix. null pour les images et les sons.
  parametres: jsonb("parametres"),
  apercuFichier: varchar("apercu_fichier", { length: 255 }),
  apercuAt: timestamp("apercu_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  startedAt: timestamp("started_at"),
  finishedAt: timestamp("finished_at"),
  // « Vu » : l'utilisateur a pris connaissance du résultat ou de l'échec
  // (indicateur du header). null = pas encore vu.
  vuAt: timestamp("vu_at"),
  // Retirée de la liste du panneau des générations (« vider la liste », ✕) : rien n'est supprimé.
  masqueAt: timestamp("masque_at"),
  // Quand cet essai est devenu l'image de l'asset (même valeur que `assets.fichier_at` à cet instant) : sert à marquer l'essai retenu.
  adopteAt: timestamp("adopte_at"),
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
  // Rejeux AUTOMATIQUES d'un même rendu après un échec (F04) ; ce n'est PAS le numéro du rendu.
  tentative: integer("tentative").notNull().default(1),
  // Numéro du rendu dans le plan (1, 2, 3…), posé à la création du job ; ce que l'historique affiche.
  numeroRendu: integer("numero_rendu").notNull().default(1),
  // La DEMANDE dont ce rendu est la dernière étape (itération d'un plan) : le panneau n'en montre que la ligne de la demande.
  demandeId: integer("demande_id"),
  // La consigne en langage naturel qui a produit cet essai (fiche de plan, 2026-10-12) et le numéro de l'essai dont on est parti.
  // Null pour une première génération, un import et les rendus d'avant.
  consigne: text("consigne"),
  depuisNumeroRendu: integer("depuis_numero_rendu"),
  // Ce que l'agent d'« Itérer » a signalé en appliquant sa correction (doute sur son diagnostic, changement refusé par un contrôle…) :
  // des informations gardées sur l'essai, jamais un blocage (lib/fiche-plan.ts, `decisionIteration`). Null hors itération.
  alertesIteration: jsonb("alertes_iteration").$type<string[]>(),
  // Ce que le worker a réellement soumis : le prompt assemblé et la durée (la seed est dans `seedUtilisee`).
  // Sert à comparer deux rendus, et à expliquer pourquoi deux relances donnent le même plan.
  promptUtilise: text("prompt_utilise"),
  dureeUtilisee: integer("duree_utilisee"),
  // La description (intention) du plan au moment de la soumission : versionnée par essai comme le prompt (2026-10-14).
  descriptionUtilisee: text("description_utilisee"),
  // L'essai (d'un AUTRE plan : le précédent) dont la dernière image a servi de première image à celui-ci (lib/plan-raccord.ts, 2026-10-14) ; null
  // sans raccord. Sert à voir qu'un plan suit un rendu qui a changé depuis. L'image n'est jamais gardée comme asset.
  raccordJobId: integer("raccord_job_id").references((): AnyPgColumn => jobs.id, { onDelete: "set null" }),
  // Progression du rendu en cours (2026-10-03) : l'étape (génération H3, interpolation, encodage) et, si ComfyUI en
  // donne une, valeur / max. Remises à null en fin de rendu. Pas d'aperçu image (la génération H3 est un nœud d'API).
  progressionValeur: integer("progression_valeur"),
  progressionMax: integer("progression_max"),
  etapeLibelle: varchar("etape_libelle", { length: 80 }),
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
  masqueAt: timestamp("masque_at"),
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
  // Raisonnement du modèle (reasoning_content), borné : sert à comprendre POURQUOI une sortie dérive (recette 2026-10-04).
  reflexion: text("reflexion"),
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
  // Streaming (2026-10-03) : le texte de la réponse (borné) et la FIN de la réflexion, écrits au plus 1×/s pendant
  // l'appel, remis à null en fin d'appel.
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
  // La DEMANDE (itération d'un plan…) dont cette tâche est une étape : le panneau n'en montre alors qu'une ligne, celle de la demande.
  demandeId: integer("demande_id"),
  // Ce que le résultat devient (système d'agents, docs/CONCEPTION_AGENTS.md §14) :
  // `but` = tour (réponse de conversation) | brief | proposition ; les ids relient la
  // tâche à sa conversation / sa proposition (entiers simples, sans clé étrangère :
  // les tables d'agents pointent déjà vers agent_runs, pas de référence circulaire).
  but: varchar("but", { length: 12 }),
  conversationId: integer("conversation_id"),
  propositionId: integer("proposition_id"),
  // LOT (2026-10-02, étape « scénarios d'épisodes ») : une proposition peut être composée de
  // plusieurs tâches, une par sous-tâche (ex. un épisode). `cleSousTache` l'identifie dans le
  // lot (« ep:12 ») ; `libelleSousTache` est ce que la revue et le header en disent. Vides
  // pour une tâche seule (tour de conversation, brief, proposition simple).
  cleSousTache: varchar("cle_sous_tache", { length: 80 }),
  libelleSousTache: varchar("libelle_sous_tache", { length: 200 }),
}, (table) => [
  index("agent_runs_statut_idx").on(table.statut, table.createdAt),
  index("agent_runs_proposition_idx").on(table.propositionId),
]);

// ---------------------------------------------------------------------
// Système d'agents (2026-10-02) : conversation → brief → proposition → revue →
// application. Voir docs/CONCEPTION_AGENTS.md §14. Aucun enum pg : valeurs en
// varchar, contrôlées par l'application (lib/agents/types.ts).
// ---------------------------------------------------------------------

// Une conversation par (projet, portée, cible) : rouvrir reprend, en démarrer une
// « nouvelle » sur la même cible écrase la précédente (unicité ci-dessous).
// `portee` : projet | saison | episode | plan | asset ; `cibleId` = id interne de la
// saison / de l'épisode / du plan / de l'asset visé (null pour le projet). `etape` :
// consigne | conversation | brief | proposition | applique. `propositionId` = la
// proposition courante (entier simple : les propositions pointent vers la conversation).
export const agentConversations = pgTable("agent_conversations", {
  id: serial("id").primaryKey(),
  uuid: uuid("uuid").notNull().defaultRandom().unique(),
  projectId: integer("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  portee: varchar("portee", { length: 10 }).notNull(),
  cibleId: integer("cible_id"),
  profondeur: varchar("profondeur", { length: 10 }).notNull().default("courte"),
  etape: varchar("etape", { length: 12 }).notNull().default("consigne"),
  // [{ role: "user" | "assistant", content, at }] — les tours de la conversation.
  messages: jsonb("messages").notNull().default(sql`'[]'::jsonb`),
  consigne: text("consigne").notNull().default(""),
  // La fiche de notes est complète (décidé en code, lib/agents/fiche.ts) : l'utilisateur peut passer au briefing.
  briefPret: boolean("brief_pret").notNull().default(false),
  // Ce qu'il reste à définir avec l'utilisateur (liste de phrases courtes, remise à jour par l'agent à chaque tour) ;
  // `briefPret` n'est vrai que lorsqu'elle est vide.
  resteADefinir: jsonb("reste_a_definir").notNull().default(sql`'[]'::jsonb`),
  // La fiche de notes de l'entretien (lib/agents/fiche.ts) : le brief en train de se remplir, { contenu, statuts }, tenue par le code.
  fiche: jsonb("fiche"),
  propositionId: integer("proposition_id"),
  // Révision d'épisode (profondeur « revision », docs/FRICTIONS.md 2026-10-09) : les PISTES proposées au dernier tour et pas encore
  // choisies ([{ titre, resume, operations }]), remplacées à chaque tour d'analyse.
  pistes: jsonb("pistes").notNull().default(sql`'[]'::jsonb`),
  // Une révision appliquée (ou abandonnée) se FERME : elle garde son historique, une neuve peut s'ouvrir sur le même épisode.
  fermeeAt: timestamp("fermee_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  // Une conversation OUVERTE par (projet, portée, profondeur, cible) : la révision d'un épisode coexiste avec sa conversation « courte ».
  uniqueIndex("agent_conversations_cible_idx")
    .on(table.projectId, table.portee, table.profondeur, sql`coalesce(${table.cibleId}, 0)`)
    .where(sql`${table.fermeeAt} is null`),
]);

// Les DÉCISIONS d'une révision d'épisode : le brouillon, jamais une table métier. Chacune porte les opérations que le réalisateur a
// proposées (validées par le code), les changements qu'elles produisent (aperçu des applicateurs : avant/après, écrasement) et les
// constats (calculés par le code ; `source` dit si le jugement est celui du code ou du modèle). `statut` : discussion | retenue |
// attention | conflit | appliquee. À l'application, les décisions retenues deviennent UNE proposition (`proposition_id`).
export const revisionDecisions = pgTable("revision_decisions", {
  id: serial("id").primaryKey(),
  uuid: uuid("uuid").notNull().defaultRandom().unique(),
  conversationId: integer("conversation_id").notNull().references(() => agentConversations.id, { onDelete: "cascade" }),
  ordre: integer("ordre").notNull().default(0),
  titre: varchar("titre", { length: 200 }).notNull(),
  raison: text("raison").notNull().default(""),
  statut: varchar("statut", { length: 12 }).notNull().default("retenue"),
  operations: jsonb("operations").notNull().default(sql`'[]'::jsonb`),
  changements: jsonb("changements").notNull().default(sql`'[]'::jsonb`),
  constats: jsonb("constats").notNull().default(sql`'[]'::jsonb`),
  gainSecondes: integer("gain_secondes").notNull().default(0),
  // Ce que la décision visait a changé depuis qu'elle a été prise (modifié à la main ailleurs) : à relire, jamais effacée en silence.
  aReverifier: boolean("a_reverifier").notNull().default(false),
  propositionId: integer("proposition_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  appliqueAt: timestamp("applique_at"),
}, (table) => [index("revision_decisions_conversation_idx").on(table.conversationId, table.ordre)]);

// L'installateur (2026-10-03) : la création d'un projet de bout en bout, étape par étape et sans validation
// intermédiaire. Une ligne par projet ; `statut` : en_cours | termine | echoue | arretee ; `etapes` : la liste ordonnée
// des étapes et leur état (lib/agents/creation.ts), que le worker fait avancer à chaque tour de boucle.
export const creationsProjet = pgTable("creations_projet", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").notNull().unique().references(() => projects.id, { onDelete: "cascade" }),
  statut: varchar("statut", { length: 10 }).notNull().default("en_cours"),
  etapes: jsonb("etapes").notNull().default(sql`'[]'::jsonb`),
  erreur: text("erreur"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// Une DEMANDE (2026-10-17) : un geste de l'utilisateur qui tient en plusieurs étapes (itérer un plan : l'agent lit la consigne, la
// fiche est réécrite si besoin, le rendu part). UNE ligne dans la file et le panneau, du clic au résultat, au lieu d'une suite de
// tâches qui se relaient avec des trous entre elles. Ce n'est qu'un pilote : les tâches (runs d'agent, jobs vidéo, générations
// d'images) gardent leurs voies et leur verrou GPU (voir lib/demandes.ts). `type` : iteration-plan | (à venir) iteration-asset ;
// `statut` : en_cours | termine | echoue | annulee ; une seule demande en cours par cible (index unique partiel).
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
    // Ce qu'il faut pour finir : consigne, essai de départ, réglages, tâche courante, rendu créé (lib/demandes.ts).
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

// Le brief : document de RÉFÉRENCE du projet (un seul par projet), modifiable après
// coup. `contenu` suit le schéma de lib/agents/brief-schema.json ;
// `statuts` dit, section par section (clé de premier niveau), qui l'a posée :
// fourni (dit par l'utilisateur) | deduit (conclu par l'agent) | a_valider (inventé
// ou incertain). `statut` : brouillon (sorti d'une conversation, pas encore
// appliqué) | valide.
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

// La conception du projet (2026-10-07) : les choix faits AVANT l'entretien (format, genres, ton, durée, rythme, langue, style),
// tels que l'utilisateur les a faits (lib/conception.ts). Le brief reçoit les valeurs dérivées ; cette ligne garde les choix
// bruts (ton ajusté ou non, valeurs par défaut non visitées, nombre d'épisodes prévus) pour les réafficher.
export const conceptions = pgTable("conceptions", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").notNull().unique().references(() => projects.id, { onDelete: "cascade" }),
  contenu: jsonb("contenu").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// Un lot de changements mis de côté, jamais appliqué sans l'utilisateur. `statut` :
// en_generation | prete | appliquee | partielle | rejetee | echouee. La conversation
// peut disparaître (écrasée) sans emporter l'historique : `set null`. `parentId` =
// la proposition affinée (retour libre de l'utilisateur dans `retour`).
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
  // « Contexte utilisé » : ce que l'agent a lu automatiquement ([{ type, libelle, ref? }]).
  contexte: jsonb("contexte").notNull().default(sql`'[]'::jsonb`),
  erreur: text("erreur"),
  // Proposition « en lot » : sa génération est composée de plusieurs tâches `agent_runs`
  // (une par sous-tâche), elle reste `en_generation` tant qu'il en reste d'actives.
  lot: boolean("lot").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  appliedAt: timestamp("applied_at"),
}, (table) => [index("propositions_projet_idx").on(table.projectId, table.createdAt)]);

// Un changement de proposition. `cibleType` : brief | projet | saison | episode |
// scene | asset | plan. `cibleRef` : référence STABLE de l'existant (id interne, uuid
// du plan, clé de section du brief) ; null pour une création, qui porte une `cle`
// symbolique (« saison-1 », « episode-2 ») que ses enfants citent dans `apres`.
// `avant`/`apres` : ce qui est lu / ce qui sera écrit (jsonb). `position` : où
// insérer (plan : { apresPlanUuid } | { debut: true } | { fin: true }). `ecrase` : en
// clair, ce qui sera perdu (null si rien). `coche` : retenu pour l'application ;
// `refuseRaison` : refusé d'office (hors portée, non pris en charge…).
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
  // Lot : la sous-tâche (clé de agent_runs.cle_sous_tache) qui a produit ce changement, pour
  // ne remplacer que SES lignes quand elle est relancée ; `sousGroupe` = le titre de la scène
  // sous laquelle la revue range un plan ou une réplique.
  sousTache: varchar("sous_tache", { length: 80 }),
  sousGroupe: varchar("sous_groupe", { length: 200 }),
}, (table) => [index("proposition_changements_prop_idx").on(table.propositionId, table.ordre)]);
