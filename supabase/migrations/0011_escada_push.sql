-- 0011_escada_push
-- A escada de toques vive aqui, nao na edge function: assim da para testar
-- com SQL, e a funcao fica so com o trabalho de assinar e enviar o web push.
--
-- Bitmask de occurrences.toques_enviados:
--   1 lembrete       no horario do habito
--   2 cutucada       3h antes de vencer
--   4 noite          21h em Sao Paulo, o toque mais forte
--   8 consequencia   quando virou atrasado

create or replace function public.instante_sp(p_data date, p_hora time)
returns timestamptz language sql immutable as $$
  select (p_data + p_hora) at time zone 'America/Sao_Paulo'
$$;

-- Teto diario de notificacao por usuario. Notificacao demais mata o app
-- mais rapido que notificacao de menos.
create or replace function public.toques_do_dia(p_user uuid, p_data date)
returns int language sql stable as $$
  -- Conta os bits ligados na mascara. smallint nao casta direto para bit,
  -- entao passa por int primeiro.
  select coalesce(sum(bit_count(toques_enviados::int::bit(32))), 0)::int
    from public.occurrences
   where user_id = p_user and data_sp = p_data
$$;

create or replace function public.toques_pendentes(p_limite int default 200)
returns table (
  occurrence_id uuid,
  token_rapido uuid,
  toque text,
  bit_toque int,
  proximo_toque timestamptz,
  user_id uuid,
  nome text,
  habito text,
  grupo text,
  streak int,
  feitos_no_grupo int,
  total_grupo int,
  ouro int,
  vida int,
  horas int,
  endpoint text,
  p256dh text,
  auth text
)
language sql stable security definer set search_path = public as $$
  with candidatas as (
    select o.*, h.titulo, h.group_id, h.lembrete_hora, h.ouro_base,
           g.nome as grupo_nome
      from occurrences o
      join habits h on h.id = o.habit_id
      left join groups g on g.id = h.group_id
     where o.proximo_toque_em is not null
       and o.proximo_toque_em <= now()
       and o.status in ('pendente', 'atrasado')
     limit p_limite
  ),
  decidido as (
    select c.*,
      case
        when c.status = 'atrasado' and (c.toques_enviados & 8) = 0 then 'consequencia'
        when c.lembrete_hora is not null and (c.toques_enviados & 1) = 0 then 'lembrete'
        when (c.toques_enviados & 2) = 0 and now() >= c.vence_em - interval '3 hours' then 'cutucada'
        when (c.toques_enviados & 4) = 0 and now() >= public.instante_sp(c.data_sp, '21:00') then 'noite'
        else null
      end as toque_escolhido
    from candidatas c
  )
  select
    d.id,
    d.token_rapido,
    d.toque_escolhido,
    case d.toque_escolhido
      when 'lembrete' then 1 when 'cutucada' then 2
      when 'noite' then 4 else 8 end,
    case d.toque_escolhido
      when 'lembrete' then greatest(d.vence_em - interval '3 hours', now() + interval '1 minute')
      when 'cutucada' then public.instante_sp(d.data_sp, '21:00')
      else null
    end,
    d.user_id,
    p.nome,
    d.titulo,
    d.grupo_nome,
    coalesce(s.atual, 0),
    coalesce((select count(*)::int from occurrences x
               where x.habit_id = d.habit_id and x.data_sp = d.data_sp and x.status = 'feito'), 0),
    coalesce((select count(*)::int from occurrences x
               where x.habit_id = d.habit_id and x.data_sp = d.data_sp), 0),
    coalesce(d.ouro_base, 0),
    p.vida,
    greatest(0, floor(extract(epoch from (d.vence_em - now())) / 3600)::int),
    ps.endpoint, ps.p256dh, ps.auth
  from decidido d
  join profiles p on p.id = d.user_id
  join push_subs ps on ps.user_id = d.user_id
  left join streaks s on s.habit_id = d.habit_id and s.user_id = d.user_id
  where d.toque_escolhido is not null
    -- Teto de 6 por dia, mas noite e consequencia sempre passam:
    -- sao os toques que evitam a perda, e perder em silencio e pior.
    and (
      public.toques_do_dia(d.user_id, d.data_sp) < 6
      or d.toque_escolhido in ('noite', 'consequencia')
    )
$$;

create or replace function public.registrar_toque(
  p_occ uuid,
  p_bit int,
  p_proximo timestamptz
) returns void language sql security definer set search_path = public as $$
  update public.occurrences
     set toques_enviados = toques_enviados | p_bit,
         proximo_toque_em = p_proximo
   where id = p_occ
$$;

create or replace function public.remover_sub(p_endpoint text)
returns void language sql security definer set search_path = public as $$
  delete from public.push_subs where endpoint = p_endpoint
$$;

