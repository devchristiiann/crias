-- 0021_ranking_por_ouro
--
-- O ranking de grupo passa a ser pelo OURO GANHO NOS DESAFIOS DAQUELE GRUPO,
-- com a ofensiva como desempate.
--
-- Por que trocar: a ofensiva conta quantos desafios a pessoa tem, nao o quanto
-- eles custam. Quem esta em quatro desafios faceis passa na frente de quem esta
-- em um dificil, e no grupo real de hoje os tres membros estao empatados em 1,
-- com a ordem decidida pelo alfabeto. O ouro ja carrega as tres coisas juntas:
-- quantidade de check-in, dificuldade escolhida por desafio e constancia, que e
-- o multiplicador da ofensiva sobre o pagamento.
--
-- Por que `occurrences.ouro_creditado` e nao `profiles.ouro`: a carteira cai
-- quando a pessoa compra na loja, entao o ranking puniria jogar o jogo, e ainda
-- misturaria habito individual e premio de bau, que nao tem nada a ver com o
-- grupo. O `ouro_creditado` guarda so o pagamento do check-in, sem o ouro do
-- bau: sorte nao entra no ranking.
--
-- Duas janelas, de proposito: o mes corrente e a disputa viva, onde quem chegou
-- ontem ainda pode ganhar, e o acumulado e a memoria do grupo. Sem a janela do
-- mes, quem entrou primeiro fica na frente para sempre e membro novo nasce
-- perdendo.
--
-- Precisa ser RPC porque `ouro_creditado` nao tem select para `authenticated`
-- (0019): a contabilidade de cada check-in continua invisivel, e o cliente so
-- recebe o agregado por membro.

-- Primeiro dia do mes corrente, em Sao Paulo. Fronteira de mes nunca sai do
-- fuso do servidor: um check-in feito 22h do dia 31 e do mes que acabou.
create or replace function public.inicio_do_mes_sp()
returns date language sql stable as $$
  select date_trunc('month', (now() at time zone 'America/Sao_Paulo'))::date
$$;

-- Ordem unica do ranking, repetida nas duas funcoes abaixo:
--   ouro do mes desc, ofensiva total desc, nome.
-- Duas telas com criterios diferentes poriam a mesma pessoa em posicoes
-- diferentes na lista e no detalhe.
create or replace function public.ranking_grupo(p_grupo uuid)
returns json
language sql
security definer
stable
set search_path = public
as $$
  select coalesce(
    json_agg(
      json_build_object(
        'user_id', t.user_id,
        'ouro_mes', t.ouro_mes,
        'ouro_total', t.ouro_total,
        'streak_total', t.streak_total,
        'concluidos_hoje', t.concluidos_hoje
      )
      order by t.ouro_mes desc, t.streak_total desc, t.nome
    ),
    '[]'::json
  )
  from (
    select
      m.user_id,
      p.nome,
      coalesce(sum(o.ouro_creditado) filter (
        where o.data_sp >= public.inicio_do_mes_sp()
      ), 0)::int as ouro_mes,
      coalesce(sum(o.ouro_creditado), 0)::int as ouro_total,
      (
        select coalesce(sum(s.atual), 0)::int
          from streaks s
          join habits h on h.id = s.habit_id
         where h.group_id = p_grupo and s.user_id = m.user_id
      ) as streak_total,
      count(o.id) filter (
        where o.data_sp = (now() at time zone 'America/Sao_Paulo')::date
      )::int as concluidos_hoje
    from group_members m
    join profiles p on p.id = m.user_id
    left join habits h on h.group_id = p_grupo
    left join occurrences o
      on o.habit_id = h.id and o.user_id = m.user_id and o.status = 'feito'
    where m.group_id = p_grupo
    group by m.user_id, p.nome
  ) t
  -- Grupo inexistente e grupo de terceiro respondem a mesma lista vazia:
  -- mensagem diferente deixa descobrir quais grupos existem.
  where public.e_membro(p_grupo)
$$;

revoke execute on function public.ranking_grupo(uuid) from public, anon, authenticated;
grant execute on function public.ranking_grupo(uuid) to authenticated;

-- Posicao do proprio usuario em cada grupo dele, para o card da lista. Uma
-- chamada para todos os grupos: antes a lista trazia habito e ofensiva de todo
-- mundo embutidos so para calcular isso no navegador, e o volume crescia com
-- grupos vezes desafios vezes membros.
create or replace function public.posicoes_grupos()
returns json
language sql
security definer
stable
set search_path = public
as $$
  with meus as (
    select group_id from group_members where user_id = auth.uid()
  ),
  pontos as (
    select
      gm.group_id,
      gm.user_id,
      p.nome,
      coalesce((
        select sum(o.ouro_creditado)
          from occurrences o
          join habits h on h.id = o.habit_id
         where h.group_id = gm.group_id
           and o.user_id = gm.user_id
           and o.status = 'feito'
           and o.data_sp >= public.inicio_do_mes_sp()
      ), 0)::int as ouro_mes,
      coalesce((
        select sum(s.atual)
          from streaks s
          join habits h on h.id = s.habit_id
         where h.group_id = gm.group_id and s.user_id = gm.user_id
      ), 0)::int as streak_total
    from group_members gm
    join profiles p on p.id = gm.user_id
    where gm.group_id in (select group_id from meus)
  ),
  ordenado as (
    select
      group_id,
      user_id,
      row_number() over (
        partition by group_id
        order by ouro_mes desc, streak_total desc, nome
      ) as posicao
    from pontos
  )
  select coalesce(
    json_agg(json_build_object('grupo', group_id, 'posicao', posicao)),
    '[]'::json
  )
  from ordenado
  where user_id = auth.uid()
$$;

revoke execute on function public.posicoes_grupos() from public, anon, authenticated;
grant execute on function public.posicoes_grupos() to authenticated;
