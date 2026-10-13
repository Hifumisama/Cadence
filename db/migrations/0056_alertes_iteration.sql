-- « Itérer » sans arrêt (2026-10-12) : additive, idempotente.
-- jobs.alertes_iteration : ce que l'agent a signalé en appliquant sa correction (doute sur son diagnostic, changement refusé par un
-- contrôle…), gardé sur l'essai créé. Null pour tout essai qui ne vient pas d'« Itérer ».
ALTER TABLE "jobs" ADD COLUMN IF NOT EXISTS "alertes_iteration" jsonb;
