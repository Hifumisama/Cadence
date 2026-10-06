-- Test de voix générable depuis Cadence (casting vocal, étape « Test vidéo ») : deux méthodes de plus pour `asset_generations`
-- (« test_audio » : une réplique dite avec la voix de référence ; « test_video » : la voix sur un visage, prévisualisation ou rendu
-- final). `parametres` porte ce que la méthode a besoin de figer au lancement (références du test vidéo, prévisualisation ou
-- upscale). null pour les images, les sons et les voix. Idempotente.
ALTER TABLE "asset_generations" ADD COLUMN IF NOT EXISTS "parametres" jsonb;
