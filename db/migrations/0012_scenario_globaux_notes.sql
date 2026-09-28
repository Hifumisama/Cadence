ALTER TABLE "projects" DROP COLUMN "scenario_arc";--> statement-breakpoint
ALTER TABLE "projects" DROP COLUMN "scenario_style";--> statement-breakpoint
ALTER TABLE "projects" DROP COLUMN "scenario_continuite";--> statement-breakpoint
ALTER TABLE "projects" DROP COLUMN "scenario_rimes";--> statement-breakpoint
ALTER TABLE "projects" DROP COLUMN "scenario_pieges";--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "notes" text DEFAULT '' NOT NULL;
