-- 0013_correcoes_seguranca
--
-- Correcoes de uma auditoria adversarial que atacou o banco real. Cada bloco
-- abaixo fecha um furo que foi EXPLORADO de verdade, nao um risco teorico.

-- ---------------------------------------------------------------------------
-- 1. CRITICO: ouro infinito.
--
-- `revoke ... from public, anon` NAO tira o EXECUTE de `authenticated`: o
-- Supabase concede execute por padrao a esse papel. Com isso qualquer usuario
-- chamava gerar_ocorrencias(400), criava centenas de ocorrencias futuras e
-- fazia check-in em todas. Prova da auditoria: ouro de 0 para 81610.
-- ---------------------------------------------------------------------------

revoke execute on function public.gerar_ocorrencias(int) from public, anon, authenticated;
revoke execute on function public.marcar_atrasadas() from public, anon, authenticated;
revoke execute on function public.gerar_codigo() from public, anon, authenticated;
revoke execute on function public.regra_valida(jsonb) from public, anon, authenticated;
revoke execute on function public.multiplicador(int) from public, anon, authenticated;
revoke execute on function public.hoje_sp() from public, anon, authenticated;
revoke execute on function public.instante_sp(date, time) from public, anon, authenticated;
revoke execute on function public.toques_do_dia(uuid, date) from public, anon, authenticated;
revoke execute on function public.e_membro(uuid) from public, anon;

-- ---------------------------------------------------------------------------
-- 2. CRITICO: token_rapido lido por colega de grupo.
--
-- RLS decide LINHA, nunca COLUNA. A policy de leitura de occurrences entrega a
-- linha inteira aos membros do grupo, e o token_rapido e a UNICA autorizacao do
-- quick-check-in. Resultado: B lia o token de A e concluia o check-in de A.
-- A trava e privilegio de coluna. O front ja lista colunas explicitamente,
-- entao nada quebra.
-- ---------------------------------------------------------------------------

revoke select on public.occurrences from authenticated, anon;
grant select (
  id, habit_id, user_id, data_sp, vence_em, status, feito_em, foto_path,
  toques_enviados, proximo_toque_em, vezes_feitas, vezes_alvo
) on public.occurrences to authenticated;

-- ---------------------------------------------------------------------------
-- 3. CRITICO: foto de outro usuario exposta pelo foto_path.
--
-- check_in gravava o caminho recebido sem conferir o dono, e a policy do bucket
-- libera leitura quando occurrences.foto_path aponta para o objeto e o leitor e
-- do grupo. Bastava apontar o proprio check-in para o arquivo alheio.
-- O caminho passa a ser obrigatoriamente <auth.uid()>/...
-- ---------------------------------------------------------------------------

create or replace function public.foto_do_dono(p_caminho text, p_user uuid)
returns boolean language sql immutable as $$
  select p_caminho is null or p_caminho like p_user::text || '/%'
$$;

-- ---------------------------------------------------------------------------
-- 4. Janela de validade da ocorrencia.
--
-- check_in nao conferia se a ocorrencia ja comecou. Habito "N vezes por
-- periodo" fecha no fim do periodo, entao nao da para simplesmente comparar com
-- hoje: a coluna guarda quando a janela ABRE.
-- ---------------------------------------------------------------------------

alter table public.occurrences add column if not exists inicio_janela date;
update public.occurrences set inicio_janela = data_sp where inicio_janela is null;
alter table public.occurrences alter column inicio_janela set default null;

grant select (inicio_janela) on public.occurrences to authenticated;

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
      when 'semanal_dias' then regra->'dias' @> to_jsonb(extract(dow from data_sp)::int)
      when 'dias_uteis' then regra->'dias' @> to_jsonb(extract(isodow from data_sp)::int)
      when 'quinzenal' then mod(abs(data_sp - (regra->>'ancora')::date), 14) = 0
      when 'mensal_dia' then extract(day from data_sp)::int = (regra->>'dia')::int
      when 'n_por_semana' then extract(isodow from data_sp)::int = 7
      when 'n_por_mes' then data_sp = (date_trunc('month', data_sp) + interval '1 month - 1 day')::date
      when 'avulsa' then data_sp = (regra->>'data')::date
      else false
    end
  )
  insert into occurrences (
    habit_id, user_id, data_sp, inicio_janela, vence_em, proximo_toque_em, vezes_alvo
  )
  select
    habit_id,
    user_id,
    data_sp,
    -- Quando a janela abre. Habito de periodo pode ser marcado desde o comeco
    -- da semana ou do mes, mesmo fechando so no ultimo dia.
    case regra->>'tipo'
      when 'n_por_semana' then (data_sp - 6)
      when 'n_por_mes' then date_trunc('month', data_sp)::date
      else data_sp
    end,
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

revoke execute on function public.gerar_ocorrencias(int) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. check_in com as duas travas novas: janela e dono da foto.
-- ---------------------------------------------------------------------------

