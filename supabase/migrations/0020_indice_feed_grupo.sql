-- 0020_indice_feed_grupo
--
-- O feed do grupo pagina por cursor: `habit_id in (...) and status = 'feito'
-- and feito_em < cursor order by feito_em desc limit 8`. Sem indice nesse
-- caminho, o Postgres le todas as ocorrencias dos desafios do grupo e ordena
-- para devolver oito linhas, e o custo cresce com o historico inteiro.
--
-- Com (habit_id, feito_em desc) ele percorre um indice por desafio e junta os
-- topos, sem ordenacao. O `where status = 'feito'` deixa o indice pequeno: so
-- o que ja foi concluido entra nele, e e exatamente o que o feed pede.

create index if not exists idx_occ_feed
  on public.occurrences (habit_id, feito_em desc)
  where status = 'feito';
