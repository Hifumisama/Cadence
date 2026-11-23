-- Les images passent à MiniMax H3 Image (génération et édition) : plus de LoRA Lightning ni de mode « Qualité » pour Qwen Image Edit.
ALTER TABLE "asset_generations" DROP COLUMN IF EXISTS "lightning";
