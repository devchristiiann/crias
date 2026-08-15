-- 0043 Correcoes das duas revisoes adversariais da rotina de janela.

-- 1. O ranking da tela ganhou limite superior de semana.
--
-- `ranking_grupo` e `posicoes_grupos` filtravam so `data_sp >= inicio_da_semana_sp()`,
-- sem teto, e `premiar_semana` sempre teve os dois lados. Enquanto toda
-- ocorrencia tinha `data_sp` no proprio dia, isso era equivalente. A ocorrencia
-- de janela quebra a equivalencia: ela carrega o ouro de um periodo inteiro numa
-- data so, e sem teto o mesmo ouro reaparecia em todas as semanas seguintes. A
-- tela mostrava um primeiro colocado e o servidor pagava outro, que e exatamente
-- a regra que o CLAUDE.md pede para nao quebrar.
--
-- ponytail: para `n_por_semana` isso fecha, porque a janela nunca cruza a
-- semana. Para `n_por_mes` o mes inteiro continua caindo numa semana so, a do
-- ultimo dia. Tela e servidor agora CONCORDAM nisso, entao nao ha mais mentira,
-- so concentracao. O conserto de verdade e gravar o ouro por marcacao em vez de
-- acumular em `ouro_creditado`, e ninguem usa `n_por_mes` hoje.
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
          and o.data_sp < public.inicio_da_semana_sp() + 7
      ), 0)::int as ouro_semana,
      coalesce(sum(o.ouro_creditado), 0)::int as ouro_total,
      (
        select coalesce(sum(s.atual), 0)::int
          from streaks s
          join habits h on h.id = s.habit_id
         where h.group_id = p_grupo and s.user_id = m.user_id
      ) as streak_total,
      -- "Concluiu hoje" tem dois caminhos, porque a rotina de janela nao fecha
      -- por dia: ou a ocorrencia do dia esta feita, ou a da janela recebeu a
      -- marcacao de hoje. `inicio_janela <> data_sp` e o que distingue as duas.
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
           and o.data_sp < public.inicio_da_semana_sp() + 7
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

