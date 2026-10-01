-- Progression d'une génération d'images, relayée par le worker (suivi
-- WebSocket ComfyUI) pour que la page l'affiche. Écrite à la main.
ALTER TABLE "asset_generations" ADD COLUMN "progression_valeur" integer;--> statement-breakpoint
ALTER TABLE "asset_generations" ADD COLUMN "progression_max" integer;--> statement-breakpoint
ALTER TABLE "asset_generations" ADD COLUMN "etape_libelle" varchar(80);--> statement-breakpoint
ALTER TABLE "asset_generations" ADD COLUMN "apercu_fichier" varchar(255);--> statement-breakpoint
ALTER TABLE "asset_generations" ADD COLUMN "apercu_at" timestamp;
