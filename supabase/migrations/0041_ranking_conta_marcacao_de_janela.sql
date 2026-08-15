-- 0041 O ranking conta a marcacao da rotina de janela, e nao so a semana fechada.
--
-- As tres funcoes do ranking somavam `ouro_creditado` com um `status = 'feito'`
-- pendurado no join. Para rotina diaria isso nao muda nada: ouro creditado so
-- existe em ocorrencia feita. Para a rotina de janela, que fica `pendente` ate a
-- ultima marcacao da semana, mudava tudo: quem foi 4 vezes a academia via ouro
-- na carteira e ZERO no ranking a semana inteira, e a posicao dele saltava de
-- uma vez no domingo. Pior ainda, quem fechou 4 de 5 e perdeu a semana ficava
-- com o ouro e nunca aparecia no ranking, porque a ocorrencia vira `atrasado`.
--
-- O criterio passa a ser o unico que sempre foi a verdade: quem tem
-- `ouro_creditado` ganhou aquele ouro num check-in.
--
-- `ranking_grupo` e `posicoes_grupos` sao reescritas de novo na 0043, que
-- acrescenta o limite superior da semana. O corpo daqui e o passo intermediario.

create or replace function public.ranking_grupo(p_grupo uuid)
returns json
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    json_agg(
      json_build_object(
        'user_id', t.user_id,
        'ouro_semana', t.ouro_semana,
        'ouro_total', t.ouro_total,
        'streak_total', t.streak_total,
        'concluidos_hoje', t.concluidos_hoje
      )
      order by t.ouro_semana desc, t.streak_total desc, t.nome
    ),
    '[]'::json
  )
  from (
    select
      m.user_id,
      p.nome,
      coalesce(sum(o.ouro_creditado) filter (
        where o.data_sp >= public.inicio_da_semana_sp()
      ), 0)::int as ouro_semana,
      coalesce(sum(o.ouro_creditado), 0)::int as ouro_total,
      (
        select coalesce(sum(s.atual), 0)::int
          from streaks s
          join habits h on h.id = s.habit_id
         where h.group_id = p_grupo and s.user_id = m.user_id
      ) as streak_total,
      -- "Concluiu hoje" agora tem dois caminhos, porque a rotina de janela nao
      -- fecha por dia: ou a ocorrencia do dia esta feita, ou a da janela recebeu
      -- a marcacao de hoje. `inicio_janela <> data_sp` e o que distingue as
      -- duas, e o gerador so produz isso para `n_por_semana` e `n_por_mes`.
      count(o.id) filter (
        where (o.status = 'feito' and o.data_sp = public.hoje_sp())
           or (o.inicio_janela <> o.data_sp and o.ultima_marcacao_sp = public.hoje_sp())
      )::int as concluidos_hoje
    from group_members m
    join profiles p on p.id = m.user_id
    left join habits h on h.group_id = p_grupo
    left join occurrences o
      on o.habit_id = h.id and o.user_id = m.user_id
    where m.group_id = p_grupo
    group by m.user_id, p.nome
  ) t
  -- Grupo inexistente e grupo de terceiro respondem a mesma lista vazia:
  -- mensagem diferente deixa descobrir quais grupos existem.
  where public.e_membro(p_grupo)
$$;

revoke execute on function public.ranking_grupo(uuid) from public, anon, authenticated;
grant execute on function public.ranking_grupo(uuid) to authenticated;

create or replace function public.posicoes_grupos()
returns json
language sql
stable
security definer
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
           and o.data_sp >= public.inicio_da_semana_sp()
      ), 0)::int as ouro_semana,
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
        order by ouro_semana desc, streak_total desc, nome
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

create or replace function public.premiar_semana(p_semana date default null)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_semana date := coalesce(p_semana, public.inicio_da_semana_sp() - 7);
  v_pagos jsonb;
