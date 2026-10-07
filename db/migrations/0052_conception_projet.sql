-- La conception d'un projet : les choix faits avant l'entretien (format, genres, ton, durée, rythme, langue, style), et le prompt long
-- du style (images) copié dans le projet à côté de la clause courte. Idempotente.
CREATE TABLE IF NOT EXISTS "conceptions" (
  "id" serial PRIMARY KEY NOT NULL,
  "project_id" integer NOT NULL,
  "contenu" jsonb NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "conceptions_project_id_unique" UNIQUE("project_id"),
  CONSTRAINT "conceptions_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE cascade ON UPDATE no action
);
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "style_prompt_image" text DEFAULT '' NOT NULL;
