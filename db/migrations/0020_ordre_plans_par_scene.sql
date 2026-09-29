UPDATE "plans" p SET "ordre" = r.rang FROM (
  SELECT pl.id, (row_number() OVER (
    PARTITION BY pl.episode_id
    ORDER BY (s.ordre IS NULL), s.ordre, pl.ordre, pl.id
  ) - 1) AS rang
  FROM "plans" pl LEFT JOIN "scenes" s ON s.id = pl.scene_id
) r WHERE p.id = r.id;