-- Check-in disparado pela acao da notificacao. Sem auth.uid(), o dono vem do token.
create or replace function public.check_in_por_token(p_token uuid, p_acao text)
returns json language plpgsql security definer set search_path = public as $$
declare o occurrences; h habits; s streaks;
  v_ganho int; v_mult numeric; v_streak int; v_completou boolean; v_bau boolean := false;
  v_nos int := 0; v_primeiro boolean;
begin
  select * into o from occurrences where token_rapido = p_token for update;
  if not found then
    return json_build_object('error', 'token_invalido');
  end if;

  if p_acao = 'adiar' then
    update occurrences
       set proximo_toque_em = least(now() + interval '1 hour', vence_em),
           token_rapido = gen_random_uuid()
     where id = o.id;
    return json_build_object('ok', true, 'adiado', true);
  end if;

  if o.status = 'feito' then
    return json_build_object('ja_feito', true,
      'ouro_ganho', 0,
      'streak', coalesce((select atual from streaks where habit_id = o.habit_id and user_id = o.user_id), 0));
  end if;

  select * into h from habits where id = o.habit_id;
  select * into s from streaks where habit_id = o.habit_id and user_id = o.user_id;

  v_primeiro := not exists (
    select 1 from occurrences
     where user_id = o.user_id and data_sp = o.data_sp and status = 'feito' and id <> o.id
  );
  v_completou := (o.vezes_feitas + 1) >= o.vezes_alvo;

  if not v_completou then
    v_streak := coalesce(s.atual, 0);
  elsif s.ultima_data_sp is null then
    v_streak := 1;
  elsif s.ultima_data_sp = o.data_sp then
    v_streak := s.atual;
  elsif exists (
    select 1 from occurrences x
     where x.habit_id = o.habit_id and x.user_id = o.user_id
       and x.data_sp > s.ultima_data_sp and x.data_sp < o.data_sp and x.status <> 'feito'
  ) then
    v_streak := 1;
  else
    v_streak := s.atual + 1;
  end if;

  v_mult := public.multiplicador(v_streak);
  v_ganho := ceil(h.ouro_base * v_mult);

  update occurrences
     set vezes_feitas = o.vezes_feitas + 1,
         status = case when v_completou then 'feito' else status end,
         feito_em = case when v_completou then now() else feito_em end,
         proximo_toque_em = case when v_completou then null else proximo_toque_em end,
         -- Token e de uso unico: gira sempre, mesmo em falha parcial.
         token_rapido = gen_random_uuid()
   where id = o.id;

  if v_completou then
    insert into streaks (habit_id, user_id, atual, melhor, ultima_data_sp)
    values (o.habit_id, o.user_id, v_streak, v_streak, o.data_sp)
    on conflict (habit_id, user_id) do update
      set atual = v_streak,
          melhor = greatest(streaks.melhor, v_streak),
          ultima_data_sp = o.data_sp;
  end if;

  update profiles set ouro = ouro + v_ganho, xp = xp + v_ganho where id = o.user_id;

  if v_completou and v_primeiro then
    select count(distinct data_sp) into v_nos
      from occurrences where user_id = o.user_id and status = 'feito';
    if v_nos % 7 = 0 then
      update profiles set ouro = ouro + 50 where id = o.user_id;
      v_bau := true;
    end if;
  end if;

  return json_build_object(
    'ouro_ganho', v_ganho + (case when v_bau then 50 else 0 end),
    'streak', v_streak,
    'completou', v_completou,
    'bau', v_bau
  );
end $$;

-- Atrasada precisa entrar na fila do toque de consequencia.
create or replace function public.marcar_atrasadas()
returns int language plpgsql security definer set search_path = public as $$
declare v_total int;
begin
  create temp table if not exists tmp_venceu (user_id uuid, habit_id uuid) on commit drop;
  delete from tmp_venceu;

  with venceu as (
    update occurrences
       set status = 'atrasado', proximo_toque_em = now()
     where status = 'pendente'
       and vence_em + interval '24 hours' < now()
    returning user_id, habit_id
  )
  insert into tmp_venceu select user_id, habit_id from venceu;

  select count(*) into v_total from tmp_venceu;
  if v_total = 0 then
    return 0;
  end if;

  update profiles p
     set vida = greatest(0, p.vida - (10 * v.perdidas))
    from (select user_id, count(*)::int as perdidas from tmp_venceu group by 1) v
   where p.id = v.user_id;

  update streaks s set atual = 0
    from tmp_venceu v
   where s.habit_id = v.habit_id and s.user_id = v.user_id;

  update streaks s set atual = 0
   where s.user_id in (select id from profiles where vida = 0);
  update profiles set vida = 50 where vida = 0;

  return v_total;
end $$;

revoke execute on function
  public.toques_pendentes(int), public.registrar_toque(uuid, int, timestamptz),
  public.remover_sub(text), public.check_in_por_token(uuid, text),
  public.instante_sp(date, time), public.toques_do_dia(uuid, date)
  from public, anon, authenticated;
