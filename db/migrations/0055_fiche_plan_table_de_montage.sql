-- Fiche de plan « table de montage » (2026-10-12) : additive, idempotente, aucune valeur d'enum.
-- jobs.consigne / jobs.depuis_numero_rendu : la consigne de l'utilisateur qui a produit l'essai, et le numéro de l'essai dont il part
-- (null pour une première génération, un import et les rendus d'avant).
-- plans.pret_upscale_at : plan validé « prêt à upscaler » (l'état affiché est dérivé, voir lib/fiche-plan.ts) ;
-- plans.rendu_retenu_id : l'essai validé, remis à null si on le supprime.
ALTER TABLE "jobs" ADD COLUMN IF NOT EXISTS "consigne" text;
ALTER TABLE "jobs" ADD COLUMN IF NOT EXISTS "depuis_numero_rendu" integer;
ALTER TABLE "plans" ADD COLUMN IF NOT EXISTS "pret_upscale_at" timestamp;
ALTER TABLE "plans" ADD COLUMN IF NOT EXISTS "rendu_retenu_id" integer;
DO $$ BEGIN
  ALTER TABLE "plans" ADD CONSTRAINT "plans_rendu_retenu_id_jobs_id_fk" FOREIGN KEY ("rendu_retenu_id") REFERENCES "jobs"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
