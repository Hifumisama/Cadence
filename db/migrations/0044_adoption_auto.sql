-- Génération d'images EN LOT : « générer par lot, c'est vouloir utiliser le résultat » (retours du test, 2026-10-03). Une
-- génération lancée par un lot est adoptée toute seule par le worker à sa fin (elle devient l'image de l'asset). Idempotente.
ALTER TABLE "asset_generations" ADD COLUMN IF NOT EXISTS "adoption_auto" boolean NOT NULL DEFAULT false;
