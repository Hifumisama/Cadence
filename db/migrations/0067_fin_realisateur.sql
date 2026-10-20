-- Le réalisateur d'épisode (révision) est décommissionné : ses conversations, ses tâches, ses décisions et leurs colonnes disparaissent.
DELETE FROM "agent_runs" WHERE "skill" IN ('realisateur-analyse', 'realisateur-reponse') OR "conversation_id" IN (SELECT "id" FROM "agent_conversations" WHERE "profondeur" = 'revision');--> statement-breakpoint
DROP TABLE IF EXISTS "revision_decisions";--> statement-breakpoint
DELETE FROM "agent_conversations" WHERE "profondeur" = 'revision';--> statement-breakpoint
DROP INDEX IF EXISTS "agent_conversations_cible_idx";--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "agent_conversations_cible_idx" ON "agent_conversations" ("project_id","portee","profondeur",(coalesce("cible_id", 0)));--> statement-breakpoint
ALTER TABLE "agent_conversations" DROP COLUMN IF EXISTS "pistes";--> statement-breakpoint
ALTER TABLE "agent_conversations" DROP COLUMN IF EXISTS "fermee_at";
