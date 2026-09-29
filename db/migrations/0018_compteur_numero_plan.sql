ALTER TABLE "episodes" ADD COLUMN "dernier_numero_plan" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
UPDATE "episodes" e SET "dernier_numero_plan" = COALESCE((SELECT max(p.numero) FROM "plans" p WHERE p.episode_id = e.id), 0);