-- 2. Arquivar rotina nao apaga janela que ja pagou ouro.
--
-- `arquivar_habito` existe para PRESERVAR o passado, e apagava
-- `status = 'pendente' and data_sp >= hoje_sp()`. A ocorrencia de janela fica
-- pendente a semana inteira e tem `data_sp` no domingo: ela casava nos dois
-- predicados enquanto estava sendo usada. Uma chamada do dono apagava 840 de
-- ouro de sete pessoas do ranking. A condicao nova e a mesma que a 0039 e a 0040
-- ja usaram: so sai o que nunca foi tocado.
create or replace function public.arquivar_habito(p_habito uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare v habits;
begin
  select * into v from habits where id = p_habito;

  -- Resposta unica para inexistente e para sem permissao: mensagem diferente
  -- deixa descobrir quais ids existem no banco.
  if not found
     or (v.escopo = 'user' and v.user_id <> auth.uid())
     or (v.escopo = 'group' and not exists (
           select 1 from groups g where g.id = v.group_id and g.dono_id = auth.uid()))
  then
    return json_build_object('error', 'sem_permissao');
  end if;

  update habits set ativo = false where id = p_habito;
  delete from occurrences
   where habit_id = p_habito
     and status = 'pendente'
     and data_sp >= public.hoje_sp()
     and vezes_feitas = 0
     and ouro_creditado = 0;

  return json_build_object('ok', true);
end
$$;

revoke execute on function public.arquivar_habito(uuid) from public, anon, authenticated;
grant execute on function public.arquivar_habito(uuid) to authenticated;

-- 3. O gatilho vira a unica autoridade sobre o `feito_em` da janela.
--
-- Dois furos vinham de dividir essa decisao com o `desfazer_check_in`. Ele
-- escreve `feito_em = null` quando a ocorrencia estava `feito`, e o gatilho so
-- corrigia quando a contagem chegava a zero: desfazer a quinta marcacao de cinco
-- apagava do feed as quatro idas que continuaram valendo, com as fotos junto, e
-- o ouro delas ficava. Agora o gatilho reescreve `feito_em` a partir da unica
-- coisa que importa, que e a contagem: zero marcacoes, sem post; marcacao nova,
-- post novo; marcacao a menos, o post de antes continua onde estava.
create or replace function public.occ_antes_de_gravar()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- A declaracao de tempo de tela publica o post na hora, e nao quando a
  -- enquete fecha. O feed ordena por feito_em, entao sem isto a enquete nao tem
  -- lugar na linha do tempo. O prazo tambem cai de 48 para 24 horas: a check_in
  -- da 0026 ainda escreve 48, e este gatilho e a fonte de verdade.
  if new.status = 'em_validacao' and old.status is distinct from 'em_validacao' then
    new.feito_em := coalesce(new.feito_em, now());
    new.validacao_ate := now() + interval '24 hours';
  end if;

  -- Aprovar nao republica o post. resolver_validacao escreve feito_em = now(),
  -- e sem isto o post pularia para o topo do feed um dia depois.
  if new.status = 'feito' and old.status = 'em_validacao' and old.feito_em is not null then
    new.feito_em := old.feito_em;
  end if;

  -- Rotina de janela: `inicio_janela <> data_sp` so acontece em `n_por_semana` e
  -- `n_por_mes`. A agua tem `vezes_alvo` maior que 1 e NAO e janela, e seis
  -- copos por dia no feed seriam ruido.
  if new.inicio_janela is distinct from new.data_sp then
    if new.vezes_feitas = 0 then
      new.feito_em := null;
    elsif new.vezes_feitas > old.vezes_feitas then
      new.feito_em := now();
    else
      new.feito_em := coalesce(old.feito_em, now());
    end if;
  end if;

  return new;
end
$$;

revoke execute on function public.occ_antes_de_gravar() from public, anon, authenticated;

-- 4. A pocao de ouro volta a valer em rotina de janela.
--
-- O bonus comparava `profiles.ouro_dobrado_em` com `occurrences.data_sp`, e em
-- janela a `data_sp` e o ultimo dia do periodo, nunca o dia da marcacao. Quem
-- pagou 250 pela pocao azul e treinou na terca nao recebia nada, sem erro e sem
-- recado. Em janela o dia que vale e o de hoje, que e quando a marcacao aconteceu.
create or replace function public.occ_depois_de_gravar()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_delta int;
  v_dobra date;
  v_dia date;
  v_vida int;
  v_antes int;
  v_ouro int;
  v_pago boolean;
begin
  if new.ouro_creditado > old.ouro_creditado then
    select ouro_dobrado_em into v_dobra from profiles where id = new.user_id;
    v_dia := case
      when new.inicio_janela is distinct from new.data_sp then public.hoje_sp()
      else new.data_sp
    end;
    if v_dobra = v_dia then
      v_delta := new.ouro_creditado - old.ouro_creditado;
      insert into bonus_ouro (occurrence_id, user_id, valor)
      values (new.id, new.user_id, v_delta)
      on conflict (occurrence_id) do update
        set valor = bonus_ouro.valor + excluded.valor
      where bonus_ouro.estornado_em is null;
      -- `found` cobre os dois caminhos que pagam, insercao e acumulo, e e falso
      -- quando o `where` do conflito barra a linha ja acertada.
      v_pago := found;
      if v_pago then
        update profiles set ouro = ouro + v_delta, xp = xp + v_delta
         where id = new.user_id;
      end if;
    end if;
  end if;

  -- Desfazer acerta a linha uma vez so. O estorno depende de saldo, o carimbo
  -- nao: sem carimbo incondicional, quem esta sem saldo remarca e recebe de
  -- novo.
  if new.ouro_creditado < old.ouro_creditado then
    select valor into v_delta from bonus_ouro
     where occurrence_id = new.id and estornado_em is null;
    if v_delta is not null then
      select ouro into v_ouro from profiles where id = new.user_id for update;
      if v_ouro >= v_delta then
        update profiles
           set ouro = ouro - v_delta,
               xp = greatest(0, xp - v_delta)
         where id = new.user_id;
      end if;
      update bonus_ouro set estornado_em = now() where occurrence_id = new.id;
    end if;
  end if;

  -- Descanso: o primeiro dia produtivo devolve 5 de vida, uma vez por dia.
  if new.status = 'feito' and old.status is distinct from 'feito' then
    insert into descansos (user_id, data_sp) values (new.user_id, public.hoje_sp())
    on conflict (user_id, data_sp) do nothing;
    if found then
      select vida into v_antes from profiles where id = new.user_id for update;
      if v_antes < 50 then
        update profiles set vida = least(50, vida + 5)
         where id = new.user_id
         returning vida into v_vida;
        insert into vida_eventos (user_id, delta, vida_depois, motivo)
        values (new.user_id, v_vida - v_antes, v_vida, 'descanso');
      end if;
    end if;
  end if;

  return null;
end
$$;

revoke execute on function public.occ_depois_de_gravar() from public, anon, authenticated;

-- 5. `inicio_janela` deixa de aceitar nulo.
--
-- `null is distinct from data_sp` e verdadeiro, entao uma linha que entrasse sem
-- essa coluna passaria a ser tratada como janela pelo gatilho e pelo ranking. E
-- uma policy nova de distancia do problema, e o backfill custa nada: hoje nao ha
-- nenhum nulo.
update occurrences set inicio_janela = data_sp where inicio_janela is null;
alter table occurrences alter column inicio_janela set not null;

-- 6. Higiene de `search_path` nas funcoes auxiliares antigas, todas apontadas
--    pelo advisor. Nenhuma e exploravel hoje, porque rodam dentro de funcoes que
--    ja fixam o caminho, mas `regra_valida` e `config_valida` tambem sao
--    avaliadas em CHECK constraint, com o `search_path` de quem escreve.
alter function public.hoje_sp() set search_path = public;
alter function public.inicio_da_semana_sp() set search_path = public;
alter function public.multiplicador(int) set search_path = public;
alter function public.handle_new_user() set search_path = public;

revoke execute on function public.handle_new_user() from public, anon, authenticated;
