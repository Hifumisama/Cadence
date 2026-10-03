-- Progression d'un rendu vidéo (2026-10-03, retours du test général) : l'étape en cours (génération MiniMax H3,
-- interpolation, encodage) et, quand ComfyUI en donne une, la progression valeur / max. Écrites par le worker au plus
-- une fois par seconde, remises à null en fin de rendu. Pas d'aperçu image : la génération H3 est un nœud d'API
-- distant, sans latent à montrer. Idempotente.
ALTER TABLE "jobs" ADD COLUMN IF NOT EXISTS "progression_valeur" integer;
ALTER TABLE "jobs" ADD COLUMN IF NOT EXISTS "progression_max" integer;
ALTER TABLE "jobs" ADD COLUMN IF NOT EXISTS "etape_libelle" varchar(80);
