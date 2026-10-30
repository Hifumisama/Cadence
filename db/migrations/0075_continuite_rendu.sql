-- Comment un rendu prolonge le plan précédent : « latent » (Motion Context) ou « image » (repli). Voir docs/PLAN_INTEGRATION_WORKER.md, phase 3b.
ALTER TABLE "jobs" ADD COLUMN IF NOT EXISTS "continuite" varchar(10);
