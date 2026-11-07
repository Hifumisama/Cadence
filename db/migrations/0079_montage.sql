-- Montage (docs/PLAN_MONTAGE.md) : l'ordre du montage final, À CÔTÉ de l'ordre du scénario (`plans.ordre`, inchangé).
-- Une entrée = un plan dans le montage, avec le rendu retenu pour elle et son rognage non destructif (fin null = rendu entier).
CREATE TABLE IF NOT EXISTS "montage_entrees" (
  "id" serial PRIMARY KEY NOT NULL,
  "episode_id" integer NOT NULL REFERENCES "episodes"("id") ON DELETE cascade,
  "plan_id" integer NOT NULL REFERENCES "plans"("id") ON DELETE cascade,
  "rendu_retenu_id" integer REFERENCES "jobs"("id") ON DELETE set null,
  "rang" integer NOT NULL,
  "debut_secondes" real DEFAULT 0 NOT NULL,
  "fin_secondes" real,
  "created_at" timestamp DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "montage_entrees_episode_idx" ON "montage_entrees" ("episode_id", "rang");

-- Exports de l'épisode : demandés par l'interface, encodés par le worker (ffmpeg).
CREATE TABLE IF NOT EXISTS "montage_exports" (
  "id" serial PRIMARY KEY NOT NULL,
  "episode_id" integer NOT NULL REFERENCES "episodes"("id") ON DELETE cascade,
  "statut" varchar(12) DEFAULT 'en_attente' NOT NULL,
  "segments" jsonb NOT NULL,
  "nb_ignores" integer DEFAULT 0 NOT NULL,
  "fichier" varchar(255),
  "duree_secondes" real,
  "erreur" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "started_at" timestamp,
  "finished_at" timestamp
);

-- Rattrapage : chaque épisode existant reçoit son montage, calqué sur l'ordre actuel (un plan = une entrée, son essai retenu s'il en
-- a un, sinon le rendu par défaut ; plan entier). Rien n'est vide à l'ouverture de la page Montage.
INSERT INTO "montage_entrees" ("episode_id", "plan_id", "rendu_retenu_id", "rang", "debut_secondes", "fin_secondes")
SELECT p."episode_id", p."id", p."rendu_retenu_id",
       (row_number() OVER (PARTITION BY p."episode_id" ORDER BY p."ordre", p."id") - 1)::int,
       0, NULL
FROM "plans" p
WHERE NOT EXISTS (SELECT 1 FROM "montage_entrees" m WHERE m."episode_id" = p."episode_id");
