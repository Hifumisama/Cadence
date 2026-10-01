-- Génération d'images « à partir d'images » (édition Qwen, 1 à 3 sources) :
-- réglage Lightning/Qualité et table des sources. Écrite à la main, sans enum pg.
ALTER TABLE "asset_generations" ADD COLUMN "lightning" boolean;--> statement-breakpoint
CREATE TABLE "asset_generation_sources" (
	"id" serial PRIMARY KEY NOT NULL,
	"generation_id" integer NOT NULL,
	"position" integer NOT NULL,
	"origine" varchar(8) NOT NULL,
	"asset_id" integer,
	"fichier" varchar(255) NOT NULL,
	CONSTRAINT "asset_generation_sources_position_unique" UNIQUE("generation_id","position")
);
--> statement-breakpoint
ALTER TABLE "asset_generation_sources" ADD CONSTRAINT "asset_generation_sources_generation_id_asset_generations_id_fk" FOREIGN KEY ("generation_id") REFERENCES "public"."asset_generations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_generation_sources" ADD CONSTRAINT "asset_generation_sources_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE set null ON UPDATE no action;
