-- La fiche de notes de l'entretien d'entrée remplace la grille de couverture : le brief se remplit message après message,
-- tenu par le code (lib/agents/fiche.ts). Idempotente.
ALTER TABLE "agent_conversations" ADD COLUMN IF NOT EXISTS "fiche" jsonb;
ALTER TABLE "agent_conversations" DROP COLUMN IF EXISTS "couverture";
