ALTER TABLE "agent_runs" ADD COLUMN "but" varchar(12);--> statement-breakpoint
ALTER TABLE "agent_runs" ADD COLUMN "conversation_id" integer;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD COLUMN "proposition_id" integer;--> statement-breakpoint
CREATE TABLE "agent_conversations" (
  "id" serial PRIMARY KEY NOT NULL,
  "uuid" uuid DEFAULT gen_random_uuid() NOT NULL,
  "project_id" integer NOT NULL,
  "portee" varchar(10) NOT NULL,
  "cible_id" integer,
  "profondeur" varchar(10) DEFAULT 'courte' NOT NULL,
  "etape" varchar(12) DEFAULT 'consigne' NOT NULL,
  "messages" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "consigne" text DEFAULT '' NOT NULL,
  "brief_pret" boolean DEFAULT false NOT NULL,
  "proposition_id" integer,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "agent_conversations_uuid_unique" UNIQUE("uuid")
);--> statement-breakpoint
CREATE TABLE "briefs" (
  "id" serial PRIMARY KEY NOT NULL,
  "project_id" integer NOT NULL,
  "statut" varchar(10) DEFAULT 'brouillon' NOT NULL,
  "source" varchar(12) DEFAULT 'conversation' NOT NULL,
  "contenu" jsonb NOT NULL,
  "statuts" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "version" integer DEFAULT 1 NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "briefs_project_id_unique" UNIQUE("project_id")
);--> statement-breakpoint
CREATE TABLE "propositions" (
  "id" serial PRIMARY KEY NOT NULL,
  "uuid" uuid DEFAULT gen_random_uuid() NOT NULL,
  "conversation_id" integer,
  "project_id" integer NOT NULL,
  "skill" varchar(40) NOT NULL,
  "portee" varchar(10) NOT NULL,
  "cible_id" integer,
  "statut" varchar(14) DEFAULT 'en_generation' NOT NULL,
  "run_id" integer,
  "parent_id" integer,
  "consigne" text DEFAULT '' NOT NULL,
  "retour" text,
  "resume" text DEFAULT '' NOT NULL,
  "contexte" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "erreur" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "applied_at" timestamp,
  CONSTRAINT "propositions_uuid_unique" UNIQUE("uuid")
);--> statement-breakpoint
CREATE TABLE "proposition_changements" (
  "id" serial PRIMARY KEY NOT NULL,
  "proposition_id" integer NOT NULL,
  "ordre" integer NOT NULL,
  "groupe" varchar(40) NOT NULL,
  "cle" varchar(60),
  "cible_type" varchar(12) NOT NULL,
  "cible_ref" varchar(100),
  "libelle" text NOT NULL,
  "operation" varchar(10) NOT NULL,
  "avant" jsonb,
  "apres" jsonb,
  "position" jsonb,
  "avertissements" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "ecrase" text,
  "coche" boolean DEFAULT false NOT NULL,
  "refuse_raison" text,
  "applique_at" timestamp
);--> statement-breakpoint
ALTER TABLE "agent_conversations" ADD CONSTRAINT "agent_conversations_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "briefs" ADD CONSTRAINT "briefs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "propositions" ADD CONSTRAINT "propositions_conversation_id_agent_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."agent_conversations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "propositions" ADD CONSTRAINT "propositions_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "propositions" ADD CONSTRAINT "propositions_run_id_agent_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."agent_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposition_changements" ADD CONSTRAINT "proposition_changements_proposition_id_propositions_id_fk" FOREIGN KEY ("proposition_id") REFERENCES "public"."propositions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "agent_conversations_cible_idx" ON "agent_conversations" ("project_id","portee",(coalesce("cible_id", 0)));--> statement-breakpoint
CREATE INDEX "propositions_projet_idx" ON "propositions" ("project_id","created_at");--> statement-breakpoint
CREATE INDEX "proposition_changements_prop_idx" ON "proposition_changements" ("proposition_id","ordre");
