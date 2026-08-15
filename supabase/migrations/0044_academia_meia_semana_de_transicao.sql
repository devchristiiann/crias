-- 0044 A Academia ganha uma meia semana de transicao.
--
-- A 0039 mudou a regra num sabado. A janela desta semana (10 a 16/08) nunca
-- nasceu, porque o gerador ancora na segunda e o ramo de resgate exige que ainda
-- caibam os 5 dias da meta. Resultado pratico: quem treinar neste fim de semana
-- nao tem onde marcar, e a promessa da mudanca era justamente essa, que sabado
-- passa a contar.
--
-- A linha abaixo abre o resto desta semana com meta 1: treinou uma vez no fim de
-- semana, a semana conta. Nao e a regra permanente, e uma ponte de dois dias, e
-- por isso ela e escrita a mao aqui em vez de sair do gerador. A partir de
-- segunda a janela cheia de 17 a 23/08 assume, e ela ja existe.

insert into occurrences (
  habit_id, user_id, data_sp, inicio_janela, vence_em, proximo_toque_em, vezes_alvo
)
select
  h.id,
  gm.user_id,
  public.hoje_sp() + 1,
  public.hoje_sp(),
  ((public.hoje_sp() + 1 + time '23:59') at time zone 'America/Sao_Paulo'),
  null,
  1::smallint
from habits h
join group_members gm on gm.group_id = h.group_id
where h.id = '4bd75dfb-6a0e-47e7-9164-e3d31f50d97d'
on conflict (habit_id, user_id, data_sp) do nothing;
