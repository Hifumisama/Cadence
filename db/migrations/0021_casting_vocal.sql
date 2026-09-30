CREATE TABLE "voix_fiches" (
	"asset_id" integer PRIMARY KEY NOT NULL,
	"personnage_id" integer,
	"regle" text DEFAULT '' NOT NULL,
	"langue" varchar(40) DEFAULT 'French' NOT NULL,
	"temperature" real,
	"seed" text,
	"ref_text" text DEFAULT '' NOT NULL,
	"replique_tenue" text DEFAULT '' NOT NULL,
	"limites" text DEFAULT '' NOT NULL,
	"t1_fichier" varchar(255)
);
--> statement-breakpoint
CREATE TABLE "voix_candidats" (
	"id" serial PRIMARY KEY NOT NULL,
	"asset_id" integer NOT NULL,
	"libelle" varchar(100) NOT NULL,
	"instruction" text DEFAULT '' NOT NULL,
	"temperature" real,
	"seed" text,
	"fichier" varchar(255),
	"verdict" varchar(20) DEFAULT 'en_lice' NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "voix_tenue" (
	"id" serial PRIMARY KEY NOT NULL,
	"asset_id" integer NOT NULL,
	"direction" varchar(20) NOT NULL,
	"instruction" text DEFAULT '' NOT NULL,
	"fichier" varchar(255),
	"verdict" varchar(20) DEFAULT 'non_teste' NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	CONSTRAINT "voix_tenue_asset_id_direction_unique" UNIQUE("asset_id","direction")
);
--> statement-breakpoint
ALTER TABLE "voix_fiches" ADD CONSTRAINT "voix_fiches_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voix_fiches" ADD CONSTRAINT "voix_fiches_personnage_id_assets_id_fk" FOREIGN KEY ("personnage_id") REFERENCES "public"."assets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voix_candidats" ADD CONSTRAINT "voix_candidats_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voix_tenue" ADD CONSTRAINT "voix_tenue_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE cascade ON UPDATE no action;
