-- Répliques autonomes (2026-09-30, docs/FRICTIONS.md F02 révision) : la
-- réplique devient une entité (`repliques`), `plan_dialogues` une liaison n-n
-- plan <-> réplique. Écrite à la main, sans enum pg (statut en varchar).
--
-- Reprise des données : une réplique par ligne de plan_dialogues. Le locuteur
-- est rattaché à un asset personnage quand c'est possible — d'abord par la
-- voix déjà liée (voix_fiches.personnage_id), sinon par le nom (« Maya » ->
-- CHAR_maya, articles retirés : « La Tenancière » -> CHAR_tenanciere) ; sinon
-- il reste en texte libre (locuteur_texte), avec sa voix directe (voix_id) si
-- l'ancienne ligne en avait une.
CREATE TABLE "repliques" (
	"id" serial PRIMARY KEY NOT NULL,
	"uuid" uuid DEFAULT gen_random_uuid() NOT NULL,
	"project_id" integer NOT NULL,
	"episode_id" integer NOT NULL,
	"scene_id" integer,
	"ordre" integer DEFAULT 0 NOT NULL,
	"locuteur_id" integer,
	"locuteur_texte" varchar(100) DEFAULT '' NOT NULL,
	"voix_id" integer,
	"texte" text NOT NULL,
	"fichier" varchar(255),
	"fichier_texte" text,
	"duree_secondes" real,
	"statut" varchar(20) DEFAULT 'a_produire' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"legacy_dialogue_id" integer,
	CONSTRAINT "repliques_uuid_unique" UNIQUE("uuid")
);
--> statement-breakpoint
ALTER TABLE "repliques" ADD CONSTRAINT "repliques_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repliques" ADD CONSTRAINT "repliques_episode_id_episodes_id_fk" FOREIGN KEY ("episode_id") REFERENCES "public"."episodes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repliques" ADD CONSTRAINT "repliques_scene_id_scenes_id_fk" FOREIGN KEY ("scene_id") REFERENCES "public"."scenes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repliques" ADD CONSTRAINT "repliques_locuteur_id_assets_id_fk" FOREIGN KEY ("locuteur_id") REFERENCES "public"."assets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repliques" ADD CONSTRAINT "repliques_voix_id_assets_id_fk" FOREIGN KEY ("voix_id") REFERENCES "public"."assets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
-- Un personnage a au plus une voix : on écarte d'abord les doublons éventuels
-- (on garde la voix de plus petit id), sans quoi l'index unique échouerait.
UPDATE "voix_fiches" v
SET "personnage_id" = NULL
WHERE v."personnage_id" IS NOT NULL
  AND v."asset_id" <> (SELECT min(v2."asset_id") FROM "voix_fiches" v2 WHERE v2."personnage_id" = v."personnage_id");--> statement-breakpoint
-- Reprise : slug du locuteur (sans accents, snake_case), avec et sans article.
INSERT INTO "repliques" ("project_id", "episode_id", "scene_id", "ordre", "locuteur_id", "locuteur_texte", "voix_id", "texte", "duree_secondes", "legacy_dialogue_id")
SELECT
	src."project_id",
	src."episode_id",
	src."scene_id",
	(row_number() OVER (PARTITION BY src."episode_id" ORDER BY src."plan_ordre", src."plan_id", src."slot", src."dialogue_id") - 1)::integer,
	perso."id",
	CASE WHEN perso."id" IS NULL THEN src."locuteur" ELSE '' END,
	src."asset_voix_id",
	src."replique",
	src."duree_secondes"::real,
	src."dialogue_id"
