-- 0029: cinco personagens novos na loja, familia "Crias da casa" (prefixo cri).
--
-- Arte feita pelo proprio dono, e nao gerada no Gemini como as 57 pecas
-- anteriores. Os originais moram em arte-origem/personagens dentro do repo, e
-- nao mais numa pasta de Downloads, justamente para continuarem reprocessaveis:
-- as pastas que geraram os 36 primeiros personagens ja nao existem, e por isso
-- nenhum deles pode ser refeito hoje.
--
-- Personagem que esta no catalogo e nao esta aqui aparece na loja e nao compra,
-- entao as duas listas tem que sair juntas. Os ids sao os mesmos de
-- src/lib/catalogo.ts, e o sprite_path e o caminho no disco, sem o carimbo
-- `?v=` que so a URL do catalogo carrega.
--
-- O preco nao foi escolhido aqui: veio escrito no nome do arquivo que o dono
-- entregou. Quatro a 1500 e o TH a 2500. A unica trava de preco no banco e
-- avatar_items_custo_ouro_check, que exige apenas custo_ouro >= 0, entao 2500
-- entra sem afrouxar regra nenhuma. Ele fica no insert separado abaixo para
-- poder ser removido sozinho, se o dono decidir manter o teto antigo de 1500.

insert into avatar_items (id, nome, slot, custo_ouro, sprite_path, ativo) values
  ('cri-1', 'Lulu do dia a dia', 'personagem', 1500, '/sprites/personagens/cri-1-lulu-do-dia-a-dia.png', true),
  ('cri-2', 'Nata gameplay',     'personagem', 1500, '/sprites/personagens/cri-2-nata-gameplay.png',     true),
  ('cri-3', 'Goiabeira',         'personagem', 1500, '/sprites/personagens/cri-3-goiabeira.png',         true),
  ('cri-4', 'Gustavo Pai',       'personagem', 1500, '/sprites/personagens/cri-4-gustavo-pai.png',       true)
on conflict (id) do nothing;

-- Unico acima de 1500 em todo o catalogo. Separado de proposito.
insert into avatar_items (id, nome, slot, custo_ouro, sprite_path, ativo) values
  ('cri-5', 'TH Dictador', 'personagem', 2500, '/sprites/personagens/cri-5-th-dictador.png', true)
on conflict (id) do nothing;
