-- 0019 Refinamentos de uso.
--
-- Sete assuntos, todos vindos de uso real:
--   1. Desmarcar um habito marcado por engano, devolvendo o que foi pago.
--   2. Sair do grupo, renomear e excluir o grupo, sempre pelo dono certo.
--   3. Grupo que exige foto no check-in.
--   4. Habito de perda: o usuario registra a recaida e paga por ela.
--   5. Central de notificacoes dentro do app, com o que ja foi enviado por push.
--   6. Ocorrencia guarda o que pagou, senao nao existe como desfazer sem chutar.
--   7. Historico de vida, para a barra parar de ser um numero sem explicacao.

-- ---------------------------------------------------------------- 1. colunas

alter table public.groups
  add column if not exists exige_foto boolean not null default false;

alter table public.habits
  add column if not exists tipo text not null default 'bom',
  add column if not exists pune_ouro boolean not null default false;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'habits_tipo_check') then
    alter table public.habits
      add constraint habits_tipo_check check (tipo in ('bom', 'ruim'));
  end if;
end $$;

-- Habito de perda nao tem lembrete nem ocorrencia: ele nao vence, o usuario e
-- que confessa. Deixar lembrete ligado prometeria uma notificacao que o gerador
-- nunca vai produzir.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'habits_ruim_sem_lembrete') then
    alter table public.habits
      add constraint habits_ruim_sem_lembrete
      check (tipo = 'bom' or lembrete_hora is null);
  end if;
end $$;

-- O que o check-in pagou, guardado na propria ocorrencia. Sem isto, desfazer
-- teria que recalcular a recompensa e o resultado sairia errado sempre que o
-- multiplicador ou o ouro base mudasse entre marcar e desmarcar.
alter table public.occurrences
  add column if not exists ouro_creditado int not null default 0,
  add column if not exists streak_anterior smallint,
  add column if not exists data_streak_anterior date,
  add column if not exists bau_no int;

-- Colunas novas de occurrences nao entram no grant de select do cliente: sao
-- contabilidade do servidor. O front so precisa saber se pode desmarcar, e isso
-- ele descobre pelo status.

-- --------------------------------------------------------------- 2. recaidas

create table if not exists public.recaidas (
  id uuid primary key default gen_random_uuid(),
  habit_id uuid not null references public.habits(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  vida_perdida int not null default 0 check (vida_perdida >= 0),
  ouro_perdido int not null default 0 check (ouro_perdido >= 0),
  criado_em timestamptz not null default now()
);

create index if not exists idx_recaidas_user on public.recaidas (user_id, criado_em desc);
create index if not exists idx_recaidas_habito on public.recaidas (habit_id, criado_em desc);

alter table public.recaidas enable row level security;

drop policy if exists p_recaidas_read on public.recaidas;
create policy p_recaidas_read on public.recaidas
  for select using (user_id = auth.uid());

revoke all on public.recaidas from public, anon, authenticated;
grant select on public.recaidas to authenticated;

-- ----------------------------------------------------------- 3. notificacoes

create table if not exists public.notificacoes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  titulo text not null,
  corpo text not null,
  url text,
  lida_em timestamptz,
  criado_em timestamptz not null default now()
);

create index if not exists idx_notificacoes_user
  on public.notificacoes (user_id, criado_em desc);
create index if not exists idx_notificacoes_nao_lidas
  on public.notificacoes (user_id) where lida_em is null;

alter table public.notificacoes enable row level security;

drop policy if exists p_notificacoes_read on public.notificacoes;
create policy p_notificacoes_read on public.notificacoes
  for select using (user_id = auth.uid());

-- Escrita nunca vem do cliente: quem grava e o push-dispatch com service_role e
-- as RPCs daqui. Marcar como lida passa por RPC, que so mexe nas proprias.
revoke all on public.notificacoes from public, anon, authenticated;
grant select on public.notificacoes to authenticated;

-- ------------------------------------------------------ 4. historico de vida

-- A vida some e volta sem o usuario ver por que. Cada mudanca vira linha aqui,
-- e a tela mostra o motivo em portugues em vez de um numero que anda sozinho.
create table if not exists public.vida_eventos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  delta int not null,
  vida_depois int not null,
  motivo text not null check (motivo in ('atraso', 'recaida', 'renascimento')),
  criado_em timestamptz not null default now()
);

