-- Casting vocal en quatre étapes (2026-09-30) : la règle absolue, la
-- température, la seed, les limites, le carnet de candidats et le test de
-- tenue disparaissent ; la fiche gagne la source de la voix (design | reference)
-- et le banc de test vidéo. Écrite à la main, sans enum pg.
ALTER TABLE "voix_fiches" DROP COLUMN "regle";--> statement-breakpoint
ALTER TABLE "voix_fiches" DROP COLUMN "temperature";--> statement-breakpoint
ALTER TABLE "voix_fiches" DROP COLUMN "seed";--> statement-breakpoint
ALTER TABLE "voix_fiches" DROP COLUMN "replique_tenue";--> statement-breakpoint
ALTER TABLE "voix_fiches" DROP COLUMN "limites";--> statement-breakpoint
ALTER TABLE "voix_fiches" RENAME COLUMN "t1_fichier" TO "test_video";--> statement-breakpoint
ALTER TABLE "voix_fiches" ADD COLUMN "source" varchar(12) DEFAULT 'design' NOT NULL;--> statement-breakpoint
ALTER TABLE "voix_fiches" ADD COLUMN "test_decor_id" integer;--> statement-breakpoint
ALTER TABLE "voix_fiches" ADD COLUMN "test_personnage_id" integer;--> statement-breakpoint
ALTER TABLE "voix_fiches" ADD COLUMN "test_texte" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "voix_fiches" ADD COLUMN "test_audio" varchar(255);--> statement-breakpoint
ALTER TABLE "voix_fiches" ADD CONSTRAINT "voix_fiches_test_decor_id_assets_id_fk" FOREIGN KEY ("test_decor_id") REFERENCES "public"."assets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voix_fiches" ADD CONSTRAINT "voix_fiches_test_personnage_id_assets_id_fk" FOREIGN KEY ("test_personnage_id") REFERENCES "public"."assets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
DROP TABLE "voix_tenue";--> statement-breakpoint
DROP TABLE "voix_candidats";
