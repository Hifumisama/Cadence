-- Génération audio des assets sfx (Stable Audio 3) : la durée est un paramètre de
-- la génération, séparé du prompt. Sur la génération (durée demandée) et sur
-- l'asset (durée du son retenu, posée à l'adoption, éditable sur la fiche).
-- Écrite à la main, sans enum pg ; `methode` (varchar) accepte déjà « audio ».
ALTER TABLE "asset_generations" ADD COLUMN "duree_secondes" real;--> statement-breakpoint
ALTER TABLE "assets" ADD COLUMN "duree_secondes" real;
