-- Historique du prompt d'un plan : chaque enregistrement du prompt en texte libre garde son texte entier.
CREATE TABLE IF NOT EXISTS "plan_prompt_versions" (
  "id" serial PRIMARY KEY NOT NULL,
  "plan_id" integer NOT NULL REFERENCES "plans"("id") ON DELETE cascade,
  "texte" text NOT NULL,
  "source" varchar(20) NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "plan_prompt_versions_plan_idx" ON "plan_prompt_versions" ("plan_id", "created_at");
