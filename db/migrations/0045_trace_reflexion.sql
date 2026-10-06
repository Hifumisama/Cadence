-- Recette (2026-10-04) : garder le raisonnement du modèle (reasoning_content) dans la trace, pour comprendre pourquoi une
-- sortie dérive. Borné côté application (100 000 caractères par réponse). Idempotente.
ALTER TABLE "agent_traces" ADD COLUMN IF NOT EXISTS "reflexion" text;
