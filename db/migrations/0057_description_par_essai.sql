-- La description (intention) du plan est versionnée PAR ESSAI, comme le prompt (2026-10-14) : additive, idempotente.
-- jobs.description_utilisee : la description du plan au moment où le worker a soumis l'essai (avec son « État en fin de plan »). « Repartir de là » et
-- « Utiliser ce rendu » la restaurent avec le prompt ; une correction d'« Itérer » qui change ce qui se passe dans le plan écrit la nouvelle
-- description et laisse l'ancienne dans l'essai précédent. Null pour un import et les essais d'avant.
ALTER TABLE "jobs" ADD COLUMN IF NOT EXISTS "description_utilisee" text;
