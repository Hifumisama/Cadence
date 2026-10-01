-- Annulation des tâches : drapeau posé par l'interface sur une tâche EN COURS, lu par
-- le worker (qui interrompt ComfyUI puis marque la tâche annulée). Écrite à la main,
-- sans enum pg : une image annulée a le statut varchar `annulee`, une vidéo annulée
-- finit `echoue` avec l'erreur « Annulée ».
ALTER TABLE "asset_generations" ADD COLUMN "annulation_demandee_at" timestamp;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "annulation_demandee_at" timestamp;