create index if not exists idx_vida_user on public.vida_eventos (user_id, criado_em desc);

alter table public.vida_eventos enable row level security;

drop policy if exists p_vida_read on public.vida_eventos;
create policy p_vida_read on public.vida_eventos
  for select using (user_id = auth.uid());

revoke all on public.vida_eventos from public, anon, authenticated;
grant select on public.vida_eventos to authenticated;

-- --------------------------------------------------- 5. gerador de ocorrencias

-- Habito de perda nao gera ocorrencia: ele nunca esta pendente, nunca atrasa e
-- nunca vira push. Sem este filtro ele apareceria na lista de hoje como uma
-- tarefa a fazer, que e exatamente o contrario do que ele significa.
create or replace function public.gerar_ocorrencias(dias int default 7)
returns int
language plpgsql
security definer
set search_path = public
as $$
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
    where h.ativo and h.tipo = 'bom'
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

-- ------------------------------------------------------------ 6. criar_habito

-- Assinatura nova: tipo e pune_ouro. `create or replace` criaria sobrecarga
-- ambigua, entao a antiga sai antes.
drop function if exists public.criar_habito(text, jsonb, text, time, int, uuid);

create or replace function public.criar_habito(
  p_titulo text,
  p_regra jsonb,
  p_icone text default 'target',
  p_lembrete time default null,
  p_ouro_base int default 10,
  p_group_id uuid default null,
  p_tipo text default 'bom',
  p_pune_ouro boolean default false
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare v_id uuid; v_tipo text; v_regra jsonb; v_lembrete time;
begin
  v_tipo := coalesce(nullif(trim(p_tipo), ''), 'bom');

  if v_tipo not in ('bom', 'ruim') then
    return json_build_object('error', 'tipo_invalido');
  end if;

  if coalesce(trim(p_titulo), '') = '' then
    return json_build_object('error', 'titulo_vazio');
  end if;

  -- Habito de perda nao tem frequencia nem lembrete: ele nao e agendado, e
  -- confessado. A regra guardada existe so para a coluna nao ficar nula.
  if v_tipo = 'ruim' then
    v_regra := '{"tipo":"diaria"}'::jsonb;
    v_lembrete := null;
  else
    v_regra := p_regra;
    v_lembrete := p_lembrete;
    if not public.regra_valida(v_regra) then
      return json_build_object('error', 'frequencia_invalida');
    end if;
  end if;

  if p_ouro_base is null or p_ouro_base < 1 or p_ouro_base > 10 then
    return json_build_object('error', 'ouro_base_invalido');
  end if;

  if p_group_id is not null and not public.e_membro(p_group_id) then
    return json_build_object('error', 'grupo_invalido');
  end if;

  -- Habito de perda de grupo aparece no Hoje de todo mundo e so tira vida e
  -- ouro de quem aperta. Qualquer membro poder criar um transforma isso em
  -- ferramenta de zoacao dentro do grupo, entao fica com o dono.
  if p_group_id is not null and v_tipo = 'ruim'
     and not exists (select 1 from groups where id = p_group_id and dono_id = auth.uid()) then
    return json_build_object('error', 'grupo_invalido');
  end if;

  insert into habits (
    escopo, group_id, user_id, titulo, icone, regra_frequencia,
    lembrete_hora, ouro_base, tipo, pune_ouro
  )
  values (
    case when p_group_id is null then 'user' else 'group' end,
    p_group_id,
    case when p_group_id is null then auth.uid() else null end,
    left(trim(p_titulo), 80),
    coalesce(nullif(trim(p_icone), ''), 'target'),
    v_regra,
    v_lembrete,
    p_ouro_base,
    v_tipo,
    coalesce(p_pune_ouro, false)
  )
  returning id into v_id;

  if v_tipo = 'bom' then
    perform public.gerar_ocorrencias(7);
  end if;

  return json_build_object('ok', true, 'id', v_id);
end $$;

revoke execute on function public.criar_habito(text, jsonb, text, time, int, uuid, text, boolean)
  from public, anon, authenticated;
grant execute on function public.criar_habito(text, jsonb, text, time, int, uuid, text, boolean)
  to authenticated;

-- ----------------------------------------------------- 7. habitos de perda

-- A recaida custa vida sempre, e ouro so quando o dono do habito marcou que
-- deve custar. O valor sai do banco, nunca do cliente: se o front mandasse
-- quanto perdeu, bastaria mandar zero.
create or replace function public.registrar_recaida(p_habito uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  h habits;
  v_custo_vida constant int := 5;
  v_vida_perdida int := 0;
  v_ouro_perdido int := 0;
  v_vida int;
  v_ouro int;
  v_renasceu boolean := false;
begin
  select * into h from habits where id = p_habito;

  -- Resposta unica para inexistente e para sem acesso, igual a excluir_habito.
  if not found
     or h.tipo <> 'ruim'
     or (h.escopo = 'user' and h.user_id <> auth.uid())
     or (h.escopo = 'group' and not public.e_membro(h.group_id))
  then
    return json_build_object('error', 'sem_permissao');
  end if;

  -- O que a pessoa perde e o que ela TINHA, nao o que o habito cobra. Sem o
  -- `least`, quem estava com zero de ouro via na tela "menos 10 de ouro" sem
  -- ter perdido nada, e a tela nao pode mentir sobre valor de jogo.
  select least(v_custo_vida, vida),
         case when h.pune_ouro then least(h.ouro_base, ouro) else 0 end
    into v_vida_perdida, v_ouro_perdido
    from profiles where id = auth.uid();

  update profiles
     set vida = vida - v_vida_perdida,
         ouro = ouro - v_ouro_perdido
   where id = auth.uid()
   returning vida, ouro into v_vida, v_ouro;

  insert into recaidas (habit_id, user_id, vida_perdida, ouro_perdido)
    values (p_habito, auth.uid(), v_vida_perdida, v_ouro_perdido);

  insert into vida_eventos (user_id, delta, vida_depois, motivo)
    values (auth.uid(), -v_vida_perdida, v_vida, 'recaida');

  -- Mesma regra do atraso: vida zerada zera a ofensiva e devolve a vida cheia.
  -- Sem isto a vida ficaria travada em zero e a punicao perderia o sentido.
  if v_vida = 0 then
    update streaks set atual = 0 where user_id = auth.uid();
    update profiles set vida = 50 where id = auth.uid();
    insert into vida_eventos (user_id, delta, vida_depois, motivo)
      values (auth.uid(), 50, 50, 'renascimento');
    v_vida := 50;
    v_renasceu := true;
  end if;

  return json_build_object(
    'ok', true,
    'vida_perdida', v_vida_perdida,
    'ouro_perdido', v_ouro_perdido,
    'vida', v_vida,
    'ouro', v_ouro,
    'renasceu', v_renasceu
  );
end $$;

revoke execute on function public.registrar_recaida(uuid) from public, anon, authenticated;
grant execute on function public.registrar_recaida(uuid) to authenticated;

-- ------------------------------------------------------------- 8. grupos

-- Sair do grupo. O dono nao sai: o grupo e dele, e sair deixaria os outros com
-- um grupo sem quem administra. Ele exclui ou fica.
create or replace function public.sair_grupo(p_grupo uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare v_dono uuid;
begin
  select dono_id into v_dono from groups where id = p_grupo;

  if not found or not public.e_membro(p_grupo) then
    return json_build_object('error', 'sem_permissao');
  end if;

  if v_dono = auth.uid() then
    return json_build_object('error', 'dono_nao_sai');
  end if;

  -- As ocorrencias dos desafios daquele grupo somem junto, senao a pessoa sai e
  -- continua recebendo push de desafio de um grupo que nao e mais dela.
  delete from occurrences o
   using habits h
   where o.habit_id = h.id
     and h.group_id = p_grupo
     and o.user_id = auth.uid();

  delete from streaks s
   using habits h
   where s.habit_id = h.id
     and h.group_id = p_grupo
     and s.user_id = auth.uid();

  delete from group_members where group_id = p_grupo and user_id = auth.uid();

  return json_build_object('ok', true);
end $$;

revoke execute on function public.sair_grupo(uuid) from public, anon, authenticated;
grant execute on function public.sair_grupo(uuid) to authenticated;

-- Excluir o grupo. So o dono. Os desafios, as ocorrencias e as ofensivas somem
-- por cascade, igual a excluir_habito faz com uma rotina.
create or replace function public.excluir_grupo(p_grupo uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from groups where id = p_grupo and dono_id = auth.uid()) then
    return json_build_object('error', 'sem_permissao');
  end if;

  delete from groups where id = p_grupo;

  return json_build_object('ok', true);
end $$;

revoke execute on function public.excluir_grupo(uuid) from public, anon, authenticated;
grant execute on function public.excluir_grupo(uuid) to authenticated;

-- Renomear e ligar ou desligar a exigencia de foto. So o dono. Passa por RPC
-- porque `groups` nao tem grant de update para authenticated, de proposito.
create or replace function public.atualizar_grupo(
  p_grupo uuid,
  p_nome text default null,
  p_exige_foto boolean default null
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare v_nome text;
begin
  if not exists (select 1 from groups where id = p_grupo and dono_id = auth.uid()) then
    return json_build_object('error', 'sem_permissao');
  end if;

  v_nome := nullif(trim(coalesce(p_nome, '')), '');

  if p_nome is not null and v_nome is null then
    return json_build_object('error', 'nome_vazio');
  end if;

  update groups
     set nome = coalesce(left(v_nome, 40), nome),
         exige_foto = coalesce(p_exige_foto, exige_foto)
   where id = p_grupo;

  return json_build_object('ok', true);
end $$;

revoke execute on function public.atualizar_grupo(uuid, text, boolean) from public, anon, authenticated;
grant execute on function public.atualizar_grupo(uuid, text, boolean) to authenticated;

-- criar_grupo passa a aceitar a exigencia de foto na criacao. Assinatura nova,
-- entao a antiga sai antes.
drop function if exists public.criar_grupo(text);

create or replace function public.criar_grupo(p_nome text, p_exige_foto boolean default false)
returns json
language plpgsql
security definer
set search_path = public
as $$
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

  insert into groups (nome, dono_id, codigo_convite, exige_foto)
    values (left(trim(p_nome), 40), auth.uid(), v_codigo, coalesce(p_exige_foto, false))
    returning id into v_id;
  insert into group_members (group_id, user_id, papel)
    values (v_id, auth.uid(), 'dono');

  return json_build_object('ok', true, 'id', v_id, 'codigo', v_codigo);
end $$;

revoke execute on function public.criar_grupo(text, boolean) from public, anon, authenticated;
grant execute on function public.criar_grupo(text, boolean) to authenticated;

-- ------------------------------------------------- 9. check_in guarda o pago

-- Duas mudancas: recusa check-in sem foto quando o grupo exige, e grava o que
-- pagou junto com o estado anterior da ofensiva, para desfazer_check_in poder
-- devolver exatamente o que tirou.
create or replace function public.check_in(p_occ uuid, p_foto text default null)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  o occurrences; h habits; s streaks;
  v_ganho int; v_mult numeric; v_streak int;
  v_completou boolean := false; v_bau boolean := false;
  v_nos int := 0; v_primeiro_do_dia boolean;
  v_premio json; v_exige_foto boolean := false;
begin
  select * into o from occurrences where id = p_occ for update;

  if not found or o.user_id <> auth.uid() then
    return json_build_object('error', 'ocorrencia_invalida');
  end if;

  if coalesce(o.inicio_janela, o.data_sp) > public.hoje_sp() then
    return json_build_object('error', 'ocorrencia_futura');
  end if;

  -- Duas perguntas diferentes sobre a foto. A primeira e de quem e a pasta. A
  -- segunda e se o arquivo existe mesmo: sem ela, "exigir foto" virava exigir
  -- que a pessoa DIGITE um caminho, e um nome inventado dentro da propria pasta
  -- passava pela trava sem nenhuma imagem ter subido.
  if not public.foto_do_dono(p_foto, auth.uid()) then
    return json_build_object('error', 'foto_invalida');
  end if;

  if p_foto is not null
     and not exists (
       select 1 from storage.objects
        where bucket_id = 'checkins' and name = p_foto
     ) then
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

  -- Grupo que exige comprovacao: sem foto nao ha check-in. A trava vive aqui,
  -- no servidor, porque o botao da tela e contornavel chamando a RPC direto.
  if h.group_id is not null then
    select exige_foto into v_exige_foto from groups where id = h.group_id;
    if coalesce(v_exige_foto, false)
       and coalesce(p_foto, o.foto_path) is null then
      return json_build_object('error', 'foto_obrigatoria');
    end if;
  end if;

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
         proximo_toque_em = case when v_completou then null else proximo_toque_em end,
         -- Contabilidade do desfazer: quanto pagou e de onde a ofensiva veio.
         ouro_creditado = ouro_creditado + v_ganho,
         streak_anterior = coalesce(streak_anterior, coalesce(s.atual, 0)),
         data_streak_anterior = coalesce(data_streak_anterior, s.ultima_data_sp)
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
      v_premio := public.abrir_bau(o.user_id, v_nos);
      v_bau := true;
      -- Marca de qual no o bau saiu. E o que impede desfazer um check-in que ja
      -- pagou premio, que seria irreversivel do lado do acervo.
      update occurrences set bau_no = v_nos where id = p_occ;
    end if;
  end if;

  return json_build_object(
    'ouro_ganho', v_ganho + coalesce((v_premio->>'ouro')::int, 0),
    'ouro_bau', coalesce((v_premio->>'ouro')::int, 0),
    'premio', v_premio,
    'streak', v_streak,
    'multiplicador', v_mult,
    'completou', v_completou,
    'vezes_feitas', o.vezes_feitas + 1,
    'vezes_alvo', o.vezes_alvo,
    'bau', v_bau,
    'no', v_nos
  );
end $$;

revoke execute on function public.check_in(uuid, text) from public, anon, authenticated;
grant execute on function public.check_in(uuid, text) to authenticated;

-- --------------------------------------------------- 10. desfazer o check-in

-- Marcou errado, desmarca. Devolve o ouro que aquele check-in pagou e recoloca
-- a ofensiva onde estava. Se o check-in abriu bau, nao desfaz: o item sorteado
-- ja entrou no acervo e desfazer viraria maquina de repetir sorteio.
create or replace function public.desfazer_check_in(p_occ uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare o occurrences; v_ouro int;
begin
  select * into o from occurrences where id = p_occ for update;

  if not found or o.user_id <> auth.uid() then
    return json_build_object('error', 'ocorrencia_invalida');
  end if;

  if o.vezes_feitas = 0 then
    return json_build_object('error', 'nao_estava_feito');
  end if;

  if o.bau_no is not null then
    return json_build_object('error', 'bau_aberto');
  end if;

  -- So o dia corrente. Desmarcar o passado mexeria em ofensiva ja fechada e em
  -- ranking que os outros ja viram.
  if o.data_sp <> public.hoje_sp() then
    return json_build_object('error', 'fora_do_dia');
  end if;

  -- Check-in sem contabilidade gravada e de antes desta migration. Estornar
  -- zero e devolver a ocorrencia para pendente deixaria ela pagar de novo, que
  -- e ouro do nada. Recusar e a unica resposta honesta.
  if o.ouro_creditado = 0 then
    return json_build_object('error', 'sem_contabilidade');
  end if;

  -- Se a pessoa ja gastou o ouro, desfazer nao pode "perdoar" a diferenca. Um
  -- clamp em zero aqui era maquina de ouro infinita: resgatar premio ate zerar,
  -- desmarcar, marcar de novo, repetir.
  if (select ouro from profiles where id = o.user_id) < o.ouro_creditado then
    return json_build_object('error', 'saldo_gasto');
  end if;

  update profiles
     set ouro = ouro - o.ouro_creditado,
         xp = greatest(0, xp - o.ouro_creditado)
   where id = o.user_id
   returning ouro into v_ouro;

  update occurrences
     set vezes_feitas = 0,
         status = 'pendente',
         feito_em = null,
         ouro_creditado = 0,
         streak_anterior = null,
         data_streak_anterior = null
   where id = p_occ;

  -- A ofensiva volta ao valor de antes deste check-in. `melhor` fica: recorde
  -- e historia, nao saldo.
  update streaks
     set atual = coalesce(o.streak_anterior, 0),
         ultima_data_sp = o.data_streak_anterior
   where habit_id = o.habit_id and user_id = o.user_id;

  return json_build_object('ok', true, 'ouro', v_ouro, 'ouro_devolvido', o.ouro_creditado);
end $$;

revoke execute on function public.desfazer_check_in(uuid) from public, anon, authenticated;
grant execute on function public.desfazer_check_in(uuid) to authenticated;

-- ----------------------------------------- 11. atraso registra o que fez

-- Mesma logica de antes, com uma linha de historico por evento. A barra de vida
-- deixava de explicar por que caiu, e o usuario nao tinha como saber.
create or replace function public.marcar_atrasadas()
returns int
language plpgsql
security definer
set search_path = public
as $$
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

  insert into vida_eventos (user_id, delta, vida_depois, motivo)
  select p.id, -(10 * v.perdidas), p.vida, 'atraso'
    from profiles p
    join (select user_id, count(*)::int as perdidas from tmp_venceu group by 1) v
      on v.user_id = p.id;

  update streaks s set atual = 0
    from tmp_venceu v
   where s.habit_id = v.habit_id and s.user_id = v.user_id;

  update streaks s set atual = 0
   where s.user_id in (select id from profiles where vida = 0);

  insert into vida_eventos (user_id, delta, vida_depois, motivo)
  select id, 50, 50, 'renascimento' from profiles where vida = 0;

  update profiles set vida = 50 where vida = 0;

  return v_total;
end $$;

revoke execute on function public.marcar_atrasadas() from public, anon, authenticated;

-- ---------------------------------------------- 12. marcar notificacao lida

create or replace function public.marcar_notificacoes_lidas(p_id uuid default null)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare v_qtd int;
begin
  update notificacoes
     set lida_em = now()
   where user_id = auth.uid()
     and lida_em is null
     and (p_id is null or id = p_id);

  get diagnostics v_qtd = row_count;

  return json_build_object('ok', true, 'marcadas', v_qtd);
end $$;

revoke execute on function public.marcar_notificacoes_lidas(uuid) from public, anon, authenticated;
grant execute on function public.marcar_notificacoes_lidas(uuid) to authenticated;

-- ------------------------- 13. o check-in pela notificacao tambem contabiliza

-- `check_in_por_token` e o botao Concluir dentro da propria notificacao. Ele
-- pagava ouro sem gravar `ouro_creditado`, e `desfazer_check_in` devolvia zero
-- e reabria a ocorrencia para pagar de novo. Era ouro do nada, repetivel todo
-- dia, justamente no caminho que o produto mais empurra.
create or replace function public.check_in_por_token(p_token uuid, p_acao text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  o occurrences; h habits; s streaks;
  v_ganho int; v_mult numeric; v_streak int; v_completou boolean;
  v_bau boolean := false; v_nos int := 0; v_primeiro boolean;
  v_premio json;
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
         token_rapido = gen_random_uuid(),
         ouro_creditado = ouro_creditado + v_ganho,
         streak_anterior = coalesce(streak_anterior, coalesce(s.atual, 0)),
         data_streak_anterior = coalesce(data_streak_anterior, s.ultima_data_sp)
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
      v_premio := public.abrir_bau(o.user_id, v_nos);
      v_bau := true;
      update occurrences set bau_no = v_nos where id = o.id;
    end if;
  end if;

  return json_build_object(
    'ouro_ganho', v_ganho + coalesce((v_premio->>'ouro')::int, 0),
    'ouro_bau', coalesce((v_premio->>'ouro')::int, 0),
    'premio', v_premio,
    'streak', v_streak,
    'completou', v_completou,
    'bau', v_bau
  );
end $$;

revoke execute on function public.check_in_por_token(uuid, text) from public, anon, authenticated;

-- ------------------------------------------------- 14. furos de privilegio

-- `anon` continuava com INSERT e DELETE em profiles. Hoje segura porque nao ha
-- policy para esses comandos, mas fica a uma policy nova de distancia do furo.
-- A 0008 revogou so de `authenticated`.
revoke insert, delete on public.profiles from public, anon;

-- `habits` tambem: as colunas novas `tipo` e `pune_ouro` herdaram INSERT e
-- UPDATE de tabela para anon e authenticated. Hoje so nao e explorado por
-- acidente, porque o CHECK da tabela chama `regra_valida`, cuja execucao o
-- cliente nao tem. Um `grant execute` futuro nessa funcao abriria escrita
-- direta em `tipo`, `pune_ouro`, `escopo` e `group_id`, driblando as RPCs.
-- Toda escrita em habits ja passa por RPC `security definer`, entao nao ha
-- nada do lado do cliente para quebrar aqui.
revoke insert, update, delete on public.habits from public, anon, authenticated;

-- `rewards` mantem a escrita para `authenticated`, porque a Loja cadastra e
-- arquiva premio direto pela tabela, com a policy `p_rewards_own` de gate. O
-- que sai e o privilegio de `anon`, que nunca deveria ter existido.
revoke insert, update, delete on public.rewards from public, anon;

-- `notificacoes.url` alimenta `navegar(url)` na tela. Hoje so o push-dispatch
-- escreve, com caminho gerado no servidor, mas uma coluna text livre que vira
-- destino de navegacao e um redirecionamento aberto esperando o dia em que
-- outro caminho passar a escrever nela.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'notificacoes_url_interna') then
    alter table public.notificacoes
      add constraint notificacoes_url_interna
      check (url is null or url ~ '^/[^/]');
  end if;
end $$;

-- O default de avatar_base era 'base-01', um id que so existe entre as bases
-- antigas desativadas. Quem passava pelo onboarding sem tocar em nenhum boneco
-- saia com um personagem que nao aparece em lugar nenhum da loja, e sem direito
-- a nova escolha gratis. O default agora e uma peca viva do catalogo.
alter table public.profiles alter column avatar_base set default 'pes-5';

-- `trocar_personagem` saia cedo no ramo "ja esta vestido" sem gravar a posse. O
-- usuario que confirmava o personagem padrao do onboarding ficava vestindo uma
-- peca que a loja mostrava como nao comprada, com preco ao lado. Nao chegava a
-- cobrar, porque este mesmo ramo devolve custo zero, mas a tela mentia o preco.
create or replace function public.trocar_personagem(p_base text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_p profiles;
  v_item avatar_items;
  v_possui boolean;
  v_custo integer := 0;
  v_teto_gratis constant integer := 200;
begin
  select * into v_p from profiles where id = auth.uid() for update;
  if not found then return json_build_object('error', 'sem_perfil'); end if;

  select * into v_item from avatar_items where id = p_base and slot = 'personagem';
  if not found then return json_build_object('error', 'base_invalida'); end if;

  -- Reconfirmar quem ja esta vestido nao cobra, mas grava a posse.
  if p_base = v_p.avatar_base then
    update profiles set personagem_definido = true where id = auth.uid();
    insert into owned_items (user_id, item_id) values (auth.uid(), p_base)
      on conflict do nothing;
    return json_build_object('ok', true, 'base', p_base, 'custo', 0, 'ouro', v_p.ouro);
  end if;

  v_possui := exists (select 1 from owned_items
                       where user_id = auth.uid() and item_id = p_base);

  if not v_possui
     and (v_p.personagem_definido or v_item.custo_ouro > v_teto_gratis) then
    v_custo := v_item.custo_ouro;
    if v_p.ouro < v_custo then
      return json_build_object('error', 'ouro_insuficiente');
    end if;
  end if;

  update profiles
     set avatar_base = p_base, personagem_definido = true, ouro = ouro - v_custo
   where id = auth.uid();
  insert into owned_items (user_id, item_id) values (auth.uid(), p_base)
    on conflict do nothing;

  return json_build_object('ok', true, 'base', p_base, 'custo', v_custo,
                           'ouro', v_p.ouro - v_custo);
end $$;

revoke execute on function public.trocar_personagem(text) from public, anon, authenticated;
grant execute on function public.trocar_personagem(text) to authenticated;
