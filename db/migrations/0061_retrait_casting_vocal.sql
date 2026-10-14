-- Retrait du casting vocal (chantier voix/master, étape 3, 2026-10-14) : la voix est un champ du personnage (migration 0060), plus un asset
-- « voix » ; une réplique n'est qu'un texte (ni prise, ni voix directe, ni statut). Base de test : on supprime sans migrer les prises,
-- les doublages, les tests audio/vidéo et les fiches de casting. Idempotente (IF EXISTS partout).

-- 1. Une réplique portée par une voix SANS personnage (voix off) garde son locuteur en texte libre (le rattachement la relie ensuite à un
--    personnage du même nom).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'repliques' AND column_name = 'voix_id') THEN
    UPDATE "repliques" r
       SET "locuteur_texte" = regexp_replace(a."code", '^[A-Z]+_', '')
      FROM "assets" a
     WHERE r."voix_id" = a."id" AND r."locuteur_id" IS NULL AND r."locuteur_texte" = '';
  END IF;
END $$;--> statement-breakpoint

-- 2. Les générations de l'ancien casting (voix de référence, extraction, tests, prises, doublages) : lignes supprimées.
DELETE FROM "asset_generations" WHERE "methode" IN ('voix', 'voix_source', 'test_audio', 'test_video', 'replique', 'doublage');--> statement-breakpoint
ALTER TABLE "asset_generations" DROP COLUMN IF EXISTS "replique_id";--> statement-breakpoint
ALTER TABLE "asset_generations" DROP COLUMN IF EXISTS "langue_reference";--> statement-breakpoint
ALTER TABLE "asset_generations" DROP COLUMN IF EXISTS "temperature";--> statement-breakpoint

-- 3. Les répliques : plus de prise, de voix directe ni de statut.
ALTER TABLE "repliques" DROP COLUMN IF EXISTS "voix_id";--> statement-breakpoint
ALTER TABLE "repliques" DROP COLUMN IF EXISTS "fichier";--> statement-breakpoint
ALTER TABLE "repliques" DROP COLUMN IF EXISTS "fichier_texte";--> statement-breakpoint
ALTER TABLE "repliques" DROP COLUMN IF EXISTS "statut";--> statement-breakpoint

-- 4. Les fiches de casting, puis les assets de type « voix » (et leurs références de plan éventuelles).
DROP TABLE IF EXISTS "voix_fiches";--> statement-breakpoint
DELETE FROM "plan_refs" WHERE "asset_id" IN (SELECT "id" FROM "assets" WHERE "type" = 'voix');--> statement-breakpoint
DELETE FROM "assets" WHERE "type" = 'voix';
