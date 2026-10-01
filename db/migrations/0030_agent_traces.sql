-- Traces d'exécution des skills d'agents (brique LLM). Écrite à la main, sans enum pg :
-- `statut` est un varchar contrôlé par l'application (ok / invalide / echoue / interrompu).
CREATE TABLE "agent_traces" (
  "id" serial PRIMARY KEY NOT NULL,
  "uuid" uuid DEFAULT gen_random_uuid() NOT NULL,
  "skill" varchar(40) NOT NULL,
  "fournisseur" varchar(30) NOT NULL,
  "modele" varchar(80) NOT NULL,
  "statut" varchar(12) NOT NULL,
  "project_id" integer,
  "messages" jsonb NOT NULL,
  "systeme_empreinte" varchar(64) NOT NULL,
  "systeme_caracteres" integer NOT NULL,
  "sortie_brute" text,
  "json" jsonb,
  "erreurs_validation" jsonb,
  "erreur" text,
  "renvois" integer DEFAULT 0 NOT NULL,
  "tokens_entree" integer DEFAULT 0 NOT NULL,
  "tokens_sortie" integer DEFAULT 0 NOT NULL,
  "duree_ms" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "agent_traces_uuid_unique" UNIQUE("uuid")
);--> statement-breakpoint
ALTER TABLE "agent_traces" ADD CONSTRAINT "agent_traces_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agent_traces_skill_created_idx" ON "agent_traces" ("skill", "created_at");
