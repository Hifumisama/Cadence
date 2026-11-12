-- Colonnes de `plans` jamais lues ni écrites par l'application : `acte` (0 valeur), `notes` (0 valeur), `mode` (toujours « full-reference »).
ALTER TABLE "plans" DROP COLUMN IF EXISTS "acte";
ALTER TABLE "plans" DROP COLUMN IF EXISTS "notes";
ALTER TABLE "plans" DROP COLUMN IF EXISTS "mode";
