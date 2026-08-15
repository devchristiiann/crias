-- 0042 O indice do feed acompanha o criterio novo do feed.
--
-- O feed deixou de ter lista branca de status: o que aparece la e o que tem
-- `feito_em`, e mais nada. A rotina de janela fica `pendente` a semana inteira e
-- mesmo assim publica a cada marcacao. O indice parcial da 0037 ainda estava
-- preso em `status in ('feito','em_validacao')`, entao ele parou de cobrir a
-- consulta e a tela mais quente do app voltou para varredura sequencial mais
-- ordenacao. Mesmo erro do item 5 da 0037, pela porta de outro predicado.

drop index if exists idx_occ_feed;
create index idx_occ_feed on occurrences (habit_id, feito_em desc)
  where feito_em is not null;
