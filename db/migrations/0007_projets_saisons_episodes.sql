CREATE TYPE "public"."project_type" AS ENUM('oneshot', 'serie');
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" serial PRIMARY KEY NOT NULL,
	"nom" varchar(255) NOT NULL,
	"type" "project_type" NOT NULL,
	"clause_style" text DEFAULT '' NOT NULL,
	"scenario_arc" text DEFAULT '' NOT NULL,
	"scenario_style" text DEFAULT '' NOT NULL,
	"scenario_continuite" text DEFAULT '' NOT NULL,
	"scenario_rimes" text DEFAULT '' NOT NULL,
	"scenario_pieges" text DEFAULT '' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "seasons" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer NOT NULL,
	"numero" integer NOT NULL,
	"titre" varchar(255) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "episodes" (
	"id" serial PRIMARY KEY NOT NULL,
	"season_id" integer NOT NULL,
	"numero" integer NOT NULL,
	"titre" varchar(255) NOT NULL
);
--> statement-breakpoint
ALTER TABLE "seasons" ADD CONSTRAINT "seasons_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "episodes" ADD CONSTRAINT "episodes_season_id_seasons_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."seasons"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "mouvements" ADD COLUMN "episode_id" integer;
--> statement-breakpoint
ALTER TABLE "plans" ADD COLUMN "project_id" integer;
--> statement-breakpoint
ALTER TABLE "plans" ADD COLUMN "episode_id" integer;
--> statement-breakpoint
ALTER TABLE "assets" ADD COLUMN "project_id" integer;
--> statement-breakpoint
-- Bootstrap : rattache les données déjà en base (import de l'épisode 1) à
-- un premier projet "Les Yeux de Rubis" (type serie) / saison 1 / épisode 1
-- — voir la discussion projets/saisons/épisodes du 2026-09-28. Un projet
-- vide (aucune ligne à rattacher) n'en pâtit pas : les UPDATE suivants sont
-- alors des no-op.
INSERT INTO "projects" ("nom", "type", "clause_style") VALUES (
	'Les Yeux de Rubis',
	'serie',
	'Cinematic anime illustration, refined linework, sophisticated cinematic lighting, atmospheric depth, polished digital rendering, in the visual tradition of Makoto Shinkai and Yoshiyuki Sadamoto.'
);
--> statement-breakpoint
INSERT INTO "seasons" ("project_id", "numero", "titre")
SELECT "id", 1, 'Saison 1' FROM "projects" WHERE "nom" = 'Les Yeux de Rubis';
--> statement-breakpoint
INSERT INTO "episodes" ("season_id", "numero", "titre")
SELECT "s"."id", 1, 'Épisode 1'
FROM "seasons" "s"
JOIN "projects" "p" ON "p"."id" = "s"."project_id"
WHERE "p"."nom" = 'Les Yeux de Rubis';
--> statement-breakpoint
UPDATE "mouvements" SET "episode_id" = (
	SELECT "e"."id" FROM "episodes" "e"
	JOIN "seasons" "s" ON "s"."id" = "e"."season_id"
	JOIN "projects" "p" ON "p"."id" = "s"."project_id"
	WHERE "p"."nom" = 'Les Yeux de Rubis'
	LIMIT 1
) WHERE "episode_id" IS NULL;
--> statement-breakpoint
UPDATE "plans" SET
	"project_id" = (SELECT "id" FROM "projects" WHERE "nom" = 'Les Yeux de Rubis' LIMIT 1),
	"episode_id" = (
		SELECT "e"."id" FROM "episodes" "e"
		JOIN "seasons" "s" ON "s"."id" = "e"."season_id"
		JOIN "projects" "p" ON "p"."id" = "s"."project_id"
		WHERE "p"."nom" = 'Les Yeux de Rubis'
		LIMIT 1
	)
WHERE "project_id" IS NULL;
--> statement-breakpoint
UPDATE "assets" SET "project_id" = (
	SELECT "id" FROM "projects" WHERE "nom" = 'Les Yeux de Rubis' LIMIT 1
) WHERE "project_id" IS NULL;
--> statement-breakpoint
ALTER TABLE "mouvements" ALTER COLUMN "episode_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "mouvements" ADD CONSTRAINT "mouvements_episode_id_episodes_id_fk" FOREIGN KEY ("episode_id") REFERENCES "public"."episodes"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "plans" ALTER COLUMN "project_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "plans" ALTER COLUMN "episode_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "plans" ADD CONSTRAINT "plans_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "plans" ADD CONSTRAINT "plans_episode_id_episodes_id_fk" FOREIGN KEY ("episode_id") REFERENCES "public"."episodes"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "plans" DROP CONSTRAINT "plans_numero_unique";
--> statement-breakpoint
ALTER TABLE "plans" ADD CONSTRAINT "plans_project_id_numero_unique" UNIQUE("project_id","numero");
--> statement-breakpoint
ALTER TABLE "assets" ALTER COLUMN "project_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "assets" DROP CONSTRAINT "assets_code_unique";
--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_project_id_code_unique" UNIQUE("project_id","code");
