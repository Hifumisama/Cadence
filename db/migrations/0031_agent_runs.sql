-- File des appels LLM (genre « llm » du worker). Écrite à la main, sans enum pg :
-- `statut` est un varchar contrôlé par l'application
-- (en_attente / en_cours / termine / echoue / annulee).
CREATE TABLE "agent_runs" (
  "id" serial PRIMARY KEY NOT NULL,
  "uuid" uuid DEFAULT gen_random_uuid() NOT NULL,
  "skill" varchar(40) NOT NULL,
  "project_id" integer,
  "entree" jsonb NOT NULL,
  "options" jsonb,
  "statut" varchar(12) DEFAULT 'en_attente' NOT NULL,
  "progression_jetons" integer,
  "resultat" jsonb,
  "erreur" text,
  "trace_id" integer,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "started_at" timestamp,
  "finished_at" timestamp,
  "vu_at" timestamp,
  "annulation_demandee_at" timestamp,
  CONSTRAINT "agent_runs_uuid_unique" UNIQUE("uuid")
);--> statement-breakpoint
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_trace_id_agent_traces_id_fk" FOREIGN KEY ("trace_id") REFERENCES "public"."agent_traces"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agent_runs_statut_idx" ON "agent_runs" ("statut", "created_at");
