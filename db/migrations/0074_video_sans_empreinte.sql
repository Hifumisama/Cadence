-- La fiche périmée se détecte avec lib/plans-perimes.ts (références, prompt, durée) contre la prévisualisation source : pas d'empreinte à stocker.
ALTER TABLE "jobs" DROP COLUMN IF EXISTS "empreinte_entree";
