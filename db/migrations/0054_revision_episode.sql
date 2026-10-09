-- La révision d'un épisode (le réalisateur, 2026-10-09, docs/FRICTIONS.md « révision d'épisode »).
-- 1. Une conversation de révision se FERME à l'application : elle garde son historique, une neuve peut s'ouvrir sur le même épisode.
--    L'index unique devient PARTIEL (seules les conversations ouvertes) et compte la profondeur : la révision d'un épisode coexiste
--    avec sa conversation « courte » (écrire son scénario). Aucune conversation existante n'est fermée : même contenu qu'avant.
-- 2. Les PISTES proposées au dernier tour et pas encore choisies.
-- 3. Les DÉCISIONS : le brouillon de la révision, jamais une table métier.
-- Idempotente.
ALTER TABLE "agent_conversations" ADD COLUMN IF NOT EXISTS "pistes" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "agent_conversations" ADD COLUMN IF NOT EXISTS "fermee_at" timestamp;--> statement-breakpoint
DROP INDEX IF EXISTS "agent_conversations_cible_idx";--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "agent_conversations_cible_idx" ON "agent_conversations" ("project_id","portee","profondeur",(coalesce("cible_id", 0))) WHERE "fermee_at" IS NULL;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "revision_decisions" (
  "id" serial PRIMARY KEY NOT NULL,
  "uuid" uuid DEFAULT gen_random_uuid() NOT NULL,
  "conversation_id" integer NOT NULL,
  "ordre" integer DEFAULT 0 NOT NULL,
  "titre" varchar(200) NOT NULL,
  "raison" text DEFAULT '' NOT NULL,
  "statut" varchar(12) DEFAULT 'retenue' NOT NULL,
  "operations" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "changements" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "constats" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "gain_secondes" integer DEFAULT 0 NOT NULL,
  "a_reverifier" boolean DEFAULT false NOT NULL,
  "proposition_id" integer,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  "applique_at" timestamp,
  CONSTRAINT "revision_decisions_uuid_unique" UNIQUE("uuid")
);--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "revision_decisions" ADD CONSTRAINT "revision_decisions_conversation_id_agent_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "agent_conversations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "revision_decisions_conversation_idx" ON "revision_decisions" ("conversation_id","ordre");
