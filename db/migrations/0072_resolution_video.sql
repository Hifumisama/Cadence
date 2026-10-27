-- Résolution des rendus vidéo (0,2 / 0,3 / 0,4 MP, lib/resolution-video.ts) : un réglage du plan, copié sur chaque rendu au lancement.
ALTER TABLE "plans" ADD COLUMN "megapixels" real DEFAULT 0.2 NOT NULL;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "megapixels" real DEFAULT 0.2 NOT NULL;
