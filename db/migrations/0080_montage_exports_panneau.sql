-- L'export de l'épisode devient une tâche du panneau du bandeau (clé `montage:<id>`, lib/montage-tache.ts) : « vu » et « retiré de la
-- liste », comme les autres tâches (jobs.vu_at / masque_at). Les exports déjà finis sont marqués vus : ils n'apparaissent pas d'un coup
-- comme des résultats « à voir ».
ALTER TABLE "montage_exports" ADD COLUMN IF NOT EXISTS "vu_at" timestamp;
--> statement-breakpoint
ALTER TABLE "montage_exports" ADD COLUMN IF NOT EXISTS "masque_at" timestamp;
--> statement-breakpoint
UPDATE "montage_exports" SET "vu_at" = coalesce("finished_at", "created_at") WHERE "vu_at" IS NULL AND "statut" IN ('termine', 'echoue');