begin
  if extract(isodow from v_semana) <> 1 then
    raise exception 'premiar_semana: % nao e uma segunda-feira', v_semana;
  end if;

  with ganhos as (
    -- `group_members` no comeco, e nao `occurrences`, porque quem saiu do grupo
    -- sai do ranking na mesma hora: ele nao aparece na tela e nao pode aparecer
    -- no pagamento. As ocorrencias dele continuam no banco.
    --
    -- Sem filtro de `status`: o `having` abaixo ja recusa quem nao ganhou nada, e
    -- exigir `feito` deixava de fora a semana de janela fechada em 4 de 5, que
    -- pagou ouro de verdade em quatro check-ins.
    select m.group_id, m.user_id, p.nome, sum(o.ouro_creditado)::int as ouro_semana
      from group_members m
      join profiles p on p.id = m.user_id
      join habits h on h.group_id = m.group_id
      join occurrences o on o.habit_id = h.id and o.user_id = m.user_id
     where o.data_sp >= v_semana
       and o.data_sp < v_semana + 7
     group by m.group_id, m.user_id, p.nome
    -- So entra quem GANHOU ouro na semana. Zero na semana nao sobe ao podio nem
    -- em grupo de tres pessoas paradas.
    having sum(o.ouro_creditado) > 0
  ),
  ordenado as (
    select
      g.group_id,
      g.user_id,
      count(*) over (partition by g.group_id) as premiaveis,
      row_number() over (
        partition by g.group_id
        order by
          g.ouro_semana desc,
          (
            select coalesce(sum(s.atual), 0)::int
              from streaks s
              join habits h2 on h2.id = s.habit_id
             where h2.group_id = g.group_id and s.user_id = g.user_id
          ) desc,
          g.nome
      ) as posicao
    from ganhos g
  ),
  a_pagar as (
    select
      o.group_id,
      o.user_id,
      o.posicao,
      case o.posicao
        when 1 then gr.premio_1
        when 2 then gr.premio_2
        when 3 then gr.premio_3
      end as ouro
    from ordenado o
    join groups gr on gr.id = o.group_id
    -- `premiaveis >= 2` e a trava contra o grupo de uma pessoa so imprimir ouro.
    --
    -- `premios_em` e a trava contra o dono premiar depois de ver o placar: o
    -- premio precisa ter sido definido ANTES de a semana comecar. A conversao e
    -- para o INSTANTE de Sao Paulo, nunca UTC cru: a segunda comeca as 03:00
    -- UTC, e comparar com a meia-noite UTC poria a fronteira tres horas cedo, no
    -- domingo a noite de Sao Paulo, recusando premio cadastrado dentro do prazo.
    -- Grupo com `premios_em` nulo cai fora sozinho: comparar com nulo nao e
    -- verdadeiro, e por isso quem nunca cadastrou premio nunca paga.
    where o.posicao <= 3
      and o.premiaveis >= 2
      and gr.premios_em < (v_semana::timestamp at time zone 'America/Sao_Paulo')
  ),
  inseridos as (
    insert into premiacoes (group_id, semana, posicao, user_id, ouro)
    select group_id, v_semana, posicao, user_id, ouro
      from a_pagar
     -- Posicao sem premio cadastrado nao vira linha: `premiacoes` guarda quem
     -- RECEBEU, nao quem ficou em terceiro num grupo que so premia o primeiro.
     where ouro > 0
    on conflict (group_id, semana, posicao) do nothing
    returning group_id, posicao, user_id, ouro
  ),
  creditados as (
    -- O credito sai de `inseridos`, nunca de `a_pagar`: e a diferenca entre
    -- "quem deveria receber" e "quem acabou de ser registrado agora". Somado por
    -- pessoa antes do update porque a mesma pessoa pode subir ao podio em mais
    -- de um grupo na mesma rodada, e Postgres nao aceita atualizar a mesma linha
    -- duas vezes no mesmo comando.
    update profiles p
       set ouro = p.ouro + t.total
      from (
        select i.user_id, sum(i.ouro)::int as total from inseridos i group by i.user_id
      ) t
     where p.id = t.user_id
    returning p.id
  )
  select coalesce(
    jsonb_agg(jsonb_build_object(
      'user_id', i.user_id, 'group_id', i.group_id, 'posicao', i.posicao, 'ouro', i.ouro
    )),
    '[]'::jsonb
  )
    into v_pagos
    from inseridos i;

  -- O AVISO NUNCA DERRUBA O PAGAMENTO. Comando separado e dentro de bloco com
  -- excecao de proposito: junto no mesmo `with`, um erro ao gravar a linha da
  -- central de notificacoes desfaria o credito inteiro da rodada. Mesma decisao
  -- que o `push-dispatch` tomou: perder o registro e ruim, perder o valor e
  -- inaceitavel. O `raise warning` deixa rastro em `cron.job_run_details`.
  begin
    insert into notificacoes (user_id, titulo, corpo, url)
    select
      (e->>'user_id')::uuid,
      (e->>'posicao') || 'º lugar em ' || g.nome,
      'A semana fechou e você ganhou ' || (e->>'ouro') || ' de ouro.',
      '/grupos/' || (e->>'group_id')
      from jsonb_array_elements(v_pagos) e
      join groups g on g.id = (e->>'group_id')::uuid;
  exception when others then
    raise warning 'premiar_semana: aviso da semana % nao gravado (%)', v_semana, sqlerrm;
  end;

  return jsonb_array_length(v_pagos);
end
$$;

revoke execute on function public.premiar_semana(date) from public, anon, authenticated;
