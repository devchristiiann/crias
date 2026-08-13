-- 0024_agua_sem_foto
--
-- Bug em producao: o grupo "Ingles" tem `groups.exige_foto = true`, e a exigencia
-- do grupo valia para TODA rotina dele. A rotina de agua tem 5 copos por dia,
-- entao o `check_in` passou a pedir uma foto POR COPO. O dono do produto testou e
-- nao conseguiu marcar nenhum.
--
-- Decisao de produto: rotina de modulo `agua` NUNCA exige foto, mesmo quando o
-- grupo exige. Foto continua opcional, e quem quiser anexar anexa: o caminho de
-- validacao de `foto_path` nao muda em nada (precisa comecar com `auth.uid()` e
-- existir em `storage.objects`). O que sai e so a obrigatoriedade.
--
-- Por que a agua e a excecao: os outros modulos tem UMA marcacao por dia, entao
-- "uma foto" e uma foto. Agua tem N marcacoes, e a mesma regra vira N fotos, que
-- nao e o que o grupo pediu quando ligou o `exige_foto`.
--
-- `acordar` e `dormir` continuam exigindo foto sempre (0023, secao 5). Rotina
-- `livre` continua obedecendo `groups.exige_foto`. So a agua muda.
--
-- As duas funcoes sao redefinidas juntas de proposito: `check_in_por_token` e o
-- Concluir dentro da notificacao, e ja foi a porta dos fundos deste projeto uma
-- vez. Regra que existe so numa das duas e regra que da para contornar.

-- ------------------------------------------------------------------ 1. check_in

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
  -- DIGITE um caminho. Isto vale para todo modulo, agua inclusive: a agua
  -- deixou de EXIGIR foto, nao de VALIDAR a que vier.
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
  --
  -- Agua nunca exige, nem quando o grupo exige: sao N copos por dia, e a regra
  -- do grupo viraria N fotos por dia. Anexar continua permitido.
  if h.modulo in ('acordar', 'dormir') then
    v_exige_foto := true;
  elsif h.modulo <> 'agua' and h.group_id is not null then
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

-- ------------------------------------------- 2. check_in pela notificacao

-- Toda regra nova precisa existir aqui tambem: este caminho ja foi a porta dos
-- fundos deste projeto uma vez, pagando ouro sem gravar `ouro_creditado`.
--
-- Rotina que exige foto continua recusada aqui de proposito: o Concluir da
-- notificacao nao tem como enviar foto, e aceitar sem ela transformaria a
-- exigencia num botao contornavel. Agua nao exige mais foto nenhuma, entao o
-- copo passa a poder ser marcado direto da notificacao, que e exatamente o que
-- o multialarme da agua promete.
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

  -- Mesma regra do `check_in`: agua nunca exige foto, nem quando o grupo exige.
  if h.modulo in ('acordar', 'dormir') then
    v_exige_foto := true;
  elsif h.modulo <> 'agua' and h.group_id is not null then
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

-- Sem grant nenhum, igual a 0023: quem chama e a edge function `quick-check-in`
-- com `service_role`. Um `grant ... to authenticated` aqui daria ao cliente um
-- caminho de check-in que nao passa por `auth.uid()`.
revoke execute on function public.check_in_por_token(uuid, text) from public, anon, authenticated;
