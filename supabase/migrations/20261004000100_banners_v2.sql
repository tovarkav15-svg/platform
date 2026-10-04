-- Нижние баннеры: убираем похожие (у купивших остаются), добавляем 14 новых разных
update public.shop_items set hidden = true
where id in ('b-sunset', 'b-aurora', 'b-holo', 'b-stars', 'b-bubbles', 'b-gold', 'b-snow');

insert into public.shop_items (id, kind, name, price, min_tier, sort, hidden) values
  ('b-equalizer', 'banner', 'Эквалайзер',          200, 0, 20, false),
  ('b-heartbeat', 'banner', 'Кардиограмма',        220, 1, 21, false),
  ('b-terminal',  'banner', 'Терминал',            250, 1, 22, false),
  ('b-planes',    'banner', 'Бумажные самолётики', 300, 2, 23, false),
  ('b-iso',       'banner', 'Изометрия',           350, 3, 24, false),
  ('b-kinetic',   'banner', 'Бегущая строка',      400, 3, 25, false),
  ('b-city',      'banner', 'Ночной город',        450, 4, 26, false),
  ('b-neon',      'banner', 'Неоновые линии',      500, 4, 27, false),
  ('b-vinyl',     'banner', 'Винил',               550, 4, 28, false),
  ('b-koi',       'banner', 'Пруд с карпами',      600, 5, 29, false),
  ('b-lava',      'banner', 'Лавовая лампа',       650, 5, 30, false),
  ('b-glitch',    'banner', 'Глитч',               700, 6, 31, false),
  ('b-fireworks', 'banner', 'Салют',               800, 6, 32, false),
  ('b-planets',   'banner', 'Солнечная система',  1100, 8, 33, false)
on conflict (id) do update set name = excluded.name, price = excluded.price, min_tier = excluded.min_tier, sort = excluded.sort, hidden = false;
