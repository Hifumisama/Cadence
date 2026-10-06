-- Date de pose du fichier d'un asset (adoption, import, prise de voix) : sert à repérer les plans dont le dernier rendu est
-- antérieur à une de leurs références (« plan périmé »). Les assets existants prennent la date du jour : on ne sait pas
-- quand leur image a été posée, et marquer à tort des plans périmés serait pire que de ne rien dire. Idempotente.
ALTER TABLE "assets" ADD COLUMN IF NOT EXISTS "fichier_at" timestamp;
UPDATE "assets" SET "fichier_at" = now() WHERE "fichier" IS NOT NULL AND "fichier_at" IS NULL;
