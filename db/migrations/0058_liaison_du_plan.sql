-- Liaison d'un plan avec le précédent (2026-10-14) : additive, idempotente.
-- plans.liaison : « suite » (le plan reprend là où le précédent finit) ou « coupe » (rupture franche). « suite » par défaut : c'est le comportement
-- d'avant (le dernier shot du plan précédent était toujours donné aux agents). Le scénario la pose pour chaque plan ; l'utilisateur la change à la main.
ALTER TABLE "plans" ADD COLUMN IF NOT EXISTS "liaison" varchar(10) DEFAULT 'suite' NOT NULL;
