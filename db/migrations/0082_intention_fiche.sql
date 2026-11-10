-- Suivi de l'intention : le texte du plan (`description`) tel qu'il était quand la fiche a été écrite. Comparé par valeur à la description d'aujourd'hui,
-- il dit « la fiche est à régénérer ». NULL pour les fiches écrites avant ce suivi : on ne sait pas, rien n'est signalé.
ALTER TABLE "plans" ADD COLUMN IF NOT EXISTS "fiche_description" text;
