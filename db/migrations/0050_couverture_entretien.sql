-- Grille de couverture de l'entretien d'entrée : à chaque tour, l'agent dit ce que l'utilisateur a réellement dit (cœur,
-- fin, ton, durée, style…). Le code refuse « briefing prêt » tant que l'essentiel n'est pas dit, et renvoie à l'agent ce qui
-- manque au tour suivant. Null = aucun tour avec grille encore. Idempotente.
ALTER TABLE "agent_conversations" ADD COLUMN IF NOT EXISTS "couverture" jsonb;
