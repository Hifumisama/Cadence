-- Statuts de proposition simplifiés : « partielle » n'existe plus (appliquee), « rejetee » devient « annulee » (une relance remplace la précédente).
UPDATE "propositions" SET "statut" = 'appliquee' WHERE "statut" = 'partielle';
UPDATE "propositions" SET "statut" = 'annulee' WHERE "statut" = 'rejetee';
