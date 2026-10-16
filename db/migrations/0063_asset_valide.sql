-- Statut et criticité d'un asset se calculent désormais (lib/asset-etat.ts) : « à produire » sans fichier, « en cours » avec un fichier,
-- « validé » quand `valide` est vrai ; critique selon le nombre de plans qui le citent. Seule la validation reste une décision stockée.
ALTER TABLE "assets" ADD COLUMN IF NOT EXISTS "valide" boolean DEFAULT false NOT NULL;--> statement-breakpoint
UPDATE "assets" SET "valide" = true WHERE "statut"::text = 'valide';--> statement-breakpoint
ALTER TABLE "assets" DROP COLUMN IF EXISTS "statut";--> statement-breakpoint
ALTER TABLE "assets" DROP COLUMN IF EXISTS "critique";--> statement-breakpoint
DROP TYPE IF EXISTS "asset_statut";
