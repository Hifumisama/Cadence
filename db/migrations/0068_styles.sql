-- La bibliothèque de styles passe en base (semée par db/seed-styles.ts depuis lib/styles/*.json, relancée à chaque db:migrate).
CREATE TABLE IF NOT EXISTS "styles" (
	"id" varchar(120) PRIMARY KEY NOT NULL,
	"nom" varchar(200) NOT NULL,
	"descriptor" text NOT NULL,
	"categories" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"filtres" jsonb NOT NULL,
	"clause" text DEFAULT '' NOT NULL,
	"apercus" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"ordre" integer DEFAULT 0 NOT NULL
);