create or replace function public.check_in(p_occ uuid, p_foto text default null)
returns json language plpgsql security definer set search_path = public as $$
declare
  o occurrences; h habits; s streaks;
  v_ganho int; v_mult numeric; v_streak int;
  v_completou boolean := false; v_bau boolean := false;
  v_nos int := 0; v_primeiro_do_dia boolean;
  v_bonus_bau constant int := 50;
begin
  select * into o from occurrences where id = p_occ for update;

  if not found or o.user_id <> auth.uid() then
    return json_build_object('error', 'ocorrencia_invalida');
  end if;

  -- Ocorrencia que ainda nao abriu nao vale check-in. Sem isso, quem
  -- conseguisse criar ocorrencia futura colhia o ouro de meses adiantado.
  if coalesce(o.inicio_janela, o.data_sp) > public.hoje_sp() then
    return json_build_object('error', 'ocorrencia_futura');
  end if;

  -- Caminho de foto so pode apontar para a propria pasta do usuario.
  if not public.foto_do_dono(p_foto, auth.uid()) then
    return json_build_object('error', 'foto_invalida');
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

  if v_completou and v_primeiro_do_dia then
    select count(distinct data_sp) into v_nos
      from occurrences where user_id = o.user_id and status = 'feito';
    if v_nos % 7 = 0 then
      update profiles set ouro = ouro + v_bonus_bau where id = o.user_id;
      v_bau := true;
    end if;
  end if;

  return json_build_object(
    'ouro_ganho', v_ganho + (case when v_bau then v_bonus_bau else 0 end),
    -- O valor do bau vem do servidor. A tela nao pode chutar numero de jogo.
    'ouro_bau', case when v_bau then v_bonus_bau else 0 end,
    'streak', v_streak,
    'multiplicador', v_mult,
    'completou', v_completou,
    'vezes_feitas', o.vezes_feitas + 1,
    'vezes_alvo', o.vezes_alvo,
    'bau', v_bau,
    'no', v_nos
  );
end $$;

-- Mesmas travas no caminho da notificacao.
create or replace function public.check_in_por_token(p_token uuid, p_acao text)
returns json language plpgsql security definer set search_path = public as $$
declare
  o occurrences; h habits; s streaks;
  v_ganho int; v_mult numeric; v_streak int; v_completou boolean;
  v_bau boolean := false; v_nos int := 0; v_primeiro boolean;
  v_bonus_bau constant int := 50;
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

  if coalesce(o.inicio_janela, o.data_sp) > public.hoje_sp() then
    return json_build_object('error', 'ocorrencia_futura');
  end if;

  if o.status = 'feito' then
    return json_build_object('ja_feito', true, 'ouro_ganho', 0,
      'streak', coalesce((select atual from streaks
                           where habit_id = o.habit_id and user_id = o.user_id), 0));
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
      update profiles set ouro = ouro + v_bonus_bau where id = o.user_id;
      v_bau := true;
    end if;
  end if;

  return json_build_object(
    'ouro_ganho', v_ganho + (case when v_bau then v_bonus_bau else 0 end),
    'ouro_bau', case when v_bau then v_bonus_bau else 0 end,
    'streak', v_streak,
    'completou', v_completou,
    'bau', v_bau
  );
end $$;

revoke execute on function public.check_in_por_token(uuid, text)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 6. item_equipado por PATCH driblava a checagem de posse do equipar_item.
-- ---------------------------------------------------------------------------

revoke update on public.profiles from authenticated;
grant update (nome, avatar_base) on public.profiles to authenticated;

-- ---------------------------------------------------------------------------
-- 7. SSRF: endpoint de push arbitrario, buscado pela infra com service_role.
--
-- So os servicos de push reais entram. Sem isso da para apontar o endpoint
-- para um endereco interno e fazer a funcao buscar aquilo no proximo ciclo.
-- ---------------------------------------------------------------------------

delete from public.push_subs
 where endpoint !~* '^https://([a-z0-9-]+\.)*(googleapis\.com|apple\.com|mozilla\.com|windows\.com|microsoft\.com)/';

alter table public.push_subs drop constraint if exists push_endpoint_conhecido;
alter table public.push_subs add constraint push_endpoint_conhecido check (
  endpoint ~* '^https://([a-z0-9-]+\.)*(googleapis\.com|apple\.com|mozilla\.com|windows\.com|microsoft\.com)/'
);

-- ---------------------------------------------------------------------------
-- 8. arquivar_habito deixava enumerar id de habito alheio pela mensagem.
-- ---------------------------------------------------------------------------

create or replace function public.arquivar_habito(p_habito uuid)
returns json language plpgsql security definer set search_path = public as $$
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
   where habit_id = p_habito and status = 'pendente' and data_sp >= public.hoje_sp();

  return json_build_object('ok', true);
end $$;

revoke execute on function public.arquivar_habito(uuid) from public, anon;
grant execute on function public.arquivar_habito(uuid) to authenticated;
