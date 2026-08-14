-- 0032: dois personagens novos na familia "Crias da casa", cri-6 e cri-7.
--
-- Mesma origem da 0029: arte do proprio dono, versionada em
-- arte-origem/personagens, reprocessada por scripts/processar-sprites.mjs. Os
-- dois ficaram de fora da 0029 por engano, nao por decisao.
--
-- O preco veio escrito no nome do arquivo entregue: Uminha a 2500, Melo Goat a
-- 1200, o mesmo dos cinco atletas. A unica trava de preco no banco e
-- avatar_items_custo_ouro_check, que exige custo_ouro >= 0.
--
-- O sprite_path e o caminho no disco, sem o carimbo `?v=` que so a URL do
-- catalogo carrega. Personagem que esta no catalogo e nao esta aqui aparece na
-- loja e nao compra, entao as duas listas saem juntas.

insert into avatar_items (id, nome, slot, custo_ouro, sprite_path, ativo) values
  ('cri-6', 'Thiago Uminha', 'personagem', 2500, '/sprites/personagens/cri-6-thiago-uminha.png', true),
  ('cri-7', 'Melo Goat', 'personagem', 1200, '/sprites/personagens/cri-7-melo-goat.png', true)
on conflict (id) do nothing;

-- O cri-5 subiu na 0029 com a arte errada, a versao azul que o dono havia
-- descartado. O id, o preco e o caminho no disco continuam os mesmos, entao a
-- posse de quem ja comprou fica intacta e nao ha nada a corrigir aqui: quem
-- muda e so o conteudo do PNG, e o carimbo `?v=` do catalogo e que leva a arte
-- nova ao aparelho de quem ja tinha a velha em cache.
