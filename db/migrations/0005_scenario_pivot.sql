CREATE TABLE "mouvements" (
	"id" serial PRIMARY KEY NOT NULL,
	"ordre" integer NOT NULL,
	"titre" varchar(255) NOT NULL,
	"plan_numero_debut" integer NOT NULL,
	"plan_numero_fin" integer NOT NULL,
	"fonction" text,
	"duree_approx_secondes" integer
);
--> statement-breakpoint
ALTER TABLE "plans" ALTER COLUMN "statut" SET DEFAULT 'brouillon';--> statement-breakpoint
ALTER TABLE "plans" ADD COLUMN "mouvement_id" integer;--> statement-breakpoint
ALTER TABLE "plans" ADD COLUMN "valeur" text;--> statement-breakpoint
ALTER TABLE "plans" ADD COLUMN "sujet" text;--> statement-breakpoint
ALTER TABLE "plans" ADD COLUMN "decor" text;--> statement-breakpoint
ALTER TABLE "plans" ADD COLUMN "lumiere" text;--> statement-breakpoint
ALTER TABLE "plans" ADD COLUMN "mouvement_camera" text;--> statement-breakpoint
ALTER TABLE "plans" ADD COLUMN "son" text;--> statement-breakpoint
ALTER TABLE "plans" ADD COLUMN "intention" text;--> statement-breakpoint
ALTER TABLE "plans" ADD COLUMN "assets_requis" text;--> statement-breakpoint
ALTER TABLE "plans" ADD CONSTRAINT "plans_mouvement_id_mouvements_id_fk" FOREIGN KEY ("mouvement_id") REFERENCES "public"."mouvements"("id") ON DELETE no action ON UPDATE no action;
