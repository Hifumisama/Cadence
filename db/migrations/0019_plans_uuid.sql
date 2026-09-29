ALTER TABLE "plans" ADD COLUMN "uuid" uuid DEFAULT gen_random_uuid() NOT NULL;--> statement-breakpoint
ALTER TABLE "plans" ADD CONSTRAINT "plans_uuid_unique" UNIQUE("uuid");--> statement-breakpoint
UPDATE "plans" SET "numeros_source" = ARRAY["numero"] WHERE "numeros_source" IS NULL;--> statement-breakpoint
ALTER TABLE "plans" DROP CONSTRAINT "plans_episode_id_numero_unique";--> statement-breakpoint
ALTER TABLE "plans" DROP COLUMN "numero";--> statement-breakpoint
ALTER TABLE "episodes" DROP COLUMN "dernier_numero_plan";
