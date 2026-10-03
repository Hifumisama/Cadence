-- Streaming des appels d'agent (2026-10-03, retours du test général) : le texte de la réponse et la fin de la
-- réflexion, écrits par le worker au plus une fois par seconde pendant l'appel, lus par l'interface. Remis à null
-- en fin d'appel. Idempotente.
ALTER TABLE "agent_runs" ADD COLUMN IF NOT EXISTS "flux_texte" text;
ALTER TABLE "agent_runs" ADD COLUMN IF NOT EXISTS "flux_reflexion" text;
