-- Règles de suppression en cascade (2026-09-28) : voir docs/FRICTIONS.md.
-- Projet supprimé -> tout tombe avec lui, y compris ses assets (le seul
-- cas où un asset disparaît). Plan supprimé (directement ou par cascade
-- depuis son épisode/saison/projet) -> ses refs/dialogues disparaissent
-- avec lui, jamais les assets qu'ils citaient.
ALTER TABLE "plans" DROP CONSTRAINT "plans_project_id_projects_id_fk";
--> statement-breakpoint
ALTER TABLE "plans" ADD CONSTRAINT "plans_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "plans" DROP CONSTRAINT "plans_episode_id_episodes_id_fk";
--> statement-breakpoint
ALTER TABLE "plans" ADD CONSTRAINT "plans_episode_id_episodes_id_fk" FOREIGN KEY ("episode_id") REFERENCES "public"."episodes"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "assets" DROP CONSTRAINT "assets_project_id_projects_id_fk";
--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
