ALTER TABLE "plans" ADD COLUMN "description" text;--> statement-breakpoint
ALTER TABLE "plans" ADD COLUMN "sortie" text;--> statement-breakpoint
ALTER TABLE "plans" ADD COLUMN "raccord" text;--> statement-breakpoint
UPDATE "plans" SET "description" = NULLIF(concat_ws(E'\n\n', NULLIF("sujet", ''), NULLIF("intention", '')), '');--> statement-breakpoint
ALTER TABLE "plans" DROP COLUMN "valeur";--> statement-breakpoint
ALTER TABLE "plans" DROP COLUMN "sujet";--> statement-breakpoint
ALTER TABLE "plans" DROP COLUMN "decor";--> statement-breakpoint
ALTER TABLE "plans" DROP COLUMN "lumiere";--> statement-breakpoint
ALTER TABLE "plans" DROP COLUMN "mouvement_camera";--> statement-breakpoint
ALTER TABLE "plans" DROP COLUMN "son";--> statement-breakpoint
ALTER TABLE "plans" DROP COLUMN "intention";--> statement-breakpoint
ALTER TABLE "plans" DROP COLUMN "assets_requis";
