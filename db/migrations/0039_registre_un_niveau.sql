-- Registre d'assets à UN SEUL niveau (2026-10-03) : un asset est un master, ou un dérivé d'un master. Les
-- chaînes existantes (dérivé de dérivé) sont remontées au master. Borné à 10 passes : des données en boucle
-- ne bloquent pas la migration. Idempotente (sans chaîne, rien ne change).
DO $$
BEGIN
  FOR i IN 1..10 LOOP
    UPDATE "assets" a SET "derive_de_id" = p."derive_de_id"
    FROM "assets" p
    WHERE a."derive_de_id" = p."id" AND p."derive_de_id" IS NOT NULL AND p."id" <> a."id";
    EXIT WHEN NOT FOUND;
  END LOOP;
END $$;
