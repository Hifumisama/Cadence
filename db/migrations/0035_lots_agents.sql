ALTER TABLE "agent_runs" ADD COLUMN "cle_sous_tache" varchar(80);--> statement-breakpoint
ALTER TABLE "agent_runs" ADD COLUMN "libelle_sous_tache" varchar(200);--> statement-breakpoint
CREATE INDEX "agent_runs_proposition_idx" ON "agent_runs" ("proposition_id");--> statement-breakpoint
ALTER TABLE "propositions" ADD COLUMN "lot" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "proposition_changements" ADD COLUMN "sous_tache" varchar(80);--> statement-breakpoint
ALTER TABLE "proposition_changements" ADD COLUMN "sous_groupe" varchar(200);
