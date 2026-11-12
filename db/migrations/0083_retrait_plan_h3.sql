-- Retrait du moteur plan-h3 : tout ce qui lui est lié et encore ouvert devient périmé (rien n'est supprimé, l'historique reste lisible).
-- Les tâches en file ou en cours sont annulées ; les propositions non appliquées (y compris celles d'un lot dont une sous-tâche est plan-h3) sont rejetées ;
-- les demandes de fiche qui attendaient un tour plan-h3 sont annulées.
UPDATE "agent_runs"
   SET "statut" = 'annulee', "erreur" = 'Moteur plan-h3 retiré : tâche périmée.', "finished_at" = now()
 WHERE "skill" = 'plan-h3' AND "statut" IN ('en_attente', 'en_cours');

UPDATE "propositions"
   SET "statut" = 'rejetee', "erreur" = 'Moteur plan-h3 retiré : proposition périmée.'
 WHERE "statut" IN ('en_generation', 'prete')
   AND ("skill" = 'plan-h3'
        OR "id" IN (SELECT "proposition_id" FROM "agent_runs" WHERE "skill" = 'plan-h3' AND "proposition_id" IS NOT NULL));

UPDATE "demandes"
   SET "statut" = 'annulee', "erreur" = 'Moteur plan-h3 retiré : demande périmée.', "finished_at" = now(), "updated_at" = now()
 WHERE "type" = 'fiche-plan' AND "statut" = 'en_cours'
   AND (NOT ("contexte" ? 'moteur') OR "contexte"->>'moteur' = 'plan-h3');
