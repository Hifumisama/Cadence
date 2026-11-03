-- Le LoRA « CharacterDesign » (fiche personnage à 4 vues) est retiré du workflow d'images : la fiche se demande dans le prompt (guide-krea2.md). La colonne ne servait plus qu'à lui.
ALTER TABLE "asset_generations" DROP COLUMN IF EXISTS "lora_personnage";
