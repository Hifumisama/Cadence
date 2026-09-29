-- FX -> VFX, autre -> OTH (nouveau type SFX : rien à migrer). Le préfixe de
-- code suit le type : FX_x -> VFX_x, x -> OTH_x. Les mentions textuelles de
-- l'ancien code dans les champs libres des plans sont réécrites aussi.
DO $$
DECLARE
  r RECORD;
  nouveau text;
BEGIN
  FOR r IN SELECT id, code, type FROM assets WHERE type IN ('fx', 'autre') LOOP
    IF r.type = 'fx' THEN
      nouveau := 'V' || r.code;
      IF r.code NOT LIKE 'FX\_%' THEN nouveau := 'VFX_' || r.code; END IF;
    ELSE
      nouveau := CASE WHEN r.code LIKE 'OTH\_%' THEN r.code ELSE 'OTH_' || r.code END;
    END IF;

    IF nouveau <> r.code THEN
      UPDATE plans SET
        assets_requis = regexp_replace(assets_requis, '\m' || r.code || '\M', nouveau, 'g'),
        son = regexp_replace(son, '\m' || r.code || '\M', nouveau, 'g'),
        notes = regexp_replace(notes, '\m' || r.code || '\M', nouveau, 'g')
      WHERE assets_requis ~ ('\m' || r.code || '\M')
         OR son ~ ('\m' || r.code || '\M')
         OR notes ~ ('\m' || r.code || '\M');
      UPDATE plan_prompt_sections
        SET contenu = regexp_replace(contenu, '\m' || r.code || '\M', nouveau, 'g')
        WHERE contenu ~ ('\m' || r.code || '\M');
      UPDATE plan_refs
        SET role = regexp_replace(role, '\m' || r.code || '\M', nouveau, 'g')
        WHERE role ~ ('\m' || r.code || '\M');
      UPDATE assets SET code = nouveau WHERE id = r.id;
    END IF;
  END LOOP;
END $$;--> statement-breakpoint
UPDATE assets SET type = 'vfx' WHERE type = 'fx';--> statement-breakpoint
UPDATE assets SET type = 'oth' WHERE type = 'autre';
