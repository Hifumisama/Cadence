-- Créativité et style de caméra d'Open H3 IR, hérités projet -> scène -> plan (null = hérite ; style « aucun » = force l'absence de style). Voir lib/h3ir/reglages.ts.
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "creativite" varchar(12);--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "style_camera" varchar(20);--> statement-breakpoint
ALTER TABLE "scenes" ADD COLUMN IF NOT EXISTS "creativite" varchar(12);--> statement-breakpoint
ALTER TABLE "scenes" ADD COLUMN IF NOT EXISTS "style_camera" varchar(20);--> statement-breakpoint
ALTER TABLE "plans" ADD COLUMN IF NOT EXISTS "creativite" varchar(12);--> statement-breakpoint
ALTER TABLE "plans" ADD COLUMN IF NOT EXISTS "style_camera" varchar(20);
