-- Retrait des bruitages (docs/PLAN_RETRAIT_BRUITAGES.md) : plus d'asset `sfx`, plus de génération audio (Stable Audio 3).
-- Les assets `sfx` existants (2 au retrait, aucun cité par un plan) sont supprimés avec leurs essais ; leurs fichiers sous data/ sont ôtés à part.
-- Les voix ne sont pas concernées : `asset_generations.duree_secondes` reste (vidéo de test d'un master de voix).
DELETE FROM "plan_refs" WHERE "asset_id" IN (SELECT "id" FROM "assets" WHERE "type" = 'sfx');
--> statement-breakpoint
UPDATE "assets" SET "derive_de_id" = NULL WHERE "derive_de_id" IN (SELECT "id" FROM "assets" WHERE "type" = 'sfx');
--> statement-breakpoint
DELETE FROM "asset_generations" WHERE "asset_id" IN (SELECT "id" FROM "assets" WHERE "type" = 'sfx');
--> statement-breakpoint
DELETE FROM "assets" WHERE "type" = 'sfx';
--> statement-breakpoint
ALTER TABLE "assets" DROP COLUMN IF EXISTS "duree_secondes";
