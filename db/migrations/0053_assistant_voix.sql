-- L'assistant par voix (casting vocal, 2026-10-09) : le NOM de la voix (éditable ; à défaut il reste dérivé du personnage ou du code),
-- le fichier SOURCE fourni (audio ou vidéo, avant l'extraction de la voix) et le JOURNAL des essais de timbre (instruction, verdict,
-- remarque). Idempotente.
ALTER TABLE "voix_fiches" ADD COLUMN IF NOT EXISTS "nom" varchar(80);
ALTER TABLE "voix_fiches" ADD COLUMN IF NOT EXISTS "source_fichier" varchar(255);
ALTER TABLE "voix_fiches" ADD COLUMN IF NOT EXISTS "essais" jsonb DEFAULT '[]'::jsonb NOT NULL;
