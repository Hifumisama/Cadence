-- « coche » (case cochée à la relecture) n'est plus une case : c'est le choix d'application par défaut d'un changement (créations oui, écrasements et suppressions non).
ALTER TABLE "proposition_changements" RENAME COLUMN "coche" TO "par_defaut";
