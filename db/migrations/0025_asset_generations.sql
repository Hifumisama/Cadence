-- Générations d'images d'un asset (candidats, adoptés à la main). Écrite à la
-- main, sans enum pg.
CREATE TABLE "asset_generations" (
	"id" serial PRIMARY KEY NOT NULL,
	"uuid" uuid DEFAULT gen_random_uuid() NOT NULL,
	"asset_id" integer NOT NULL,
	"methode" varchar(12) DEFAULT 'generation' NOT NULL,
	"statut" varchar(12) DEFAULT 'en_attente' NOT NULL,
	"prompt" text NOT NULL,
	"clause_style" text DEFAULT '' NOT NULL,
	"aspect" varchar(8) DEFAULT '1:1' NOT NULL,
	"megapixels" real DEFAULT 1 NOT NULL,
	"lora_personnage" boolean DEFAULT false NOT NULL,
	"seed" text NOT NULL,
	"comfyui_prompt_id" varchar(100),
	"fichier" varchar(255),
	"erreur" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"started_at" timestamp,
	"finished_at" timestamp,
	CONSTRAINT "asset_generations_uuid_unique" UNIQUE("uuid")
);
--> statement-breakpoint
ALTER TABLE "asset_generations" ADD CONSTRAINT "asset_generations_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "asset_generations_asset_idx" ON "asset_generations" USING btree ("asset_id");
