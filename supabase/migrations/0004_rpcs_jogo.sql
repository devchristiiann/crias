-- 0004_rpcs_jogo
-- Todo valor de jogo e server-authoritative. O front nunca envia ouro, vida ou streak:
-- ele diz "marquei a ocorrencia X" e o servidor calcula o resto.

create index if not exists idx_occ_feitas on public.occurrences (user_id, data_sp)
  where status = 'feito';

-- 1.0 na base, 2.0 no teto, subindo ao longo de 30 dias de sequencia.
create or replace function public.multiplicador(streak int) returns numeric
language sql immutable as $$
  select least(2.0, 1.0 + (least(greatest(streak, 0), 30)::numeric / 30.0))
$$;

create or replace function public.check_in(p_occ uuid, p_foto text default null)
returns json language plpgsql security definer set search_path = public as $$
declare
  o occurrences;
  h habits;
  s streaks;
  v_ganho int;
  v_mult numeric;
  v_streak int;
  v_completou boolean := false;
  v_bau boolean := false;
  v_nos int := 0;
  v_primeiro_do_dia boolean;
begin
  -- O lock e o que impede duplo clique de creditar duas vezes,
  -- mesmo com duas requisicoes simultaneas.
  select * into o from occurrences where id = p_occ for update;

  if not found or o.user_id <> auth.uid() then
    return json_build_object('error', 'ocorrencia_invalida');
  end if;

  if o.status = 'feito' then
    return json_build_object(
      'ja_feito', true,
      'ouro', (select ouro from profiles where id = auth.uid())
    );
  end if;

  select * into h from habits where id = o.habit_id;
  select * into s from streaks where habit_id = o.habit_id and user_id = o.user_id;

  v_primeiro_do_dia := not exists (
    select 1 from occurrences
     where user_id = o.user_id and data_sp = o.data_sp
       and status = 'feito' and id <> o.id
  );

  -- Habito "N vezes por periodo" so fecha quando bate o alvo.
  v_completou := (o.vezes_feitas + 1) >= o.vezes_alvo;

  -- Streak conta na sequencia de OCORRENCIAS, nao de dias corridos:
  -- habito semanal nao tem dias adjacentes. Quebrou se houve alguma
  -- ocorrencia nao concluida entre a ultima conclusao e esta.
  if not v_completou then
    v_streak := coalesce(s.atual, 0);
  elsif s.ultima_data_sp is null then
    v_streak := 1;
  elsif s.ultima_data_sp = o.data_sp then
    v_streak := s.atual;
  elsif exists (
    select 1 from occurrences x
     where x.habit_id = o.habit_id and x.user_id = o.user_id
       and x.data_sp > s.ultima_data_sp and x.data_sp < o.data_sp
       and x.status <> 'feito'
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
         foto_path = coalesce(p_foto, foto_path),
         proximo_toque_em = case when v_completou then null else proximo_toque_em end
   where id = p_occ;

  if v_completou then
    insert into streaks (habit_id, user_id, atual, melhor, ultima_data_sp)
    values (o.habit_id, o.user_id, v_streak, v_streak, o.data_sp)
    on conflict (habit_id, user_id) do update
      set atual = v_streak,
          melhor = greatest(streaks.melhor, v_streak),
          ultima_data_sp = o.data_sp;
  end if;

  update profiles set ouro = ouro + v_ganho, xp = xp + v_ganho where id = o.user_id;

  -- Bau da trilha: a cada sete DIAS PRODUTIVOS, nao a cada sete dias de calendario.
  -- So conta na primeira conclusao do dia.
  if v_completou and v_primeiro_do_dia then
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
    'multiplicador', v_mult,
    'completou', v_completou,
    'vezes_feitas', o.vezes_feitas + 1,
    'vezes_alvo', o.vezes_alvo,
    'bau', v_bau,
    'no', v_nos
  );
end $$;

-- Roda de hora em hora. Ocorrencia pendente 24h depois de vencer vira atrasada.
create or replace function public.marcar_atrasadas()
returns int language plpgsql security definer set search_path = public as $$
declare v_total int;
begin
  create temp table if not exists tmp_venceu (user_id uuid, habit_id uuid) on commit drop;
  delete from tmp_venceu;

  with venceu as (
    update occurrences
       set status = 'atrasado', proximo_toque_em = null
     where status = 'pendente'
       and vence_em + interval '24 hours' < now()
    returning user_id, habit_id
  )
  insert into tmp_venceu select user_id, habit_id from venceu;

  select count(*) into v_total from tmp_venceu;
  if v_total = 0 then
    return 0;
  end if;

  -- Perde 10 de vida POR ocorrencia perdida. Um UPDATE ... FROM comum
  -- descontaria uma vez so por usuario, mesmo com tres habitos perdidos.
  update profiles p
     set vida = greatest(0, p.vida - (10 * v.perdidas))
    from (select user_id, count(*)::int as perdidas from tmp_venceu group by 1) v
   where p.id = v.user_id;

  update streaks s set atual = 0
    from tmp_venceu v
   where s.habit_id = v.habit_id and s.user_id = v.user_id;

  -- Vida zerada: zera TODOS os streaks daquele usuario e devolve a vida cheia.
  -- A punicao custa o futuro, nunca o ouro ja conquistado.
  update streaks s set atual = 0
   where s.user_id in (select id from profiles where vida = 0);
  update profiles set vida = 50 where vida = 0;

  return v_total;
