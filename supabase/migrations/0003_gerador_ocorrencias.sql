-- 0003_gerador_ocorrencias
-- Ocorrencia materializada: um cron gera os proximos dias a partir da regra.
-- E ela que torna triviais o push, o calendario, o atraso e o streak.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Habitos "N vezes por periodo" tem UMA ocorrencia por periodo, com contador.
-- Sem isso, tres check-ins na mesma semana colidiriam na UNIQUE (habit, user, data_sp).
alter table public.occurrences
  add column if not exists vezes_feitas smallint not null default 0,
  add column if not exists vezes_alvo smallint not null default 1;

create or replace function public.gerar_ocorrencias(dias int default 7)
returns int language plpgsql security definer set search_path = public as $$
declare inseridas int;
begin
  with alvo as (
    select
      h.id as habit_id,
      coalesce(h.user_id, gm.user_id) as user_id,
      h.regra_frequencia as regra,
      h.lembrete_hora,
      d::date as data_sp
    from habits h
    left join group_members gm on gm.group_id = h.group_id
    cross join generate_series(
      public.hoje_sp(),
      public.hoje_sp() + dias,
      interval '1 day'
    ) d
    where h.ativo
  ),
  filtrado as (
    select * from alvo
    where case regra->>'tipo'
      when 'diaria' then true
      -- dow: 0 domingo a 6 sabado. Containment evita set-returning dentro do CASE.
      when 'semanal_dias' then regra->'dias' @> to_jsonb(extract(dow from data_sp)::int)
      -- isodow: 1 segunda a 5 sexta.
      when 'dias_uteis' then regra->'dias' @> to_jsonb(extract(isodow from data_sp)::int)
      when 'quinzenal' then mod(abs(data_sp - (regra->>'ancora')::date), 14) = 0
      when 'mensal_dia' then extract(day from data_sp)::int = (regra->>'dia')::int
      -- Um periodo, uma ocorrencia: fecha no domingo.
      when 'n_por_semana' then extract(isodow from data_sp)::int = 7
      -- Um periodo, uma ocorrencia: fecha no ultimo dia do mes.
      when 'n_por_mes' then data_sp = (date_trunc('month', data_sp) + interval '1 month - 1 day')::date
      when 'avulsa' then data_sp = (regra->>'data')::date
      else false
    end
  )
  insert into occurrences (habit_id, user_id, data_sp, vence_em, proximo_toque_em, vezes_alvo)
  select
    habit_id,
    user_id,
    data_sp,
    ((data_sp + time '23:59') at time zone 'America/Sao_Paulo'),
    case
      when lembrete_hora is null then null
      else ((data_sp + lembrete_hora) at time zone 'America/Sao_Paulo')
    end,
    case regra->>'tipo'
      when 'n_por_semana' then (regra->>'vezes')::smallint
      when 'n_por_mes' then (regra->>'vezes')::smallint
      else 1::smallint
    end
  from filtrado
  where user_id is not null
  on conflict (habit_id, user_id, data_sp) do nothing;

  get diagnostics inseridas = row_count;
  return inseridas;
end $$;

revoke execute on function public.gerar_ocorrencias(int) from public, anon;

-- 03:10 UTC e 00:10 em Sao Paulo.
select cron.unschedule('gerar-ocorrencias')
  where exists (select 1 from cron.job where jobname = 'gerar-ocorrencias');
select cron.schedule('gerar-ocorrencias', '10 3 * * *', $$select public.gerar_ocorrencias(7)$$);
