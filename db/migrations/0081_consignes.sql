-- La file de consignes (docs/PLAN_FILE_CONSIGNES.md) : des brouillons d'itération par plan, empilés sans attendre le rendu précédent.
-- Table purement additive : rien d'existant n'est touché.
CREATE TABLE IF NOT EXISTS "consignes" (
	"id" serial PRIMARY KEY NOT NULL,
	"plan_id" integer NOT NULL,
	"texte" text NOT NULL,
	"reglages" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"rang" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "consignes" ADD CONSTRAINT "consignes_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "plans"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "consignes_plan_idx" ON "consignes" ("plan_id", "rang");
