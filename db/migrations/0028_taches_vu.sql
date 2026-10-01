-- File d'attente / indicateur du header : « vu » posé quand l'utilisateur a pris
-- connaissance d'une tâche terminée ou échouée. Écrite à la main, sans enum pg.
-- Les tâches déjà finies avant cette migration sont considérées comme vues.
ALTER TABLE "asset_generations" ADD COLUMN "vu_at" timestamp;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "vu_at" timestamp;--> statement-breakpoint
UPDATE "asset_generations" SET "vu_at" = now() WHERE "statut" NOT IN ('en_attente', 'en_cours');--> statement-breakpoint
UPDATE "jobs" SET "vu_at" = now() WHERE "statut" NOT IN ('en_attente', 'en_cours');
