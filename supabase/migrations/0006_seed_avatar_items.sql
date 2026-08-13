-- 0006_seed_avatar_items
-- Catalogo da loja. Os ids precisam bater com ITENS em src/lib/sprites.ts.
-- sprite_path guarda o id do sprite, nao um arquivo: a arte vive no codigo,
-- desenhada em matriz de pixels. Trocar para PNG depois so muda o Avatar.

insert into public.avatar_items (id, nome, slot, custo_ouro, sprite_path) values
  ('item-01', 'Chapéu de palha',  'acessorio',  40, 'item-01'),
  ('item-02', 'Coroa',            'acessorio', 300, 'item-02'),
  ('item-03', 'Bandana',          'acessorio',  60, 'item-03'),
  ('item-04', 'Boné',             'acessorio',  60, 'item-04'),
  ('item-05', 'Óculos escuros',   'acessorio',  80, 'item-05'),
  ('item-06', 'Cachecol',         'acessorio',  90, 'item-06'),
  ('item-07', 'Ombreiras',        'acessorio', 150, 'item-07'),
  ('item-08', 'Auréola',          'acessorio', 250, 'item-08'),
  ('item-09', 'Chifres',          'acessorio', 180, 'item-09'),
  ('item-10', 'Fone de ouvido',   'acessorio', 120, 'item-10'),
  ('item-11', 'Faixa da cabeça',  'acessorio',  50, 'item-11'),
  ('item-12', 'Elmo',             'acessorio', 220, 'item-12')
on conflict (id) do update
  set nome = excluded.nome,
      custo_ouro = excluded.custo_ouro,
      sprite_path = excluded.sprite_path;
