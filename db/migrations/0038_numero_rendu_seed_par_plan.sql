-- Numéro de rendu, ce qui a été soumis, et une seed par plan (test général 2026-10-03, point K).
-- `tentative` ne compte que les rejeux automatiques d'un même rendu ; l'historique affichait « tentative 1 »
-- pour toutes les relances. `numero_rendu` est le vrai numéro (1, 2, 3… par plan). `prompt_utilise` et
-- `duree_utilisee` gardent ce que le worker a soumis (comparer deux rendus). Idempotente.
ALTER TABLE "jobs" ADD COLUMN IF NOT EXISTS "numero_rendu" integer NOT NULL DEFAULT 1;
ALTER TABLE "jobs" ADD COLUMN IF NOT EXISTS "prompt_utilise" text;
ALTER TABLE "jobs" ADD COLUMN IF NOT EXISTS "duree_utilisee" integer;
UPDATE "jobs" j SET "numero_rendu" = r.n
FROM (SELECT id, row_number() OVER (PARTITION BY plan_id ORDER BY created_at, id) AS n FROM "jobs") r
WHERE j.id = r.id;
-- Aucune seed n'était jamais posée sur un plan : tous les plans partageaient la seed du fichier de workflow.
-- Désormais chaque plan a la sienne, tirée à la création (déterministe ensuite : F04).
ALTER TABLE "plans" ALTER COLUMN "seed" SET DEFAULT floor(random() * 1000000000000000)::bigint::text;
UPDATE "plans" SET "seed" = floor(random() * 1000000000000000)::bigint::text WHERE "seed" IS NULL;
