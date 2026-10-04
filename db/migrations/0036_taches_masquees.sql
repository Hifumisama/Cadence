-- Retirer une tâche TERMINÉE ou ÉCHOUÉE de la liste du panneau des générations (2026-10-02) :
-- une colonne `masque_at`, sans rien supprimer (le candidat d'une génération d'image reste
-- relisible dans la popup de son asset). Idempotente.
ALTER TABLE "asset_generations" ADD COLUMN IF NOT EXISTS "masque_at" timestamp;
ALTER TABLE "jobs" ADD COLUMN IF NOT EXISTS "masque_at" timestamp;
ALTER TABLE "agent_runs" ADD COLUMN IF NOT EXISTS "masque_at" timestamp;
