CREATE TYPE "public"."asset_statut" AS ENUM('a_produire', 'en_cours', 'valide');--> statement-breakpoint
CREATE TYPE "public"."job_statut" AS ENUM('en_attente', 'en_cours', 'echoue', 'termine');--> statement-breakpoint
CREATE TYPE "public"."plan_statut" AS ENUM('en_attente', 'en_cours', 'echoue', 'rejoue', 'termine');--> statement-breakpoint
CREATE TYPE "public"."ref_type" AS ENUM('picture', 'video', 'audio');--> statement-breakpoint
CREATE TABLE "assets" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" varchar(100) NOT NULL,
	"type" varchar(30) NOT NULL,
	"statut" "asset_statut" DEFAULT 'a_produire' NOT NULL,
	"description" text,
	"fichier" varchar(255),
	"critique" boolean DEFAULT false NOT NULL,
	"derive_de_id" integer,
	CONSTRAINT "assets_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "jobs" (
	"id" serial PRIMARY KEY NOT NULL,
	"plan_id" integer NOT NULL,
	"statut" "job_statut" DEFAULT 'en_attente' NOT NULL,
	"tentative" integer DEFAULT 1 NOT NULL,
	"comfyui_prompt_id" varchar(100),
	"workflow_fichier" varchar(255) NOT NULL,
	"seed_utilisee" text,
	"chemin_sortie" varchar(500),
	"erreur" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"started_at" timestamp,
	"finished_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "mots_a_risque" (
	"id" serial PRIMARY KEY NOT NULL,
	"mot" varchar(100) NOT NULL,
	"note" text NOT NULL,
	"date_ajout" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "mots_a_risque_mot_unique" UNIQUE("mot")
);
--> statement-breakpoint
CREATE TABLE "parametres" (
	"cle" varchar(100) PRIMARY KEY NOT NULL,
	"valeur" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plan_dialogues" (
	"id" serial PRIMARY KEY NOT NULL,
	"plan_id" integer NOT NULL,
	"slot" integer NOT NULL,
	"locuteur" varchar(100) NOT NULL,
	"asset_voix_id" integer,
	"replique" text NOT NULL,
	"duree_secondes" integer
);
--> statement-breakpoint
CREATE TABLE "plan_prompt_sections" (
	"id" serial PRIMARY KEY NOT NULL,
	"plan_id" integer NOT NULL,
	"section" varchar(40) NOT NULL,
	"ordre" integer NOT NULL,
	"contenu" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plan_refs" (
	"id" serial PRIMARY KEY NOT NULL,
	"plan_id" integer NOT NULL,
	"type" "ref_type" NOT NULL,
	"slot" integer NOT NULL,
	"asset_id" integer,
	"role" text,
	"retention" varchar(30)
);
--> statement-breakpoint
CREATE TABLE "plans" (
	"id" serial PRIMARY KEY NOT NULL,
	"numero" integer NOT NULL,
	"numeros_source" integer[],
	"titre" varchar(255) NOT NULL,
	"acte" varchar(100),
	"duree_montage_secondes" integer NOT NULL,
	"duree_generation_secondes" integer NOT NULL,
	"fps" integer DEFAULT 24 NOT NULL,
	"mode" varchar(20) DEFAULT 'full-reference' NOT NULL,
	"timecode_musique" varchar(50),
	"statut" "plan_statut" DEFAULT 'en_attente' NOT NULL,
	"seed" text,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "plans_numero_unique" UNIQUE("numero")
);
--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_dialogues" ADD CONSTRAINT "plan_dialogues_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_dialogues" ADD CONSTRAINT "plan_dialogues_asset_voix_id_assets_id_fk" FOREIGN KEY ("asset_voix_id") REFERENCES "public"."assets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_prompt_sections" ADD CONSTRAINT "plan_prompt_sections_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_refs" ADD CONSTRAINT "plan_refs_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_refs" ADD CONSTRAINT "plan_refs_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE no action ON UPDATE no action;