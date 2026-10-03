-- Conversation d'entrée : la liste de ce qu'il reste à définir avec l'utilisateur (2026-10-03, retours du test
-- général). L'agent la remet à jour à chaque tour ; elle s'affiche à côté de la conversation, et `brief_pret` n'est
-- vrai que lorsqu'elle est vide. Idempotente.
ALTER TABLE "agent_conversations" ADD COLUMN IF NOT EXISTS "reste_a_definir" jsonb NOT NULL DEFAULT '[]'::jsonb;
