-- 0040 A Academia nao cobra vida por um dia da regra que acabou de sair.
--
-- A 0039 trocou "dias uteis" por "5 vezes por semana". A ocorrencia de sexta,
-- 14/08, continuava pendente para quatro contas, e o `marcar_atrasadas` desta
-- noite cobraria 5 de vida de cada uma por ter faltado num dia que a regra nova
-- nao obriga mais. Cobrar pela regra que acabou de ser revogada e o tipo de
-- coisa que ninguem consegue explicar depois.
--
-- So sai o que nunca foi tocado e ainda esta pendente. A de 13/08 ja virou
-- `atrasado` e ja cobrou: aquilo e historico, e historico nao se reescreve.

delete from occurrences
 where habit_id = '4bd75dfb-6a0e-47e7-9164-e3d31f50d97d'
   and status = 'pendente'
   and vezes_feitas = 0
   and ouro_creditado = 0
   and data_sp < public.hoje_sp();
