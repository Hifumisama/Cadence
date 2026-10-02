-- Génération de la voix de référence (méthode « voix » de asset_generations, 2026-10-02) :
-- le texte lu par la voix, sa langue et la « température » (créativité de la voix, 0,8 à 1,2).
-- Le prompt de la génération porte l'instruction de timbre. null pour les images et les sons. Idempotente.
ALTER TABLE "asset_generations" ADD COLUMN IF NOT EXISTS "texte_reference" text;
ALTER TABLE "asset_generations" ADD COLUMN IF NOT EXISTS "langue_reference" varchar(40);
ALTER TABLE "asset_generations" ADD COLUMN IF NOT EXISTS "temperature" real;
