-- Les répliques ne vivent que dans le prompt vidéo (décision du 2026-10-14, étape 2) : plus d'entité « réplique » ni de liaison au plan.
-- Base de test : les tables disparaissent. Seule précaution : une réplique liée à un plan dont la description (l'intention) ne la dit pas
-- encore y est ajoutée (« Locuteur : « texte » »), pour que le dialogue du scénario ne se perde pas. Idempotente (IF EXISTS).

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'plan_dialogues')
     AND EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'repliques') THEN
    UPDATE "plans" p
       SET "description" = btrim(coalesce(p."description", '') || E'\n' || d."lignes")
      FROM (
        SELECT pd."plan_id" AS plan_id,
               string_agg(
                 coalesce(nullif(r."locuteur_texte", ''), regexp_replace(a."code", '^[A-Z]+_', '')) || ' : « ' || r."texte" || ' »',
                 E'\n' ORDER BY pd."slot"
               ) AS lignes
          FROM "plan_dialogues" pd
          JOIN "repliques" r ON r."id" = pd."replique_id"
          LEFT JOIN "assets" a ON a."id" = r."locuteur_id"
         WHERE position(r."texte" in coalesce((SELECT pl."description" FROM "plans" pl WHERE pl."id" = pd."plan_id"), '')) = 0
         GROUP BY pd."plan_id"
      ) d
     WHERE p."id" = d."plan_id";
  END IF;
END $$;--> statement-breakpoint

DROP TABLE IF EXISTS "plan_dialogues";--> statement-breakpoint
DROP TABLE IF EXISTS "repliques";
