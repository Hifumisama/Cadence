-- Fiche d'asset « comme la fiche de plan » : chaque essai garde la consigne française qui l'a produit (traduite en prompt par un agent),
-- et la date où il est devenu l'image de l'asset (essai « retenu »). Statut de génération « traduction » : la consigne attend son prompt.
ALTER TABLE "asset_generations" ADD COLUMN IF NOT EXISTS "consigne" text;--> statement-breakpoint
ALTER TABLE "asset_generations" ADD COLUMN IF NOT EXISTS "adopte_at" timestamp;
