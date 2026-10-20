-- Fin du concept de série : un projet est un film. Les saisons disparaissent (l'épisode se rattache directement au projet) et le
-- type de projet (oneshot | serie) avec elles. Les affiches de saison et les conversations « saison » n'ont plus de sens : supprimées.
DELETE FROM "agent_runs" WHERE "conversation_id" IN (SELECT "id" FROM "agent_conversations" WHERE "portee" = 'saison');--> statement-breakpoint
DELETE FROM "agent_conversations" WHERE "portee" = 'saison';--> statement-breakpoint
DELETE FROM "proposition_changements" WHERE "cible_type" = 'saison' OR "proposition_id" IN (SELECT "id" FROM "propositions" WHERE "portee" = 'saison');--> statement-breakpoint
DELETE FROM "propositions" WHERE "portee" = 'saison';--> statement-breakpoint
DELETE FROM "assets" WHERE "code" ~ '^AFFICHE_S[0-9]+$';--> statement-breakpoint
ALTER TABLE "episodes" ADD COLUMN "project_id" integer;--> statement-breakpoint
UPDATE "episodes" SET "project_id" = "seasons"."project_id" FROM "seasons" WHERE "seasons"."id" = "episodes"."season_id";--> statement-breakpoint
ALTER TABLE "episodes" ALTER COLUMN "project_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "episodes" ADD CONSTRAINT "episodes_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade;--> statement-breakpoint
ALTER TABLE "episodes" DROP COLUMN "season_id";--> statement-breakpoint
DROP TABLE "seasons";--> statement-breakpoint
ALTER TABLE "projects" DROP COLUMN "type";--> statement-breakpoint
DROP TYPE "public"."project_type";
