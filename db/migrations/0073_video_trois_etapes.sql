-- Vidéo en trois étapes (docs/PLAN_INTEGRATION_WORKER.md) : génération 0,4 MP (prévisualisation), puis upscale et finition (rendu final).
-- latent_dossier : où ComfyUI a rangé les latents de la prévisualisation ; empreinte_entree : de quoi vérifier que la fiche n'a pas changé depuis ;
-- job_source_id : la prévisualisation dont part un rendu final.
ALTER TABLE "jobs" ADD COLUMN "latent_dossier" varchar(255);--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "empreinte_entree" varchar(64);--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "job_source_id" integer;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_job_source_id_jobs_id_fk" FOREIGN KEY ("job_source_id") REFERENCES "public"."jobs"("id") ON DELETE set null ON UPDATE no action;
