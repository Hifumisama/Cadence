-- Open H3 IR simplifié (ADR 0001, 2026-11-24, banc à l'aveugle) : plus de style de mise en scène, plus de créativité de projet ni de scène.
-- Un plan ne garde que « extreme » (= temps fort) ; « restrained » et « bold » deviennent « balanced ».
-- Un plan qui héritait d'une créativité de projet ou de scène (y compris « extreme ») repasse donc en « balanced » : la colonne d'héritage disparaît.
UPDATE "plans" SET "creativite" = 'balanced' WHERE "creativite" IN ('restrained', 'bold');
--> statement-breakpoint
ALTER TABLE "plans" DROP COLUMN IF EXISTS "style_camera";
--> statement-breakpoint
ALTER TABLE "scenes" DROP COLUMN IF EXISTS "creativite";
--> statement-breakpoint
ALTER TABLE "scenes" DROP COLUMN IF EXISTS "style_camera";
--> statement-breakpoint
ALTER TABLE "projects" DROP COLUMN IF EXISTS "creativite";
--> statement-breakpoint
ALTER TABLE "projects" DROP COLUMN IF EXISTS "style_camera";
