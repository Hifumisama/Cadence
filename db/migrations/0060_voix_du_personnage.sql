-- Voix du personnage (chantier voix/master, 2026-10-14) : additive, idempotente.
-- Une voix n'existe que portée par un personnage : sa description (texte libre), la réplique du test, le master (audio nettoyé) et la
-- vidéo de test qui l'a produit (fichiers sous voix/<assetId>/). Remplace à terme les assets de type « voix » et voix_fiches.
ALTER TABLE "assets" ADD COLUMN IF NOT EXISTS "voix_description" text;
ALTER TABLE "assets" ADD COLUMN IF NOT EXISTS "voix_replique_base" text;
ALTER TABLE "assets" ADD COLUMN IF NOT EXISTS "voix_master" varchar(255);
ALTER TABLE "assets" ADD COLUMN IF NOT EXISTS "voix_video" varchar(255);
ALTER TABLE "assets" ADD COLUMN IF NOT EXISTS "voix_master_at" timestamp;
