-- Révision F03 (2026-09-28, voir docs/FRICTIONS.md) : la continuité du
-- numéro de plan redevient locale à l'épisode plutôt qu'au projet — un
-- numéro élevé dans un épisode récent laissait sinon penser à tort qu'on
-- était loin dans la série. Aucune donnée à migrer : un seul épisode
-- existe à ce jour, la contrainte change de portée sans collision possible.
ALTER TABLE "plans" DROP CONSTRAINT "plans_project_id_numero_unique";
--> statement-breakpoint
ALTER TABLE "plans" ADD CONSTRAINT "plans_episode_id_numero_unique" UNIQUE("episode_id","numero");
