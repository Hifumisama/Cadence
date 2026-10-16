-- Les DEMANDES : un geste en plusieurs étapes (itérer un plan) = une ligne dans la file, du clic au résultat.
-- Les tâches qui en sont des étapes (runs d'agent, jobs vidéo) pointent vers leur demande.
CREATE TABLE IF NOT EXISTS "demandes" (
	"id" serial PRIMARY KEY NOT NULL,
	"uuid" uuid DEFAULT gen_random_uuid() NOT NULL,
	"project_id" integer NOT NULL,
	"type" varchar(24) NOT NULL,
	"cible_type" varchar(8) NOT NULL,
	"cible_id" integer NOT NULL,
	"statut" varchar(10) DEFAULT 'en_cours' NOT NULL,
	"etapes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"contexte" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"erreur" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"finished_at" timestamp,
	"vu_at" timestamp,
	"masque_at" timestamp,
	CONSTRAINT "demandes_uuid_unique" UNIQUE("uuid")
);--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "demandes" ADD CONSTRAINT "demandes_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "demandes_une_en_cours_par_cible" ON "demandes" USING btree ("cible_type","cible_id") WHERE "demandes"."statut" = 'en_cours';--> statement-breakpoint
ALTER TABLE "agent_runs" ADD COLUMN IF NOT EXISTS "demande_id" integer;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN IF NOT EXISTS "demande_id" integer;
