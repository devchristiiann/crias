-- 0023 Modulos de rotina: acordar, dormir e beber agua.
--
-- O icone deixa de ser enfeite e vira o tipo da rotina. Tres assuntos:
--   1. Faixa de horario: acordar as 6 vale mais que acordar as 8, e depois da
--      ultima faixa o check-in e recusado. Quem decide e o relogio do servidor.
--   2. Agua: varias marcacoes no dia, ouro uma vez so ao fechar o dia.
--   3. Multialarme: a rotina de agua dispara os alarmes dela e nao herda a
--      escada de toques, que somada daria 9 notificacoes num dia sozinha.

-- ---------------------------------------------------------------- 1. colunas

alter table public.habits
  add column if not exists modulo text not null default 'livre',
  add column if not exists config jsonb not null default '{}'::jsonb;

-- Contagem propria dos alarmes do dia. Nao reusar os bits de `toques_enviados`:
-- cada bit ali tem significado (1 lembrete, 2 cutucada, 4 noite, 8
-- consequencia) e um contador em cima deles colidiria com a escada.
alter table public.occurrences
  add column if not exists alarmes_enviados smallint not null default 0;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'habits_modulo_check') then
    alter table public.habits
      add constraint habits_modulo_check
      check (modulo in ('livre', 'acordar', 'dormir', 'agua'));
  end if;
  -- Modulo e sempre rotina a fazer. Habito de perda nao tem faixa nem copo.
  if not exists (select 1 from pg_constraint where conname = 'habits_modulo_bom') then
    alter table public.habits
      add constraint habits_modulo_bom check (modulo = 'livre' or tipo = 'bom');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'occurrences_alarmes_check') then
    alter table public.occurrences
      add constraint occurrences_alarmes_check check (alarmes_enviados >= 0);
  end if;
end $$;

-- ------------------------------------------------------- 2. validacao de config

-- Minuto do dia de um 'HH:MM', normalizado por modulo. Em `dormir`, horario
-- abaixo de 06:00 e madrugada do dia seguinte e vale 1440 a mais: sem isso o
-- modulo nasceria quebrado para quem dorme 00h30, que e a maioria do publico,
-- porque 00:30 pareceria vir ANTES de 23:00 em qualquer comparacao de texto.
create or replace function public.minutos_faixa(p_modulo text, p_hora text)
returns int
language sql
immutable
as $$
  select case
    when p_hora is null or p_hora !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then null
    when p_modulo = 'dormir' and left(p_hora, 2)::int < 6
      then left(p_hora, 2)::int * 60 + right(p_hora, 2)::int + 1440
    else left(p_hora, 2)::int * 60 + right(p_hora, 2)::int
  end
$$;

-- Mesmo papel de `regra_valida` (0007:7): o Zod do front protege a UI, esta
-- funcao protege o dado. Quem chama a API direto passa so por aqui.
create or replace function public.config_valida(p_modulo text, p_config jsonb)
returns boolean
language plpgsql
immutable
as $$
declare
  e jsonb;
  v_n int;
  v_vezes int;
  v_hora text;
  v_ouro int;
  v_min int;
  v_min_ant int := -1;
  v_ouro_ant int := 11;
