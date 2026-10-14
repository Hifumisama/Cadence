-- Image de raccord (2026-10-14) : additive, idempotente.
-- jobs.raccord_job_id : l'essai du plan PRÉCÉDENT dont la dernière image a servi de première image à cet essai (liaison « suite »). Null sans raccord.
ALTER TABLE "jobs" ADD COLUMN IF NOT EXISTS "raccord_job_id" integer REFERENCES "jobs"("id") ON DELETE SET NULL;
