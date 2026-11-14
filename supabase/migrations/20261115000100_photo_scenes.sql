-- Фото-сцены для AURA Shop: настоящие снимки вместо баннера (картинки лежат в public/scenes)
insert into public.shop_items (id, kind, name, price, min_tier, sort) values
  ('s-ph-paris',   'scene', 'Крыши Парижа',     400, 1, 10),
  ('s-ph-eiffel',  'scene', 'Ночной Париж',     400, 1, 11),
  ('s-ph-alps',    'scene', 'Альпы',            300, 1, 12),
  ('s-ph-lake',    'scene', 'Горное озеро',     300, 1, 13),
  ('s-ph-gallery', 'scene', 'Галерея',          500, 2, 14),
  ('s-ph-nyc',     'scene', 'Манхэттен',        500, 2, 15),
  ('s-ph-glass',   'scene', 'Стеклянные башни', 500, 2, 16),
  ('s-ph-wallst',  'scene', 'Уолл-стрит',       600, 2, 17)
on conflict (id) do update set kind = excluded.kind, name = excluded.name, price = excluded.price, min_tier = excluded.min_tier, sort = excluded.sort;
