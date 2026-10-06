-- Génération des PRISES de répliques depuis l'application (workflow VOX_Generate_Replique_Simplified, Qwen3-TTS Voice Clone) :
-- la demande vit dans `asset_generations` (même file, même panneau, mêmes annulations), rattachée à sa réplique. Colonne nullable,
-- supprimée avec la réplique. Idempotente.
ALTER TABLE "asset_generations" ADD COLUMN IF NOT EXISTS "replique_id" integer;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'asset_generations_replique_id_fk') THEN
    ALTER TABLE "asset_generations"
      ADD CONSTRAINT "asset_generations_replique_id_fk" FOREIGN KEY ("replique_id") REFERENCES "repliques"("id") ON DELETE CASCADE;
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS "asset_generations_replique_idx" ON "asset_generations" ("replique_id");
