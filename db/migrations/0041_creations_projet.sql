-- L'installateur : la création d'un projet de bout en bout, étape par étape et sans validation intermédiaire
-- (2026-10-03, retours du test général). Une ligne par projet ; `etapes` = la liste ordonnée des étapes avec leur
-- état (lib/agents/creation.ts), que le worker fait avancer à chaque tour. Idempotente.
CREATE TABLE IF NOT EXISTS "creations_projet" (
  "id" serial PRIMARY KEY,
  "project_id" integer NOT NULL UNIQUE REFERENCES "projects"("id") ON DELETE CASCADE,
  "statut" varchar(10) NOT NULL DEFAULT 'en_cours',
  "etapes" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "erreur" text,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);
