-- Le traitement d'une scène (étape E de la création) : intention, état d'entrée et de sortie, durée visée, moments de l'auteur.
-- Écrit par le skill `traitement-episode`, lu par `scenario-scene` ; null pour une scène née autrement.
ALTER TABLE "scenes" ADD COLUMN "traitement" jsonb;