end $$;

create or replace function public.comprar_item(p_item text)
returns json language plpgsql security definer set search_path = public as $$
declare v_custo int; v_ouro int;
begin
  if exists (select 1 from owned_items where user_id = auth.uid() and item_id = p_item) then
    return json_build_object('ja_possui', true);
  end if;

  select custo_ouro into v_custo from avatar_items where id = p_item;
  if not found then
    return json_build_object('error', 'item_inexistente');
  end if;

  select ouro into v_ouro from profiles where id = auth.uid() for update;
  if v_ouro < v_custo then
    return json_build_object('error', 'ouro_insuficiente');
  end if;

  update profiles set ouro = ouro - v_custo where id = auth.uid();
  insert into owned_items (user_id, item_id) values (auth.uid(), p_item)
    on conflict do nothing;

  return json_build_object('ok', true, 'ouro', v_ouro - v_custo);
end $$;

create or replace function public.equipar_item(p_item text)
returns json language plpgsql security definer set search_path = public as $$
begin
  if p_item is not null
     and not exists (select 1 from owned_items where user_id = auth.uid() and item_id = p_item) then
    return json_build_object('error', 'item_nao_possuido');
  end if;
  update profiles set item_equipado = p_item where id = auth.uid();
  return json_build_object('ok', true);
end $$;

create or replace function public.resgatar_premio(p_reward uuid)
returns json language plpgsql security definer set search_path = public as $$
declare v_custo int; v_ouro int;
begin
  select custo_ouro into v_custo from rewards
   where id = p_reward and user_id = auth.uid() and ativo;
  if not found then
    return json_build_object('error', 'premio_invalido');
  end if;

  select ouro into v_ouro from profiles where id = auth.uid() for update;
  if v_ouro < v_custo then
    return json_build_object('error', 'ouro_insuficiente');
  end if;

  update profiles set ouro = ouro - v_custo where id = auth.uid();
  insert into redemptions (user_id, reward_id, custo_ouro)
    values (auth.uid(), p_reward, v_custo);

  return json_build_object('ok', true, 'ouro', v_ouro - v_custo);
end $$;

-- Codigo de convite sem os caracteres que o usuario confunde ao digitar: O, 0, I, 1.
create or replace function public.gerar_codigo() returns text
language plpgsql volatile as $$
declare
  alfabeto text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  saida text := '';
  i int;
begin
  for i in 1..6 loop
    saida := saida || substr(alfabeto, 1 + floor(random() * length(alfabeto))::int, 1);
  end loop;
  return saida;
end $$;

create or replace function public.criar_grupo(p_nome text)
returns json language plpgsql security definer set search_path = public as $$
declare v_codigo text; v_id uuid; v_try int := 0;
begin
  if coalesce(trim(p_nome), '') = '' then
    return json_build_object('error', 'nome_vazio');
  end if;

  loop
    v_codigo := public.gerar_codigo();
    exit when not exists (select 1 from groups where codigo_convite = v_codigo);
    v_try := v_try + 1;
    if v_try > 20 then
      return json_build_object('error', 'codigo_indisponivel');
    end if;
  end loop;

  insert into groups (nome, dono_id, codigo_convite)
    values (trim(p_nome), auth.uid(), v_codigo)
    returning id into v_id;
  insert into group_members (group_id, user_id, papel)
    values (v_id, auth.uid(), 'dono');

  return json_build_object('ok', true, 'id', v_id, 'codigo', v_codigo);
end $$;

create or replace function public.entrar_grupo(p_codigo text)
returns json language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_nome text;
begin
  select id, nome into v_id, v_nome from groups
   where codigo_convite = upper(trim(p_codigo));
  if not found then
    return json_build_object('error', 'codigo_invalido');
  end if;

  insert into group_members (group_id, user_id) values (v_id, auth.uid())
    on conflict do nothing;

  -- Membro novo precisa das ocorrencias dos desafios que ja existem no grupo.
  perform public.gerar_ocorrencias(7);

  return json_build_object('ok', true, 'id', v_id, 'nome', v_nome);
end $$;

-- Trava de permissao: nada de EXECUTE aberto para anonimo.
revoke execute on function
  public.check_in(uuid, text), public.comprar_item(text), public.equipar_item(text),
  public.resgatar_premio(uuid), public.criar_grupo(text), public.entrar_grupo(text),
  public.marcar_atrasadas(), public.gerar_ocorrencias(int), public.gerar_codigo()
  from public, anon;

grant execute on function
  public.check_in(uuid, text), public.comprar_item(text), public.equipar_item(text),
  public.resgatar_premio(uuid), public.criar_grupo(text), public.entrar_grupo(text)
  to authenticated;

select cron.unschedule('marcar-atrasadas')
  where exists (select 1 from cron.job where jobname = 'marcar-atrasadas');
select cron.schedule('marcar-atrasadas', '5 * * * *', $$select public.marcar_atrasadas()$$);