begin
  if p_config is null or jsonb_typeof(p_config) <> 'object' then
    return false;
  end if;

  if p_modulo = 'livre' then
    return p_config = '{}'::jsonb;
  end if;

  if p_modulo in ('acordar', 'dormir') then
    -- Chave desconhecida e config invalida: o front nao inventa campo.
    if (select count(*) from jsonb_object_keys(p_config)) <> 1
       or jsonb_typeof(p_config->'faixas') <> 'array' then
      return false;
    end if;

    v_n := jsonb_array_length(p_config->'faixas');
    if v_n < 1 or v_n > 4 then
      return false;
    end if;

    for e in select * from jsonb_array_elements(p_config->'faixas') loop
      if jsonb_typeof(e) <> 'object'
         or (select count(*) from jsonb_object_keys(e)) <> 2
         or jsonb_typeof(e->'ate') <> 'string'
         or jsonb_typeof(e->'ouro') <> 'number' then
        return false;
      end if;

      v_hora := e->>'ate';
      v_min := public.minutos_faixa(p_modulo, v_hora);
      if v_min is null then
        return false;
      end if;

      -- acordar: 00:00 a 11:59. dormir: 18:00 a 23:59, ou 00:00 a 05:59, que
      -- ja chega aqui somado de 1440.
      if p_modulo = 'acordar' and v_min > 719 then
        return false;
      end if;
      if p_modulo = 'dormir' and (v_min < 1080 or v_min > 1799) then
        return false;
      end if;

      v_ouro := (e->>'ouro')::int;
      if v_ouro < 1 or v_ouro > 10 then
        return false;
      end if;

      -- Horario crescente, sem repetir. Ouro nunca sobe: faixa mais tarde
      -- nunca paga mais que uma mais cedo.
      if v_min <= v_min_ant or v_ouro > v_ouro_ant then
        return false;
      end if;

      v_min_ant := v_min;
      v_ouro_ant := v_ouro;
    end loop;

    return true;
  end if;

  if p_modulo = 'agua' then
    if (select count(*) from jsonb_object_keys(p_config)) <> 2
       or jsonb_typeof(p_config->'vezes') <> 'number'
       or jsonb_typeof(p_config->'lembretes') <> 'array' then
      return false;
    end if;

    v_vezes := (p_config->>'vezes')::int;
    if v_vezes < 2 or v_vezes > 10 then
      return false;
    end if;

    -- Pode ter menos horarios que copos, ou nenhum. Nunca mais.
    if jsonb_array_length(p_config->'lembretes') > v_vezes then
      return false;
    end if;

    for e in select * from jsonb_array_elements(p_config->'lembretes') loop
      if jsonb_typeof(e) <> 'string' then
        return false;
      end if;
      v_min := public.minutos_faixa('agua', e #>> '{}');
      if v_min is null or v_min <= v_min_ant then
        return false;
      end if;
      v_min_ant := v_min;
    end loop;

    return true;
  end if;

  return false;
end $$;

alter table public.habits drop constraint if exists habits_config_valida;
alter table public.habits add constraint habits_config_valida
  check (public.config_valida(modulo, config));

-- Mesma trava de `regra_valida`: o cliente nao tem EXECUTE, entao um INSERT
-- direto em habits nem chega a avaliar o CHECK. Toda escrita passa por RPC.
revoke execute on function public.minutos_faixa(text, text) from public, anon, authenticated;
revoke execute on function public.config_valida(text, jsonb) from public, anon, authenticated;

-- ------------------------------------------------------------ 3. criar_habito

-- Parametros novos no FIM da assinatura, com default: chamada antiga continua
-- funcionando. `create or replace` criaria sobrecarga ambigua, entao a antiga
-- sai antes.
drop function if exists public.criar_habito(text, jsonb, text, time, int, uuid, text, boolean);

create or replace function public.criar_habito(
  p_titulo text,
  p_regra jsonb,
  p_icone text default 'target',
  p_lembrete time default null,
  p_ouro_base int default 10,
  p_group_id uuid default null,
  p_tipo text default 'bom',
  p_pune_ouro boolean default false,
  p_modulo text default 'livre',
  p_config jsonb default '{}'::jsonb
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid; v_tipo text; v_regra jsonb; v_lembrete time;
  v_modulo text; v_config jsonb; v_ouro int; v_icone text;
begin
  v_tipo := coalesce(nullif(trim(p_tipo), ''), 'bom');
  v_modulo := coalesce(nullif(trim(p_modulo), ''), 'livre');
  v_config := coalesce(p_config, '{}'::jsonb);

  if v_tipo not in ('bom', 'ruim') then
    return json_build_object('error', 'tipo_invalido');
  end if;

  if v_modulo not in ('livre', 'acordar', 'dormir', 'agua') then
    return json_build_object('error', 'modulo_invalido');
  end if;

  if coalesce(trim(p_titulo), '') = '' then
    return json_build_object('error', 'titulo_vazio');
  end if;

  -- Modulo e sempre rotina a fazer, e o modulo manda no tipo.
  if v_modulo <> 'livre' then
    v_tipo := 'bom';
  end if;

  if not public.config_valida(v_modulo, v_config) then
    return json_build_object('error', 'config_invalida');
  end if;

  if v_tipo = 'ruim' then
    v_regra := '{"tipo":"diaria"}'::jsonb;
    v_lembrete := null;
  elsif v_modulo <> 'livre' then
    -- Modulo nao tem editor de frequencia: acontece todo dia.
    v_regra := '{"tipo":"diaria"}'::jsonb;
    -- Agua nao herda a escada de toques: ela tem os alarmes dela, e o
    -- `lembrete_hora` preenchido ligaria o toque de lembrete por cima.
    v_lembrete := case when v_modulo = 'agua' then null else p_lembrete end;
  else
    v_regra := p_regra;
    v_lembrete := p_lembrete;
    if not public.regra_valida(v_regra) then
      return json_build_object('error', 'frequencia_invalida');
    end if;
  end if;

  -- Em modulo de horario o ouro sai da primeira faixa, nao do formulario: o
  -- resto do sistema continua lendo `ouro_base` sem saber de faixa nenhuma.
  v_ouro := case
    when v_modulo in ('acordar', 'dormir')
      then (v_config->'faixas'->0->>'ouro')::int
    else p_ouro_base
  end;

  if v_ouro is null or v_ouro < 1 or v_ouro > 10 then
    return json_build_object('error', 'ouro_base_invalido');
  end if;

  -- Icone do modulo e fixo, nao e escolhivel.
  v_icone := case v_modulo
    when 'acordar' then 'sunrise'
    when 'dormir' then 'moon'
    when 'agua' then 'droplets'
    else coalesce(nullif(trim(p_icone), ''), 'target')
  end;

  if p_group_id is not null and not public.e_membro(p_group_id) then
    return json_build_object('error', 'grupo_invalido');
  end if;

  if p_group_id is not null and v_tipo = 'ruim'
     and not exists (select 1 from groups where id = p_group_id and dono_id = auth.uid()) then
    return json_build_object('error', 'grupo_invalido');
  end if;

  insert into habits (
    escopo, group_id, user_id, titulo, icone, regra_frequencia,
    lembrete_hora, ouro_base, tipo, pune_ouro, modulo, config
  )
  values (
    case when p_group_id is null then 'user' else 'group' end,
    p_group_id,
    case when p_group_id is null then auth.uid() else null end,
    left(trim(p_titulo), 80),
    v_icone,
    v_regra,
    v_lembrete,
    v_ouro,
    v_tipo,
    coalesce(p_pune_ouro, false),
    v_modulo,
    v_config
  )
  returning id into v_id;

  if v_tipo = 'bom' then
    perform public.gerar_ocorrencias(7);
  end if;

  return json_build_object('ok', true, 'id', v_id);
end $$;

revoke execute on function
  public.criar_habito(text, jsonb, text, time, int, uuid, text, boolean, text, jsonb)
  from public, anon, authenticated;
grant execute on function
  public.criar_habito(text, jsonb, text, time, int, uuid, text, boolean, text, jsonb)
  to authenticated;

-- ------------------------------------------------------ 4. gerar_ocorrencias

-- Quatro mudancas: a ocorrencia de modulo de horario vence no fim da ULTIMA
-- faixa, nao as 23:59; o dia corrente nao gera ocorrencia de horario quando
-- essa faixa ja passou; agua traz `vezes_alvo` de `config.vezes`; e o primeiro
-- alarme da agua vira o `proximo_toque_em`.
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
      h.modulo,
      h.config,
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
  ),
  -- `vence_em` sai calculado aqui, uma vez so: e o mesmo valor que vai para a
  -- coluna e que decide o corte do dia corrente logo abaixo. Recalcular a hora
  -- da faixa por outro caminho e como os dois divergiriam, e no `dormir` a
  -- faixa de madrugada ja vem somada de 1440 por `minutos_faixa`.
  calculado as (
    select f.*,
      case
        when f.modulo in ('acordar', 'dormir') then
          ((f.data_sp::timestamp
            + (public.minutos_faixa(
                 f.modulo,
                 f.config->'faixas'->(jsonb_array_length(f.config->'faixas') - 1)->>'ate'
               ) * interval '1 minute'))
            at time zone 'America/Sao_Paulo')
        else ((f.data_sp + time '23:59') at time zone 'America/Sao_Paulo')
      end as vence_em
    from filtrado f
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
    vence_em,
    case
      when modulo = 'agua' then
        case when jsonb_array_length(config->'lembretes') > 0
          then ((data_sp + (config->'lembretes'->>0)::time) at time zone 'America/Sao_Paulo')
          else null end
      when lembrete_hora is null then null
      else ((data_sp + lembrete_hora) at time zone 'America/Sao_Paulo')
    end,
    case
      when modulo = 'agua' then (config->>'vezes')::smallint
      when regra->>'tipo' = 'n_por_semana' then (regra->>'vezes')::smallint
      when regra->>'tipo' = 'n_por_mes' then (regra->>'vezes')::smallint
      else 1::smallint
    end
  from calculado
  where user_id is not null
    -- Modulo de horario nao ganha a ocorrencia de um dia cuja ultima faixa ja
    -- passou: ela nasceria vencida e, sem a folga de 24h, o proximo
    -- `marcar_atrasadas` cobraria 10 de vida de quem acabou de criar a rotina.
    -- So o dia corrente cai aqui, porque a serie comeca em `hoje_sp()`.
    and not (modulo in ('acordar', 'dormir') and vence_em <= now())
  on conflict (habit_id, user_id, data_sp) do nothing;

  get diagnostics inseridas = row_count;
  return inseridas;
end $$;

revoke execute on function public.gerar_ocorrencias(int) from public, anon, authenticated;

-- --------------------------------------------------------------- 5. check_in

-- Quatro mudancas: faixa de horario decidida pelo relogio do servidor, foto
-- obrigatoria nos modulos de horario, ouro da agua so ao fechar o dia, e o bau
-- contando a partir de `bau_base`.
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
  v_nos int := 0; v_no int := 0; v_primeiro_do_dia boolean;
  v_premio json; v_exige_foto boolean := false;
  v_base int; v_ouro_faixa int; v_agora int; v_piso int;
  v_parcial boolean := false;
begin
  select * into o from occurrences where id = p_occ for update;

  if not found or o.user_id <> auth.uid() then
    return json_build_object('error', 'ocorrencia_invalida');
  end if;

  if coalesce(o.inicio_janela, o.data_sp) > public.hoje_sp() then
    return json_build_object('error', 'ocorrencia_futura');
  end if;

  -- Duas perguntas diferentes sobre a foto: de quem e a pasta, e se o arquivo
  -- existe mesmo. Sem a segunda, "exigir foto" virava exigir que a pessoa
  -- DIGITE um caminho.
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

  -- Acordar e dormir exigem foto SEMPRE, independente do grupo. A foto e prova
  -- social; a prova do horario e o relogio do servidor.
  if h.modulo in ('acordar', 'dormir') then
    v_exige_foto := true;
  elsif h.group_id is not null then
    select exige_foto into v_exige_foto from groups where id = h.group_id;
  end if;

  if coalesce(v_exige_foto, false) and coalesce(p_foto, o.foto_path) is null then
    return json_build_object('error', 'foto_obrigatoria');
  end if;

  v_base := h.ouro_base;

  -- Faixa de horario. `v_agora` e o minuto desde a meia-noite do DIA DA
  -- OCORRENCIA, entao a madrugada seguinte passa de 1440 sozinha e casa com a
  -- normalizacao de `minutos_faixa` para o modulo dormir.
  if h.modulo in ('acordar', 'dormir') then
    v_agora := floor(extract(epoch from
                 ((now() at time zone 'America/Sao_Paulo') - o.data_sp::timestamp)) / 60)::int;
    -- Dormir cedo so comeca a valer as 18:00. Sem esse piso, marcar as 10 da
    -- manha casaria com a faixa das 23:00 e pagaria o valor cheio.
    v_piso := case when h.modulo = 'dormir' then 1080 else 0 end;

    select (f.e->>'ouro')::int into v_ouro_faixa
      from jsonb_array_elements(h.config->'faixas') with ordinality f(e, ord)
     where v_agora >= v_piso
       and v_agora <= public.minutos_faixa(h.modulo, f.e->>'ate')
     order by f.ord
     limit 1;

    if v_ouro_faixa is null then
      return json_build_object('error', 'fora_da_faixa');
    end if;

    v_base := v_ouro_faixa;
  end if;

  v_primeiro_do_dia := not exists (
    select 1 from occurrences
     where user_id = o.user_id and data_sp = o.data_sp
       and status = 'feito' and id <> o.id
  );

  v_completou := (o.vezes_feitas + 1) >= o.vezes_alvo;
  v_parcial := (h.modulo = 'agua' and not v_completou);

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
  -- Agua paga uma vez so, ao fechar o dia. Marcacao parcial paga zero. Isso
  -- vale so para o modulo agua: "N vezes por semana" continua pagando por
  -- marcacao, como sempre pagou.
  v_ganho := case when v_parcial then 0 else ceil(v_base * v_mult) end;

  update occurrences
     set vezes_feitas = o.vezes_feitas + 1,
         status = case when v_completou then 'feito' else status end,
         feito_em = case when v_completou then now() else feito_em end,
         foto_path = coalesce(p_foto, foto_path),
         proximo_toque_em = case when v_completou then null else proximo_toque_em end,
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

  -- O bau conta a partir de `bau_base`: vida zerada joga o progresso fora sem
  -- apagar historico. A chave gravada em `baus` continua sendo a contagem
  -- TOTAL, que so cresce, e e ela que impede o mesmo no pagar duas vezes.
  if v_completou and v_primeiro_do_dia then
    select count(distinct data_sp) into v_nos
      from occurrences where user_id = o.user_id and status = 'feito';
    v_no := v_nos - coalesce((select bau_base from profiles where id = o.user_id), 0);
    if v_no > 0 and v_no % 7 = 0 then
      v_premio := public.abrir_bau(o.user_id, v_nos);
      v_bau := true;
      -- `bau_no` so quando o bau PAGOU. No repetido (0017:151) devolve
      -- `repetido: true`, zero de ouro e nenhum item novo, e gravar a marca
      -- ali trancaria o `desfazer_check_in` com `bau_aberto` para sempre por
      -- um premio que nunca saiu.
      if not coalesce((v_premio->>'repetido')::boolean, false) then
        update occurrences set bau_no = v_nos where id = p_occ;
      end if;
    end if;
  end if;

  return json_build_object(
    'ouro_ganho', v_ganho + coalesce((v_premio->>'ouro')::int, 0),
    'ouro_bau', coalesce((v_premio->>'ouro')::int, 0),
    'ouro_faixa', v_ouro_faixa,
    'parcial', v_parcial,
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

-- ------------------------------------------------- 6. check_in pela notificacao

-- Toda regra nova precisa existir aqui tambem: este caminho ja foi a porta dos
-- fundos deste projeto uma vez, pagando ouro sem gravar `ouro_creditado`.
--
-- Rotina que exige foto e recusada aqui de proposito: o Concluir da notificacao
-- nao tem como enviar foto, e aceitar sem ela transformaria a exigencia num
-- botao contornavel.
create or replace function public.check_in_por_token(p_token uuid, p_acao text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  o occurrences; h habits; s streaks;
  v_ganho int; v_mult numeric; v_streak int; v_completou boolean;
  v_bau boolean := false; v_nos int := 0; v_no int := 0; v_primeiro boolean;
  v_premio json; v_exige_foto boolean := false;
  v_base int; v_ouro_faixa int; v_agora int; v_piso int;
  v_parcial boolean := false;
begin
  select * into o from occurrences where token_rapido = p_token for update;
  if not found then
    return json_build_object('error', 'token_invalido');
  end if;

  if coalesce(o.inicio_janela, o.data_sp) > public.hoje_sp() then
    return json_build_object('error', 'ocorrencia_futura');
  end if;

  if o.status = 'feito' then
    return json_build_object('ja_feito', true, 'ouro_ganho', 0,
      'streak', coalesce((select atual from streaks
                           where habit_id = o.habit_id and user_id = o.user_id), 0));
  end if;

  -- Adiar vem DEPOIS da conferencia de status, nunca antes. A notificacao velha
  -- de uma rotina ja concluida continua na bandeja, e adiar por ela reescrevia
  -- `proximo_toque_em` numa ocorrencia feita: o `check_in` zera esse campo ao
  -- concluir justamente para calar os toques seguintes, e o Adiar ressuscitava
  -- a notificacao de uma tarefa que ja estava pronta.
  if p_acao = 'adiar' then
    update occurrences
       set proximo_toque_em = least(now() + interval '1 hour', vence_em),
           token_rapido = gen_random_uuid()
     where id = o.id;
    return json_build_object('ok', true, 'adiado', true);
  end if;

  select * into h from habits where id = o.habit_id;
  select * into s from streaks where habit_id = o.habit_id and user_id = o.user_id;

  if h.modulo in ('acordar', 'dormir') then
    v_exige_foto := true;
  elsif h.group_id is not null then
    select exige_foto into v_exige_foto from groups where id = h.group_id;
  end if;

  if coalesce(v_exige_foto, false) and o.foto_path is null then
    -- Token gira mesmo na recusa: ele e de uso unico.
    update occurrences set token_rapido = gen_random_uuid() where id = o.id;
    return json_build_object('error', 'foto_obrigatoria');
  end if;

  v_base := h.ouro_base;

  if h.modulo in ('acordar', 'dormir') then
    v_agora := floor(extract(epoch from
                 ((now() at time zone 'America/Sao_Paulo') - o.data_sp::timestamp)) / 60)::int;
    v_piso := case when h.modulo = 'dormir' then 1080 else 0 end;

    select (f.e->>'ouro')::int into v_ouro_faixa
      from jsonb_array_elements(h.config->'faixas') with ordinality f(e, ord)
     where v_agora >= v_piso
       and v_agora <= public.minutos_faixa(h.modulo, f.e->>'ate')
     order by f.ord
     limit 1;

    if v_ouro_faixa is null then
      update occurrences set token_rapido = gen_random_uuid() where id = o.id;
      return json_build_object('error', 'fora_da_faixa');
    end if;

    v_base := v_ouro_faixa;
  end if;

  v_primeiro := not exists (
    select 1 from occurrences
     where user_id = o.user_id and data_sp = o.data_sp and status = 'feito' and id <> o.id
  );
  v_completou := (o.vezes_feitas + 1) >= o.vezes_alvo;
  v_parcial := (h.modulo = 'agua' and not v_completou);

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
  v_ganho := case when v_parcial then 0 else ceil(v_base * v_mult) end;

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
    v_no := v_nos - coalesce((select bau_base from profiles where id = o.user_id), 0);
    if v_no > 0 and v_no % 7 = 0 then
      v_premio := public.abrir_bau(o.user_id, v_nos);
      v_bau := true;
      -- Mesma regra do `check_in`: no repetido nao paga, entao nao marca.
      if not coalesce((v_premio->>'repetido')::boolean, false) then
        update occurrences set bau_no = v_nos where id = o.id;
      end if;
    end if;
  end if;

  return json_build_object(
    'ouro_ganho', v_ganho + coalesce((v_premio->>'ouro')::int, 0),
    'ouro_bau', coalesce((v_premio->>'ouro')::int, 0),
    'ouro_faixa', v_ouro_faixa,
    'parcial', v_parcial,
    'premio', v_premio,
    'streak', v_streak,
    'completou', v_completou,
    'bau', v_bau
  );
end $$;

revoke execute on function public.check_in_por_token(uuid, text) from public, anon, authenticated;

-- ------------------------------------------- 7. desmarcar copo solto de agua

-- O botao "Marcar como nao feito" aparece a partir da primeira marcacao
-- (FolhaDesafio.tsx:296, condicao `temMarcacao`). Em agua a marcacao parcial
-- paga zero de proposito (secao 5, `v_parcial`), entao esse botao so devolvia
-- `sem_contabilidade`: um botao que existe para dar erro.
--
-- O ramo novo desconta uma marcacao e para por ai. Nao toca ouro, xp, ofensiva,
-- bau nem vida porque nada disso aconteceu.
--
-- Por que isso NAO reabre o furo que o `sem_contabilidade` fecha (0019:685):
--   1. Aquele furo era ocorrencia CONCLUIDA que pagou ouro sem gravar
--      `ouro_creditado` (o `check_in_por_token` antigo). Voltar ela para
--      pendente deixava pagar de novo. O ramo aqui exige `status <> 'feito'`,
--      entao nenhuma ocorrencia concluida passa por ele.
--   2. Em agua o pagamento so existe na conclusao: `v_ganho` e zero enquanto
--      `v_parcial`, e `v_parcial` e exatamente `not v_completou`. Marcacao
--      parcial com `ouro_creditado = 0` nunca pagou nada, entao decrementar o
--      contador nao pode gerar um segundo pagamento: a conclusao futura
--      continua sendo a primeira e unica.
--   3. Rotina de `n_por_semana` e `n_por_mes` nao cai aqui. Elas pagam por
--      marcacao, e `ceil(ouro_base * multiplicador)` com `ouro_base >= 1` e
--      multiplicador `>= 1.0` nunca da zero: `ouro_creditado > 0` e elas
--      seguem pelo caminho antigo, com o estorno inteiro.
--   4. Marcacao parcial anterior a 0019 (que pagava sem gravar) nao chega
--      neste ponto: o `fora_do_dia` acima ja recusou tudo que nao e de hoje.
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

  -- Marcacao que nunca pagou: devolve o copo e mais nada. Ver o cabecalho.
  if o.status <> 'feito' and o.vezes_feitas > 0 and o.ouro_creditado = 0 then
    update occurrences set vezes_feitas = vezes_feitas - 1 where id = p_occ;
    return json_build_object(
      'ok', true,
      'ouro', (select ouro from profiles where id = o.user_id),
      'ouro_devolvido', 0,
      'vezes_feitas', o.vezes_feitas - 1
    );
  end if;

  -- Check-in sem contabilidade gravada e de antes da 0019. Estornar zero e
  -- devolver a ocorrencia para pendente deixaria ela pagar de novo, que e ouro
  -- do nada. Recusar e a unica resposta honesta.
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

-- ------------------------------------------------------------- 8. multialarme

-- O teto so e teto se contar tudo que sai. Alarme de agua nao acende bit
-- nenhum, entao sem somar `alarmes_enviados` o limite viraria mentira.
create or replace function public.toques_do_dia(p_user uuid, p_data date)
returns int language sql stable as $$
  select coalesce(sum(bit_count(toques_enviados::int::bit(32)) + alarmes_enviados), 0)::int
    from public.occurrences
   where user_id = p_user and data_sp = p_data
$$;

-- `p_bit = 0` e o alarme de multialarme: ele nao acende bit do bitmask, so
-- avanca o contador proprio. `| 0` deixa a mascara intacta.
create or replace function public.registrar_toque(
  p_occ uuid,
  p_bit int,
  p_proximo timestamptz
) returns void language sql security definer set search_path = public as $$
  update public.occurrences
     set toques_enviados = toques_enviados | p_bit,
         alarmes_enviados = alarmes_enviados + (case when p_bit = 0 then 1 else 0 end),
         proximo_toque_em = p_proximo
   where id = p_occ
$$;

-- Rotina de multialarme dispara so os alarmes dela, mais a consequencia quando
-- vence. Herdar a escada faria uma rotina de 5 alarmes mandar 9 notificacoes
-- num dia sozinha.
--
-- O toque se chama 'alarme' e tem copy propria: cinco notificacoes por dia com
-- a frase do lembrete comum e o caminho mais curto para a pessoa desligar o
-- push. Por isso a funcao devolve tambem o progresso do dia (`vezes_feitas` e
-- `vezes_alvo`), que e o numero concreto da frase. O bit continua 0: alarme nao
-- acende bit do bitmask, so avanca `alarmes_enviados`.
drop function if exists public.toques_pendentes(int);

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
  vezes_feitas int,
  vezes_alvo int,
  endpoint text,
  p256dh text,
  auth text
)
language sql stable security definer set search_path = public as $$
  with candidatas as (
    select o.*, h.titulo, h.group_id, h.lembrete_hora, h.ouro_base,
           h.modulo, h.config,
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
        when c.modulo = 'agua'
             and c.alarmes_enviados < jsonb_array_length(c.config->'lembretes') then 'alarme'
        when c.modulo = 'agua' then null
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
      when 'alarme' then 0
      when 'lembrete' then 1 when 'cutucada' then 2
      when 'noite' then 4 else 8 end,
    case d.toque_escolhido
      when 'alarme' then
        case when d.alarmes_enviados + 1 < jsonb_array_length(d.config->'lembretes')
          then public.instante_sp(
                 d.data_sp,
                 (d.config->'lembretes'->>(d.alarmes_enviados + 1))::time)
          else null end
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
    d.vezes_feitas::int,
    d.vezes_alvo::int,
    ps.endpoint, ps.p256dh, ps.auth
  from decidido d
  join profiles p on p.id = d.user_id
  join push_subs ps on ps.user_id = d.user_id
  left join streaks s on s.habit_id = d.habit_id and s.user_id = d.user_id
  where d.toque_escolhido is not null
    -- Teto de 10 por dia, mas noite e consequencia sempre passam: sao os
    -- toques que evitam a perda, e perder em silencio e pior.
    and (
      public.toques_do_dia(d.user_id, d.data_sp) < 10
      or d.toque_escolhido in ('noite', 'consequencia')
    )
$$;

revoke execute on function
  public.toques_pendentes(int),
  public.registrar_toque(uuid, int, timestamptz),
  public.toques_do_dia(uuid, date)
  from public, anon, authenticated;
