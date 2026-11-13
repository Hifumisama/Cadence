-- Retrait de la gestion des voix (master de voix) : lignes et colonnes qui ne servaient qu'à elle.
-- Les fichiers disque (voix/<assetId>/, generations/<assetId>/*.mp3|flac|mp4 des masters) se suppriment à part.
DELETE FROM "asset_generations" WHERE "methode" = 'master_voix';
DELETE FROM "plan_refs" WHERE "type" = 'audio';
ALTER TABLE "assets" DROP COLUMN IF EXISTS "voix_description";
ALTER TABLE "assets" DROP COLUMN IF EXISTS "voix_replique_base";
ALTER TABLE "assets" DROP COLUMN IF EXISTS "voix_master";
ALTER TABLE "assets" DROP COLUMN IF EXISTS "voix_video";
ALTER TABLE "assets" DROP COLUMN IF EXISTS "voix_master_at";
ALTER TABLE "asset_generations" DROP COLUMN IF EXISTS "duree_secondes";
ALTER TABLE "asset_generations" DROP COLUMN IF EXISTS "texte_reference";
ALTER TABLE "asset_generations" DROP COLUMN IF EXISTS "parametres";
