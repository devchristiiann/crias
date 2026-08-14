-- 0030_teto_ouro_30
--
-- Teto de ouro por rotina sobe de 10 para 30. Decisao do dono, e so o teto sobe:
-- preco de loja, sorteio do bau, cura e escudo ficam exatamente onde estavam.
--
-- Os tres lugares que travavam o 10 sao os mesmos da 0014, e mudar so um deles
-- deixa o furo pela porta do lado: a constraint protege a tabela, `criar_habito`
-- protege o caminho da RPC e `config_valida` protege a faixa dos modulos de
-- horario e de duracao, que e por onde o `ouro_base` entra em `acordar`,
-- `dormir` e `tela`.
--
-- Os corpos abaixo sao os VIGENTES no banco, lidos com `pg_get_functiondef`, com
-- o 10 trocado pelo 30 nas checagens de ouro e nada mais. Reescrever de cabeca,
-- ou copiar a versao de uma migration anterior, apagaria regra que entrou depois.

-- ------------------------------------------------------------- 1. a constraint

alter table public.habits drop constraint if exists habits_ouro_base_check;
alter table public.habits add constraint habits_ouro_base_check
  check (ouro_base between 1 and 30);

-- ------------------------------------------------------ 2. faixa dos modulos
--
-- Duas trocas, nao uma. Alem do teto da faixa, o sentinela `v_ouro_ant` sobe de
-- 11 para 31: ele existe para a primeira faixa nunca reprovar em "ouro nunca
-- sobe entre faixas", e parado em 11 recusaria toda faixa acima disso, ou seja,
-- o teto novo inteiro. A regra em si nao muda: faixa mais tarde continua tendo
-- que pagar menos que a anterior.

create or replace function public.config_valida(p_modulo text, p_config jsonb)
returns boolean
language plpgsql immutable as $$
declare
  e jsonb;
  v_n int;
  v_vezes int;
  v_hora text;
  v_ouro int;
  v_min int;
  v_min_ant int := -1;
  v_ouro_ant int := 31;
begin
  if p_config is null or jsonb_typeof(p_config) <> 'object' then
    return false;
  end if;

  if p_modulo = 'livre' then
    return p_config = '{}'::jsonb;
  end if;

  if p_modulo in ('acordar', 'dormir', 'tela') then
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
      -- tela: DURACAO de 00:15 a 23:59. Piso de 15 minutos porque faixa de
      -- 1 minuto nao e rotina, e teto de 1439 porque `minutos_faixa` nunca
      -- devolve 1440 sem a regra da madrugada, que nao vale aqui.
      if p_modulo = 'tela' and (v_min < 15 or v_min > 1439) then
        return false;
      end if;

      v_ouro := (e->>'ouro')::int;
      if v_ouro < 1 or v_ouro > 30 then
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

-- `create or replace` preserva a ACL, mas o revoke fica explicito: aqui o padrao
-- e nunca deixar o EXECUTE de `authenticated` por heranca.
revoke execute on function public.config_valida(text, jsonb)
  from public, anon, authenticated;

-- ------------------------------------------------------------ 3. criar_habito
--
-- Uma troca so: `v_ouro > 10` vira `v_ouro > 30`. O default `p_ouro_base int
-- default 10` continua 10 de proposito, porque ele e o valor de quem nao mandou
-- nada, nao o teto.

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

  if v_modulo not in ('livre', 'acordar', 'dormir', 'agua', 'tela') then
    return json_build_object('error', 'modulo_invalido');
  end if;

  if coalesce(trim(p_titulo), '') = '' then
    return json_build_object('error', 'titulo_vazio');
  end if;

  -- Sozinho nao tem quem valide, e um segundo caminho de pagamento e como as
  -- duas contabilidades divergem. Mesma resposta de quem manda grupo alheio,
  -- de proposito: mensagem diferente ensina o que existe do outro lado.
  if v_modulo = 'tela' and p_group_id is null then
    return json_build_object('error', 'grupo_invalido');
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
    -- `is not true` e nao `not`: com jsonb torto a resposta era NULL, e
    -- `if not NULL` nao dispara.
    if public.regra_valida(v_regra) is not true then
      return json_build_object('error', 'frequencia_invalida');
    end if;
  end if;

  -- Em modulo de faixa o ouro sai da primeira faixa, nao do formulario: o
  -- resto do sistema continua lendo `ouro_base` sem saber de faixa nenhuma.
  v_ouro := case
    when v_modulo in ('acordar', 'dormir', 'tela')
      then (v_config->'faixas'->0->>'ouro')::int
    else p_ouro_base
  end;

  if v_ouro is null or v_ouro < 1 or v_ouro > 30 then
    return json_build_object('error', 'ouro_base_invalido');
  end if;

  -- Icone do modulo e fixo, nao e escolhivel.
  v_icone := case v_modulo
    when 'acordar' then 'sunrise'
    when 'dormir' then 'moon'
    when 'agua' then 'droplets'
    when 'tela' then 'smartphone'
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

-- Rotina nenhuma precisa ser tocada: o teto subiu, entao toda linha que existe
-- hoje continua valida. A 0014 precisou de um `update` porque ela ABAIXOU o
-- teto, e este e o caso contrario.
--
-- O que o pagamento passa a valer no extremo: `ceil(ouro_base * multiplicador)`,
-- com o multiplicador maximo de 2.0 em ofensiva de 365 dias, da 60 de ouro por
-- check-in. Antes eram 20. O aviso da 0021 continua verdadeiro e agora e
-- consequencia aceita: um teto maior desvaloriza o preco da loja, o premio do
-- bau e o ouro ja acumulado por quem jogou ate aqui.