FROM (
	SELECT
		d."id" AS dialogue_id, d."plan_id", d."slot", d."locuteur", d."asset_voix_id", d."replique", d."duree_secondes",
		p."project_id", p."episode_id", p."scene_id", p."ordre" AS plan_ordre,
		btrim(regexp_replace(translate(lower(d."locuteur"), 'àâäéèêëîïôöùûüçñ', 'aaaeeeeiioouuucn'), '[^a-z0-9]+', '_', 'g'), '_') AS slug
	FROM "plan_dialogues" d
	JOIN "plans" p ON p."id" = d."plan_id"
) src
LEFT JOIN LATERAL (
	SELECT a."id"
	FROM "assets" a
	WHERE a."project_id" = src."project_id"
	  AND a."type" = 'personnage'
	  AND (
		a."id" = (SELECT vf."personnage_id" FROM "voix_fiches" vf WHERE vf."asset_id" = src."asset_voix_id")
		OR lower(a."code") = 'char_' || src."slug"
		OR lower(a."code") = 'char_' || regexp_replace(src."slug", '^(le|la|les|l|un|une)_', '')
	  )
	ORDER BY (a."id" = (SELECT vf."personnage_id" FROM "voix_fiches" vf WHERE vf."asset_id" = src."asset_voix_id")) DESC NULLS LAST, a."id"
	LIMIT 1
) perso ON true;--> statement-breakpoint
-- Une voix liée à des répliques dont le locuteur est un personnage précis (un
-- seul) et qui n'a pas encore de personnage : on la rattache à lui, si ce
-- personnage n'a pas déjà une autre voix.
INSERT INTO "voix_fiches" ("asset_id", "personnage_id")
SELECT DISTINCT ON (c."pid") c."vid", c."pid"
FROM (
	SELECT r."voix_id" AS vid, min(r."locuteur_id") AS pid
	FROM "repliques" r
	WHERE r."voix_id" IS NOT NULL AND r."locuteur_id" IS NOT NULL
	GROUP BY r."voix_id"
	HAVING count(DISTINCT r."locuteur_id") = 1
) c
WHERE NOT EXISTS (SELECT 1 FROM "voix_fiches" vf WHERE vf."personnage_id" = c."pid" AND vf."asset_id" <> c."vid")
ORDER BY c."pid", c."vid"
ON CONFLICT ("asset_id") DO UPDATE SET "personnage_id" = COALESCE("voix_fiches"."personnage_id", EXCLUDED."personnage_id");--> statement-breakpoint
-- La voix se déduit désormais du personnage : `voix_id` ne reste que là où
-- cette déduction ne donne pas la même voix (locuteur hors personnage, ou voix
-- différente de celle du personnage).
UPDATE "repliques" r
SET "voix_id" = NULL
WHERE r."voix_id" IS NOT NULL
  AND r."locuteur_id" IS NOT NULL
  AND EXISTS (SELECT 1 FROM "voix_fiches" vf WHERE vf."asset_id" = r."voix_id" AND vf."personnage_id" = r."locuteur_id");--> statement-breakpoint
CREATE UNIQUE INDEX "voix_fiches_personnage_unique" ON "voix_fiches" USING btree ("personnage_id") WHERE "voix_fiches"."personnage_id" is not null;--> statement-breakpoint
-- plan_dialogues devient une liaison. `slot` est renuméroté 1..n par plan
-- (dans l'ordre existant) pour porter l'unicité (plan, slot).
ALTER TABLE "plan_dialogues" ADD COLUMN "replique_id" integer;--> statement-breakpoint
ALTER TABLE "plan_dialogues" ADD COLUMN "debut_secondes" real;--> statement-breakpoint
UPDATE "plan_dialogues" d SET "replique_id" = r."id" FROM "repliques" r WHERE r."legacy_dialogue_id" = d."id";--> statement-breakpoint
UPDATE "plan_dialogues" d
SET "slot" = numerote."rang"
FROM (SELECT "id", (row_number() OVER (PARTITION BY "plan_id" ORDER BY "slot", "id"))::integer AS "rang" FROM "plan_dialogues") numerote
WHERE numerote."id" = d."id";--> statement-breakpoint
ALTER TABLE "plan_dialogues" ALTER COLUMN "replique_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "plan_dialogues" DROP COLUMN "locuteur";--> statement-breakpoint
ALTER TABLE "plan_dialogues" DROP COLUMN "asset_voix_id";--> statement-breakpoint
ALTER TABLE "plan_dialogues" DROP COLUMN "replique";--> statement-breakpoint
ALTER TABLE "plan_dialogues" DROP COLUMN "duree_secondes";--> statement-breakpoint
ALTER TABLE "repliques" DROP COLUMN "legacy_dialogue_id";--> statement-breakpoint
ALTER TABLE "plan_dialogues" ADD CONSTRAINT "plan_dialogues_replique_id_repliques_id_fk" FOREIGN KEY ("replique_id") REFERENCES "public"."repliques"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_dialogues" ADD CONSTRAINT "plan_dialogues_plan_id_slot_unique" UNIQUE("plan_id","slot");--> statement-breakpoint
ALTER TABLE "plan_dialogues" ADD CONSTRAINT "plan_dialogues_plan_id_replique_id_unique" UNIQUE("plan_id","replique_id");
