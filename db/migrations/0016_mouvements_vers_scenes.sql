ALTER TABLE "mouvements" RENAME TO "scenes";--> statement-breakpoint
ALTER SEQUENCE "mouvements_id_seq" RENAME TO "scenes_id_seq";--> statement-breakpoint
ALTER INDEX "mouvements_pkey" RENAME TO "scenes_pkey";--> statement-breakpoint
ALTER TABLE "scenes" RENAME CONSTRAINT "mouvements_episode_id_episodes_id_fk" TO "scenes_episode_id_episodes_id_fk";--> statement-breakpoint
ALTER TABLE "plans" RENAME COLUMN "mouvement_id" TO "scene_id";--> statement-breakpoint
ALTER TABLE "plans" RENAME CONSTRAINT "plans_mouvement_id_mouvements_id_fk" TO "plans_scene_id_scenes_id_fk";--> statement-breakpoint
ALTER TABLE "scenes" DROP COLUMN "plan_numero_debut";--> statement-breakpoint
ALTER TABLE "scenes" DROP COLUMN "plan_numero_fin";--> statement-breakpoint
ALTER TABLE "scenes" DROP COLUMN "duree_approx_secondes";
