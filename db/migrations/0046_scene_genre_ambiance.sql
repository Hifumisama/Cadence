-- Recette (2026-10-05) : un genre et une ambiance par scène. Le genre (action, dialogue, montage, contemplatif, tension)
-- choisit les guides de rédaction du prompt vidéo de ses plans ; l'ambiance (moment, météo, lumière générale) tient la
-- continuité visuelle entre les plans d'une scène. Colonnes nullables, idempotentes : les scènes existantes restent « standard ».
ALTER TABLE "scenes" ADD COLUMN IF NOT EXISTS "genre" varchar(20);
ALTER TABLE "scenes" ADD COLUMN IF NOT EXISTS "ambiance" text;
