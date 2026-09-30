-- Méthode de fabrication d'un asset (génération | édition). Écrite à la main,
-- sans enum pg.
ALTER TABLE "assets" ADD COLUMN "methode_generation" varchar(12);
