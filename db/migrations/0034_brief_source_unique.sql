-- Le BRIEF devient la source unique de la clause de style et des notes du projet (2026-10-02) :
-- les « globaux du scénario » (projects.clause_style / projects.notes) n'en sont plus que des copies.
-- Idempotente : on ne remplit que ce qui est vide, un brief déjà rempli gagne, rien n'est perdu.

-- 1. Un projet SANS brief mais avec une clause ou des notes reçoit un brief PARTIEL (posé à la main).
INSERT INTO "briefs" ("project_id", "statut", "source", "contenu", "statuts")
SELECT
  p."id",
  'partiel',
  'reconstitue',
  jsonb_build_object(
    'titre', COALESCE(NULLIF(trim(p."nom"), ''), 'Projet'),
    'source', 'reconstitue',
    'arc', '',
    'style', jsonb_build_object('nom', '', 'clause', trim(p."clause_style")),
    'langueDialogues', '',
    'episodes', '[]'::jsonb,
    'personnages', '[]'::jsonb,
    'lieux', '[]'::jsonb,
    'continuite', '[]'::jsonb,
    'rimes', '[]'::jsonb,
    'progressions', '[]'::jsonb,
    'pieges', '[]'::jsonb,
    'inventions', '[]'::jsonb,
    'questionsOuvertes', '[]'::jsonb,
    'notes', trim(p."notes")
  ),
  jsonb_strip_nulls(jsonb_build_object(
    'style', CASE WHEN trim(p."clause_style") <> '' THEN 'fourni' END,
    'notes', CASE WHEN trim(p."notes") <> '' THEN 'fourni' END
  ))
FROM "projects" p
WHERE NOT EXISTS (SELECT 1 FROM "briefs" b WHERE b."project_id" = p."id")
  AND (trim(p."clause_style") <> '' OR trim(p."notes") <> '');--> statement-breakpoint

-- 2. Un brief existant dont la clause est vide la reprend du projet (sans écraser une clause déjà là).
UPDATE "briefs" b
SET
  "contenu" = jsonb_set(
    b."contenu",
    '{style}',
    jsonb_build_object('nom', COALESCE(b."contenu"->'style'->>'nom', ''), 'clause', trim(p."clause_style"))
  ),
  "statuts" = b."statuts" || jsonb_build_object('style', 'fourni'),
  "version" = b."version" + 1,
  "updated_at" = now()
FROM "projects" p
WHERE p."id" = b."project_id"
  AND trim(p."clause_style") <> ''
  AND trim(COALESCE(b."contenu"->'style'->>'clause', '')) = '';--> statement-breakpoint

-- 3. Idem pour les notes.
UPDATE "briefs" b
SET
  "contenu" = jsonb_set(b."contenu", '{notes}', to_jsonb(trim(p."notes"))),
  "statuts" = b."statuts" || jsonb_build_object('notes', 'fourni'),
  "version" = b."version" + 1,
  "updated_at" = now()
FROM "projects" p
WHERE p."id" = b."project_id"
  AND trim(p."notes") <> ''
  AND trim(COALESCE(b."contenu"->>'notes', '')) = '';--> statement-breakpoint

-- 4. Les copies du projet suivent le brief (valide ou partiel : la référence ; un brouillon ne synchronise rien).
UPDATE "projects" p
SET
  "clause_style" = trim(COALESCE(b."contenu"->'style'->>'clause', '')),
  "notes" = trim(COALESCE(b."contenu"->>'notes', ''))
FROM "briefs" b
WHERE b."project_id" = p."id"
  AND b."statut" IN ('valide', 'partiel')
  AND (
    p."clause_style" IS DISTINCT FROM trim(COALESCE(b."contenu"->'style'->>'clause', ''))
    OR p."notes" IS DISTINCT FROM trim(COALESCE(b."contenu"->>'notes', ''))
  );
