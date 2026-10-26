ALTER TABLE "projects" ADD COLUMN "fiches_auto" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "projects" ALTER COLUMN "fiches_auto" SET DEFAULT true;--> statement-breakpoint
ALTER TABLE "propositions" ADD COLUMN "origine" varchar(40);
