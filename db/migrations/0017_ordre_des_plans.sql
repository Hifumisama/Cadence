ALTER TABLE "plans" ADD COLUMN "ordre" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
UPDATE "plans" p SET "ordre" = r.rang FROM (SELECT id, (row_number() OVER (PARTITION BY episode_id ORDER BY numero) - 1) AS rang FROM "plans") r WHERE p.id = r.id;
