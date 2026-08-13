-- 0026_validacao_pelo_grupo
--
-- Modulo `tela`: rotina validada pelo grupo. Ver
-- `docs/superpowers/specs/2026-08-13-rotina-validada-pelo-grupo-design.md`.
--
-- Duas coisas deste modulo nao existem em nenhum outro, e quase toda regra
-- abaixo sai de uma delas:
--
--   a) A prova e mais fraca. Print de tempo de uso nao existe na camera, entao
--      aqui vale subir da galeria. A enquete e o que compensa isso.
--   b) Pela primeira vez outras pessoas decidem quanto alguem ganha. Em todo o
--      resto do app quem decide e o servidor sozinho.
--
-- O caminho do ouro fica assim: `check_in` NAO paga, so registra a declaracao e
-- abre o prazo; quem paga e `resolver_validacao`, dias depois, chamada pelo voto
-- que fecha o quorum e pelo `pg_cron` de hora em hora. `ouro_creditado` continua
-- sendo a prova de pagamento, e e ela mais o `status` que fazem a resolucao ser
-- idempotente: as duas chamadas podem cair no mesmo instante.
--
-- Quatro armadilhas conhecidas deste projeto, e onde cada uma foi paga aqui:
--
--   1. "Funcao irma esquecida". `check_in_por_token` recusa o modulo inteiro com
--      `precisa_declarar`, ANTES de qualquer escrita e sem girar o token: nao ha
--      como declarar minutos nem anexar print por ali, e recusa nunca e uso.
--   2. "revoke from public, anon NAO tira o EXECUTE de authenticated". Toda
--      funcao nova revoga dos tres papeis e so entao concede a quem deve.
--   3. "RLS decide linha, nunca coluna". `minutos_declarados` e `validacao_ate`
--      ganham `grant select` e mais nada; `occurrences` nao tem update para
--      `anon` nem `authenticated`, entao coluna nova nasce so-leitura.
--   4. "A foto tem que ser DESTA ocorrencia e de hoje" (0025). Nada afrouxou:
--      o modulo passa pela mesma `foto_da_ocorrencia`, e exige foto sempre,
--      inclusive em grupo que nao exige.

-- ------------------------------------------------- 1. faixa em DURACAO, nao em
--                                                       hora do relogio
--
-- `minutos_faixa` e compartilhada, e a regra da madrugada e de UM modulo so.
-- Corpo identico ao da 0023: o `case` ja separava `dormir` do resto, e o que
-- muda aqui e a documentacao de quem cai em qual ramo, porque agora existe um
-- modulo em que "01:00" significa uma hora de DURACAO e nunca uma da manha.
--
-- Se o ramo do `dormir` vazasse para `tela`, a faixa "00:30" (meia hora de uso)
-- viraria 1470 minutos e pagaria o valor cheio para 24 horas de celular.
create or replace function public.minutos_faixa(p_modulo text, p_hora text)
returns integer
language sql immutable as $$
  select case
    when p_hora is null or p_hora !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then null
    -- REGRA DA MADRUGADA. Exclusiva do `dormir`, onde 01:00 e a madrugada
    -- SEGUINTE ao dia da ocorrencia e por isso vale 1440 + 60.
    when p_modulo = 'dormir' and left(p_hora, 2)::int < 6
      then left(p_hora, 2)::int * 60 + right(p_hora, 2)::int + 1440
    -- MINUTOS PUROS. `acordar` e `agua` (hora do relogio dentro do proprio dia)
    -- e `tela` (duracao, que nunca passa de 23:59). Nenhum deles soma 1440.
    else left(p_hora, 2)::int * 60 + right(p_hora, 2)::int
  end
$$;

-- `create or replace` preserva a ACL antiga, entao esta funcao so estava fechada
-- por heranca. Revoke explicito, como toda funcao daqui.
revoke execute on function public.minutos_faixa(text, text)
  from public, anon, authenticated;

-- --------------------------------------------------------- 2. config do modulo

-- Corpo da 0023 com duas trocas: `tela` entra na mesma lista de `faixas` de
-- `acordar` e `dormir`, e ganha o limite de duracao dela. Reaproveitar o ramo
-- em vez de copiar e proposital: forma, quantidade de faixas, teto de ouro e
-- ordem decrescente sao exatamente as mesmas regras, e duas copias sao duas
-- regras para manter iguais.
--
-- A diferenca de significado esta so no limite: `acordar` 00:00 a 11:59,
-- `dormir` 18:00 a 05:59 (ja somado de 1440), `tela` 00:15 a 23:59 de DURACAO.
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
  v_ouro_ant int := 11;
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

revoke execute on function public.config_valida(text, jsonb)
  from public, anon, authenticated;

-- ------------------------------------------------------ 3. colunas e constraints

alter table habits drop constraint if exists habits_modulo_check;
alter table habits add constraint habits_modulo_check
  check (modulo in ('livre', 'acordar', 'dormir', 'agua', 'tela'));

alter table occurrences drop constraint if exists occurrences_status_check;
alter table occurrences add constraint occurrences_status_check
  check (status in ('pendente', 'feito', 'atrasado', 'em_validacao'));

alter table occurrences add column if not exists minutos_declarados int;
alter table occurrences add column if not exists validacao_ate timestamptz;

-- O `check_in` ja recusa fora de 1..1440 com `minutos_invalidos`. A constraint
-- e a trava real, pelo motivo de sempre: validacao no codigo protege o caminho
-- que passa por ele, constraint protege a tabela.
alter table occurrences drop constraint if exists occurrences_minutos_check;
alter table occurrences add constraint occurrences_minutos_check
  check (minutos_declarados is null or minutos_declarados between 1 and 1440);

-- Leitura, e so leitura. `occurrences` nao tem insert nem update para `anon` nem
-- para `authenticated` (so `postgres` e `service_role`), e o `grant select` dessa
-- tabela e por coluna desde a 0019, entao coluna nova nasce invisivel ate alguem
-- liberar. Estas duas a enquete precisa mostrar: quanto a pessoa declarou e
-- quanto tempo falta para fechar.
grant select (minutos_declarados, validacao_ate) on occurrences to authenticated;

-- O cron varre por prazo vencido de hora em hora. Indice parcial porque
-- `em_validacao` e sempre um punhado de linhas dentro de uma tabela que so
-- cresce.
create index if not exists idx_occ_em_validacao
  on occurrences (validacao_ate) where status = 'em_validacao';

-- ------------------------------------------------------------- 4. votos

-- `(occurrence_id, user_id)` e a chave, e e ela que faz trocar o voto substituir
-- o anterior em vez de empilhar um segundo.
--
-- `criado_em` guarda o instante do voto ATUAL, nao o do primeiro: quem troca de
-- ideia depois de ver o print esta votando agora.
create table if not exists votos_validacao (
  occurrence_id uuid not null references occurrences(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  aprova boolean not null,
  criado_em timestamptz not null default now(),
  primary key (occurrence_id, user_id)
);

alter table votos_validacao enable row level security;

-- Sem insert, update nem delete para `anon` nem para `authenticated`: quem
-- escreve e a RPC, e mais ninguem. `revoke all` derruba junto TRUNCATE, TRIGGER
-- e REFERENCES, que o Supabase concede na criacao e que a 0025 teve que ir
-- revogando tabela por tabela depois.
--
-- Duas travas, nao uma: sem grant e sem policy de escrita. Uma policy nova por
-- descuido nao abre nada enquanto o grant nao existir, e vice-versa.
revoke all on votos_validacao from public, anon, authenticated;
grant select on votos_validacao to authenticated;

-- O voto e aberto por decisao do dono: quem e do grupo daquela ocorrencia le
-- quem votou o que. Fora do grupo, zero linha.
--
-- A subconsulta ainda passa pela RLS de `occurrences` e de `habits`, que ja
-- limitam ao grupo: sao duas perguntas independentes dando a mesma resposta.
drop policy if exists p_votos_read on votos_validacao;
create policy p_votos_read on votos_validacao
  for select to authenticated
  using (exists (
    select 1
      from occurrences o
      join habits h on h.id = o.habit_id
     where o.id = votos_validacao.occurrence_id
       and h.group_id is not null
       and public.e_membro(h.group_id)
  ));

-- ------------------------------------------------------------ 5. criar_habito

-- Corpo da 0025 com quatro trocas: `tela` na lista branca de modulo, `tela` so
-- em grupo, ouro vindo da primeira faixa (igual a `acordar` e `dormir`) e icone
-- fixo do modulo.
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

  if v_ouro is null or v_ouro < 1 or v_ouro > 10 then
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

-- ---------------------------------------------------------------- 6. check_in

-- A assinatura muda: `p_minutos` e o que a pessoa declarou. A versao de dois
-- argumentos e DERRUBADA, nao mantida ao lado: com as duas vivas o PostgREST
-- recusa a chamada por ambiguidade (`Could not choose the best candidate
-- function`). Com uma so, e com `p_minutos` tendo default, a chamada de hoje
-- (`rpc('check_in', { p_occ, p_foto })`, `src/hooks/useCheckIn.ts:117`) continua
-- resolvendo para esta.
drop function if exists public.check_in(uuid, text);

-- Corpo da 0025 com tres trocas: a guarda de declaracao ja feita, `tela` na
-- lista de quem exige foto sempre, e o ramo do modulo `tela`, que fecha antes de
-- qualquer pagamento.
create or replace function public.check_in(
  p_occ uuid, p_foto text default null, p_minutos int default null
)
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

  -- Status ANTES da foto, na mesma ordem da funcao irma. Ocorrencia ja concluida
  -- respondia `foto_invalida` aqui e `ja_feito` la para a mesma chamada, e
  -- resposta que muda de nome conforme a porta e resposta que ensina o atacante
  -- qual porta usar.
  if o.status = 'feito' then
    return json_build_object(
      'ja_feito', true,
      'ouro', (select ouro from profiles where id = auth.uid())
    );
  end if;

  -- Declarada uma vez, declarada de vez. `minutos_declarados` so existe no
  -- modulo `tela`, e ele cobre os dois desfechos da enquete de uma vez:
  -- enquanto ela esta aberta ninguem redeclara por cima (seria trocar o numero
  -- com os votos ja dados), e depois de reprovada nao ha redeclaracao, porque
  -- recurso esta fora de escopo e redeclarar seria recurso pela porta dos
  -- fundos. Quem errou o numero desfaz, e so enquanto ninguem votou.
  --
  -- Guarda no topo, e nao dentro do ramo `tela`: la embaixo ela seria alcancada
  -- so depois da conferencia de foto, e responderia `foto_obrigatoria` num dia
  -- seguinte para uma ocorrencia que o problema nao e a foto.
  if o.minutos_declarados is not null then
    return json_build_object('error', 'ja_declarada');
  end if;

  -- Quatro perguntas sobre a foto: de quem e a pasta, de QUAL OCORRENCIA e a
  -- subpasta, se o arquivo existe mesmo e se ele foi enviado HOJE. Faltando a
  -- segunda, a foto de uma ocorrencia servia de comprovacao para qualquer outra;
  -- faltando a quarta, a foto de ontem comprovava o dia de hoje da mesma janela.
  -- Isto vale para todo modulo, agua inclusive: a agua deixou de EXIGIR foto,
  -- nao de VALIDAR a que vier. E vale para `tela` sem nenhum afrouxamento: o
  -- print sai da galeria, mas o arquivo tem que ser desta ocorrencia e enviado
  -- hoje, igual a todo o resto.
  if p_foto is not null
     and not public.foto_da_ocorrencia(p_foto, auth.uid(), p_occ) then
    return json_build_object('error', 'foto_invalida');
  end if;

  select * into h from habits where id = o.habit_id;
  select * into s from streaks where habit_id = o.habit_id and user_id = o.user_id;

  -- Uma marcacao por dia em rotina de janela. A ocorrencia de `n_por_semana`
  -- cobre a semana toda e a de `n_por_mes` o mes todo, com `vezes_alvo`
  -- marcacoes cada, e ate aqui nada olhava QUANDO cada marcacao aconteceu:
  -- tres cliques seguidos fechavam a semana e pagavam as tres.
  --
  -- Sai `ja_marcado_hoje` e nao um erro generico porque a pessoa nao errou
  -- nada: a rotina dela esta certa e a proxima marcacao e amanha, e a tela
  -- precisa poder dizer isso.
  --
  -- So estes dois tipos. Rotina diaria tem uma marcacao por ocorrencia e ja
  -- para no `ja_feito`; modulo de horario idem; e agua e N vezes NO MESMO dia
  -- de proposito, entao travar por dia mataria o modulo.
  if h.regra_frequencia->>'tipo' in ('n_por_semana', 'n_por_mes')
     and o.ultima_marcacao_sp is not distinct from public.hoje_sp() then
    return json_build_object('error', 'ja_marcado_hoje');
  end if;

  -- Janela fechada nao paga mais. A `data_sp` da ocorrencia de `n_por_semana` e
  -- o domingo da semana e a de `n_por_mes` e o ultimo dia do mes, entao passado
  -- esse dia a janela acabou: uma ocorrencia vencida ha 30 dias ainda pagava 10.
  --
  -- So estes dois tipos, de proposito. Rotina diaria e modulo de horario aceitam
  -- marcacao atrasada porque marcar tarde e melhor que nao marcar, e la o
  -- prejuizo ja foi cobrado em vida por `marcar_atrasadas`. Aqui nao: a janela e
  -- a unidade de cobranca, e slot de semana passada nao volta.
  if h.regra_frequencia->>'tipo' in ('n_por_semana', 'n_por_mes')
     and o.data_sp < public.hoje_sp() then
    return json_build_object('error', 'janela_encerrada');
  end if;

  -- Acordar, dormir e tela exigem foto SEMPRE, independente do grupo. Nos dois
  -- primeiros a foto e prova social e o relogio do servidor prova o horario; em
  -- `tela` o print e a UNICA prova que existe, entao grupo sem `exige_foto` nao
  -- afrouxa nada: sem print nao ha o que validar.
  --
  -- Agua nunca exige, nem quando o grupo exige: sao N copos por dia, e a regra
  -- do grupo viraria N fotos por dia. Anexar continua permitido.
  if h.modulo in ('acordar', 'dormir', 'tela') then
    v_exige_foto := true;
  elsif h.modulo <> 'agua' and h.group_id is not null then
    select exige_foto into v_exige_foto from groups where id = h.group_id;
  end if;

  -- `coalesce(p_foto, ...)` continua sendo o reuso da foto pela rotina de
  -- varias marcacoes no mesmo dia, e agora reusa uma foto que sabidamente e
  -- DESTA ocorrencia. Foto em caminho antigo (`<uid>/<occ>.webp`, sem subpasta)
  -- deixa de contar como comprovacao: ela e indistinguivel da foto de qualquer
  -- outra rotina, que e exatamente o furo.
  --
  -- E a foto guardada so vale de novo quando a marcacao anterior foi HOJE (item
  -- 9 da 0025). Ver `foto_de_hoje`.
  if coalesce(v_exige_foto, false)
     and not public.foto_da_ocorrencia(
           coalesce(p_foto, public.foto_de_hoje(o.foto_path, o.ultima_marcacao_sp)),
           auth.uid(), p_occ) then
    return json_build_object('error', 'foto_obrigatoria');
  end if;

  -- ------------------------------------------------ modulo `tela`: declaracao
  --
  -- Aqui o check-in ACABA. Nao paga ouro, nao mexe em ofensiva, nao abre bau,
  -- nao toca em `ouro_creditado`: quem faz tudo isso e `resolver_validacao`,
  -- se e quando a enquete validar. O retorno diz quanto VALE, nunca quanto
  -- ganhou, e a tela tem que repetir isso: ouro que aparece antes da hora e a
  -- unica coisa que nao da para desfazer na cabeca de quem viu.
  if h.modulo = 'tela' then
    if p_minutos is null or p_minutos < 1 or p_minutos > 1440 then
      return json_build_object('error', 'minutos_invalidos');
    end if;

    -- A primeira faixa cujo `ate` comporta o declarado. `minutos_faixa` com
    -- `'tela'` le DURACAO em minutos puros, sem a regra da madrugada do
    -- `dormir`: ver a funcao la em cima.
    select (f.e->>'ouro')::int into v_ouro_faixa
      from jsonb_array_elements(h.config->'faixas') with ordinality f(e, ord)
     where p_minutos <= public.minutos_faixa('tela', f.e->>'ate')
     order by f.ord
     limit 1;

    -- Passou da ultima faixa: nao cumpriu a rotina. Mesma resposta do acordar
    -- cedo fora de faixa, e de proposito: nao existe faixa de consolacao.
    if v_ouro_faixa is null then
      return json_build_object('error', 'fora_da_faixa');
    end if;

    update occurrences
       set vezes_feitas = 1,
           status = 'em_validacao',
           minutos_declarados = p_minutos,
           validacao_ate = now() + interval '48 hours',
           foto_path = coalesce(p_foto, foto_path),
           -- Ja declarou: parar de cutucar. `toques_pendentes` tambem nao le
           -- `em_validacao`, entao sao duas travas para a mesma coisa.
           proximo_toque_em = null,
           ultima_marcacao_sp = public.hoje_sp()
     where id = p_occ;

    return json_build_object(
      'ok', true,
      'em_validacao', true,
      -- Zero explicito, e nao ausente: quem le o retorno generico soma este
      -- campo no saldo da tela.
      'ouro_ganho', 0,
      'ouro_possivel', v_ouro_faixa,
      'minutos', p_minutos,
      'validacao_ate', now() + interval '48 hours'
    );
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
         -- Token de uso unico gira ao FECHAR. Ver o item 8 da 0025.
         token_rapido = case when v_completou then gen_random_uuid() else token_rapido end,
         ultima_marcacao_sp = public.hoje_sp(),
         ouro_ultima = v_ganho,
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
      -- `bau_no` so quando o bau PAGOU.
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

revoke execute on function public.check_in(uuid, text, int) from public, anon, authenticated;
grant execute on function public.check_in(uuid, text, int) to authenticated;

-- --------------------------------------------- 7. check_in pela notificacao

-- Corpo da 0025 com uma troca: o modulo `tela` e recusado com
-- `precisa_declarar`. Nao ha como declarar minutos nem anexar print pela
-- notificacao, e "Concluir" ali significaria uma declaracao sem numero e sem
-- prova, que e a unica coisa que este modulo tem.
--
-- A recusa vem depois de `adiar` de proposito: adiar nao declara nada e continua
-- valendo. E NAO gira o token, pela regra do item 13 da 0025: recusa nao e uso,
-- e a ocorrencia continua aberta para ser declarada pelo app.
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
  -- Lista branca antes de tocar no banco. Antes, qualquer string diferente de
  -- `adiar` caia no caminho de check-in: o valor desconhecido era
  -- INTERPRETADO, e a acao mais cara era o padrao.
  if p_acao is null or p_acao not in ('adiar', 'concluir') then
    return json_build_object('error', 'acao_invalida');
  end if;

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
  -- `proximo_toque_em` numa ocorrencia feita.
  if p_acao = 'adiar' then
    update occurrences
       set proximo_toque_em = least(now() + interval '1 hour', vence_em),
           token_rapido = gen_random_uuid()
     where id = o.id;
    return json_build_object('ok', true, 'adiado', true);
  end if;

  select * into h from habits where id = o.habit_id;
  select * into s from streaks where habit_id = o.habit_id and user_id = o.user_id;

  -- Modulo `tela` nao se conclui por aqui. Sem minutos e sem print nao ha
  -- declaracao, e uma "conclusao" sem os dois seria uma enquete sobre nada.
  -- Antes de qualquer escrita, e sem girar o token: a ocorrencia continua
  -- aberta e a notificacao ainda serve para levar a pessoa ao app.
  if h.modulo = 'tela' then
    return json_build_object('error', 'precisa_declarar');
  end if;

  -- Mesma trava de uma marcacao por dia do `check_in`. O token NAO gira nesta
  -- recusa: a ocorrencia continua aberta e a marcacao de amanha e legitima.
  if h.regra_frequencia->>'tipo' in ('n_por_semana', 'n_por_mes')
     and o.ultima_marcacao_sp is not distinct from public.hoje_sp() then
    return json_build_object('error', 'ja_marcado_hoje');
  end if;

  -- Mesma trava de janela fechada do `check_in`, e tambem sem girar o token.
  if h.regra_frequencia->>'tipo' in ('n_por_semana', 'n_por_mes')
     and o.data_sp < public.hoje_sp() then
    return json_build_object('error', 'janela_encerrada');
  end if;

  -- Mesma regra do `check_in`: agua nunca exige foto, nem quando o grupo exige.
  if h.modulo in ('acordar', 'dormir') then
    v_exige_foto := true;
  elsif h.modulo <> 'agua' and h.group_id is not null then
    select exige_foto into v_exige_foto from groups where id = h.group_id;
  end if;

  -- Mesmas duas funcoes do `check_in`: a foto tem que ser desta ocorrencia e da
  -- marcacao de hoje. RECUSA NAO GIRA (item 13 da 0025).
  if coalesce(v_exige_foto, false)
     and not public.foto_da_ocorrencia(
           public.foto_de_hoje(o.foto_path, o.ultima_marcacao_sp),
           o.user_id, o.id) then
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
         -- Gira em TODA marcacao bem sucedida, ao contrario do `check_in`: este
         -- e o caminho DO TOKEN, e uso unico tem que ser unico (item 12 da 0025).
         token_rapido = gen_random_uuid(),
         ultima_marcacao_sp = public.hoje_sp(),
         ouro_ultima = v_ganho,
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

-- Sem grant nenhum: quem chama e a edge function `quick-check-in` com
-- `service_role`.
revoke execute on function public.check_in_por_token(uuid, text) from public, anon, authenticated;

-- ------------------------------------------------------------- 8. resolucao

-- O unico lugar que paga este modulo. Chamada de dois lugares, e as duas podem
-- cair no mesmo instante: pelo voto que fecha o quorum e pelo `pg_cron` de hora
-- em hora.
--
-- IDEMPOTENCIA, que e a regra mais importante desta funcao:
--
--   a) `for update` na primeira linha. A segunda chamada espera a primeira
--      terminar, e em READ COMMITTED ela re-le a linha DEPOIS do lock, ja com o
--      status novo. Sem o lock, as duas leriam `em_validacao` e as duas pagariam.
--   b) `status <> 'em_validacao'` e a saida. Resolver e justamente tirar a linha
--      desse status, entao a segunda chamada nao tem o que fazer.
--   c) `ouro_creditado <> 0` e o cinto. Em validacao ele e sempre zero, porque o
--      `check_in` deste modulo nao paga; valor diferente disso significa que
--      alguem ja pagou, e a coluna existe exatamente para essa pergunta.
--
-- Sem `security invoker` e sem grant: ninguem chama isto de fora.
create or replace function public.resolver_validacao(p_occ uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  o occurrences; h habits; s streaks;
  v_favor int; v_contra int; v_votos int; v_elegiveis int; v_reprovada boolean;
  v_ouro_faixa int; v_ganho int; v_mult numeric; v_streak int;
  v_primeiro boolean; v_nos int := 0; v_no int := 0;
  v_premio json; v_bau boolean := false;
begin
  select * into o from occurrences where id = p_occ for update;

  if not found or o.status <> 'em_validacao' then
    return json_build_object('ok', true, 'ja_resolvida', true);
  end if;

  if o.ouro_creditado <> 0 then
    return json_build_object('error', 'ja_paga');
  end if;

  select * into h from habits where id = o.habit_id;

  -- QUEM CONTA E O MEMBRO DE AGORA, nao o de quando votou. Sem o join, entrar
  -- pelo codigo de convite, contestar e sair deixava o voto valendo, e o dono
  -- mexia no resultado removendo quem votou. Elegivel segue a mesma regra: os
  -- membros de agora menos o autor.
  select count(*) filter (where v.aprova), count(*)
    into v_favor, v_votos
    from votos_validacao v
    join group_members gm
      on gm.group_id = h.group_id and gm.user_id = v.user_id
   where v.occurrence_id = p_occ;
  v_contra := v_votos - v_favor;

  select count(*) into v_elegiveis
    from group_members where group_id = h.group_id and user_id <> o.user_id;

  -- Antes do prazo so resolve com todo mundo decidido, que e exatamente a porta
  -- do `votar_validacao`. O cron so traz prazo vencido, entao nunca cai aqui.
  -- Ninguem tem execute nesta funcao, entao isto e o contrato dela e nao o
  -- remendo de um furo: resolver enquete aberta e sem voto pagaria por nada.
  if coalesce(now() < o.validacao_ate, true) and v_votos < v_elegiveis then
    return json_build_object('error', 'prazo_aberto');
  end if;

  -- A faixa e recalculada a partir do que foi declarado, com a mesma leitura de
  -- duracao do `check_in`. `habits` nao tem update para `anon` nem para
  -- `authenticated` e nenhuma RPC edita `config`, entao a faixa de hoje e a
  -- mesma de quando a pessoa declarou.
  select (f.e->>'ouro')::int into v_ouro_faixa
    from jsonb_array_elements(h.config->'faixas') with ordinality f(e, ord)
   where o.minutos_declarados <= public.minutos_faixa('tela', f.e->>'ate')
   order by f.ord
   limit 1;

  -- Reprovada com 2 contra E contra maior que favor. Empate valida, ninguem
  -- votando valida: quem esta em duvida nao reprova sozinho, e vingança de uma
  -- pessoa so nao derruba nada.
  --
  -- `v_ouro_faixa is null` entra aqui, e nao num erro: se a faixa sumir por
  -- baixo, o certo e fechar a enquete sem pagar, nunca inventar um valor. Ela
  -- nao tem como acontecer hoje, e por isso mesmo nao pode deixar a ocorrencia
  -- presa em `em_validacao` para sempre, sendo relida pelo cron de hora em hora.
  v_reprovada := (v_contra >= 2 and v_contra > v_favor) or v_ouro_faixa is null;

  if v_reprovada then
    -- Nao paga, nao mexe em ofensiva e NAO TIRA VIDA. Quem cobra vida e
    -- `marcar_atrasadas`, e ela so olha `pendente`: a linha ja sai daqui como
    -- `atrasado`, entao nunca cai naquela varredura. Reprovar e nao ganhar, nao
    -- e ser punido.
    update occurrences
       set status = 'atrasado',
           proximo_toque_em = null
     where id = p_occ;

    return json_build_object(
      'ok', true, 'reprovada', true, 'favor', v_favor, 'contra', v_contra
    );
  end if;

  select * into s from streaks where habit_id = o.habit_id and user_id = o.user_id;

  -- OFENSIVA NA RESOLUCAO, e nao na declaracao. Regra identica a do `check_in`,
  -- e por isso escrita sobre `o.data_sp`, o dia da rotina, nunca sobre
  -- `hoje_sp()`: esta funcao roda ate 48 horas depois da declaracao, e usar hoje
  -- aqui quebraria a sequencia de quem declarou na sexta e teve a enquete
  -- fechada no domingo.
  if s.ultima_data_sp is null then
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
  v_ganho := ceil(v_ouro_faixa * v_mult);

  -- Antes do update, igual ao `check_in`: depois dele esta ocorrencia ja seria
  -- `feito` e responderia por si mesma.
  v_primeiro := not exists (
    select 1 from occurrences
     where user_id = o.user_id and data_sp = o.data_sp
       and status = 'feito' and id <> o.id
  );

  update occurrences
     set status = 'feito',
         feito_em = now(),
         ouro_creditado = v_ganho,
         ouro_ultima = v_ganho,
         proximo_toque_em = null,
         token_rapido = gen_random_uuid(),
         streak_anterior = coalesce(streak_anterior, coalesce(s.atual, 0)),
         data_streak_anterior = coalesce(data_streak_anterior, s.ultima_data_sp)
   where id = p_occ;

  insert into streaks (habit_id, user_id, atual, melhor, ultima_data_sp)
  values (o.habit_id, o.user_id, v_streak, v_streak, o.data_sp)
  on conflict (habit_id, user_id) do update
    set atual = v_streak,
        melhor = greatest(streaks.melhor, v_streak),
        ultima_data_sp = o.data_sp;

  update profiles set ouro = ouro + v_ganho, xp = xp + v_ganho where id = o.user_id;

  -- Bau avaliado igual ao `check_in`: a contagem e de dias produtivos, e este
  -- dia so passou a contar agora.
  if v_primeiro then
    select count(distinct data_sp) into v_nos
      from occurrences where user_id = o.user_id and status = 'feito';
    v_no := v_nos - coalesce((select bau_base from profiles where id = o.user_id), 0);
    if v_no > 0 and v_no % 7 = 0 then
      v_premio := public.abrir_bau(o.user_id, v_nos);
      v_bau := true;
      if not coalesce((v_premio->>'repetido')::boolean, false) then
        update occurrences set bau_no = v_nos where id = p_occ;
      end if;
    end if;
  end if;

  return json_build_object(
    'ok', true,
    'validada', true,
    'favor', v_favor,
    'contra', v_contra,
    'ouro_ganho', v_ganho,
    'streak', v_streak,
    'bau', v_bau
  );
end $$;

revoke execute on function public.resolver_validacao(uuid) from public, anon, authenticated;

-- O lado do cron: fecha o que passou do prazo. `limit` para uma rodada nunca
-- virar varredura infinita; o que sobrar sai na hora seguinte.
create or replace function public.resolver_validacoes()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare r record; v_total int := 0;
begin
  for r in
    select id from occurrences
     where status = 'em_validacao' and validacao_ate <= now()
     order by validacao_ate
     limit 500
  loop
    perform public.resolver_validacao(r.id);
    v_total := v_total + 1;
  end loop;
  return v_total;
end $$;

revoke execute on function public.resolver_validacoes() from public, anon, authenticated;

-- ------------------------------------------------------------------ 9. voto

create or replace function public.votar_validacao(p_occ uuid, p_aprova boolean)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  o occurrences; v_grupo uuid; v_modulo text;
  v_favor int; v_votos int; v_elegiveis int;
  v_resolvida boolean := false;
begin
  -- Entrada antes de tudo. Nulo nao e "contra" nem "a favor", e adivinhar qual
  -- dos dois seria interpretar valor desconhecido.
  if p_aprova is null then
    return json_build_object('error', 'voto_invalido');
  end if;

  -- `for update`, igual as irmas (`check_in`, `desfazer_check_in`,
  -- `resolver_validacao`). Sem o lock, o voto que entrava no mesmo instante do
  -- desfazer lia `em_validacao` da versao velha e sobrevivia a limpeza dos
  -- votos: a ocorrencia voltava a `pendente` com voto orfao pendurado.
  select * into o from occurrences where id = p_occ for update;

  -- Inexistente, de outro grupo, de outro modulo e ja resolvida respondem a
  -- MESMA coisa, de proposito: resposta que muda de nome conforme o motivo
  -- deixa descobrir o que existe do outro lado.
  if not found or o.status <> 'em_validacao' then
    return json_build_object('error', 'ocorrencia_invalida');
  end if;

  select group_id, modulo into v_grupo, v_modulo from habits where id = o.habit_id;

  -- Tres perguntas, uma resposta. O modulo e conferido explicitamente e nao
  -- deduzido de "so `tela` chega a `em_validacao`": isso e verdade hoje e era a
  -- unica coisa segurando, entao qualquer modulo novo que use o status herdaria
  -- a enquete sem ninguem decidir isso. `e_membro` responde sobre o
  -- `auth.uid()` da chamada, nunca sobre um id que veio no payload.
  if v_grupo is null or v_modulo <> 'tela' or not public.e_membro(v_grupo) then
    return json_build_object('error', 'ocorrencia_invalida');
  end if;

  if o.user_id = auth.uid() then
    return json_build_object('error', 'voto_proprio');
  end if;

  if o.validacao_ate is null or now() > o.validacao_ate then
    return json_build_object('error', 'prazo_encerrado');
  end if;

  -- Trocar o voto substitui o anterior, nunca soma outro: a chave e
  -- `(occurrence_id, user_id)`.
  insert into votos_validacao (occurrence_id, user_id, aprova)
  values (p_occ, auth.uid(), p_aprova)
  on conflict (occurrence_id, user_id) do update
    set aprova = excluded.aprova, criado_em = now();

  -- Mesma contagem da `resolver_validacao`, e tem que ser a mesma: e ela que
  -- decide se o quorum fechou. So voto de membro de agora, elegivel e o membro
  -- de agora menos quem declarou. Com todos decididos, esperar as 48 horas e
  -- castigo sem motivo.
  select count(*) filter (where v.aprova), count(*)
    into v_favor, v_votos
    from votos_validacao v
    join group_members gm
      on gm.group_id = v_grupo and gm.user_id = v.user_id
   where v.occurrence_id = p_occ;

  select count(*) into v_elegiveis
    from group_members where group_id = v_grupo and user_id <> o.user_id;

  if v_votos >= v_elegiveis then
    perform public.resolver_validacao(p_occ);
    v_resolvida := true;
  end if;

  return json_build_object(
    'ok', true,
    'favor', v_favor,
    'contra', v_votos - v_favor,
    'resolvida', v_resolvida
  );
end $$;

revoke execute on function public.votar_validacao(uuid, boolean)
  from public, anon, authenticated;
grant execute on function public.votar_validacao(uuid, boolean) to authenticated;

-- ------------------------------------------------------- 10. desfazer_check_in

-- Corpo da 0025 com tres trocas: o ramo de `em_validacao` (que so aceita antes
-- do primeiro voto), a limpeza da declaracao no desfazer completo, e a
-- devolucao de `proximo_toque_em` em todo caminho que volta para `pendente`.
create or replace function public.desfazer_check_in(p_occ uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare o occurrences; h habits; v_ouro int; v_toque timestamptz;
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

  select * into h from habits where id = o.habit_id;

  -- O TOQUE QUE O CHECK-IN APAGOU. Todo caminho que devolve a ocorrencia a
  -- `pendente` passava por cima de `proximo_toque_em` deixando nulo, e
  -- `toques_pendentes` so olha quem tem esse campo: a escada do dia morria, e o
  -- proximo aviso era o `consequencia`, depois de `marcar_atrasadas` ja ter
  -- cobrado 10 de vida. Mesma conta do `gerar_ocorrencias`, um lugar so, usada
  -- pelos tres desfazeres: valor diferente por caminho e o app se comportando
  -- diferente por acidente.
  --
  -- Instante no passado e de proposito: `toques_pendentes` le `<= now()`, entao
  -- quem desfaz as 20h de um lembrete das 8h volta a ser cutucado agora, no bit
  -- da escada que ainda nao saiu.
  v_toque := case
    when h.modulo = 'agua' then
      case when jsonb_array_length(h.config->'lembretes') > o.alarmes_enviados
        then public.instante_sp(
               o.data_sp, (h.config->'lembretes'->>o.alarmes_enviados)::time)
        else null end
    when h.lembrete_hora is null then null
    else public.instante_sp(o.data_sp, h.lembrete_hora)
  end;

  -- Desfazer com a enquete aberta, e SO ENQUANTO NINGUEM VOTOU. Quem errou o
  -- numero que digitou corrige; depois do primeiro voto a enquete segue ate o
  -- fim.
  --
  -- Sem esta trava, desfazer apagava os votos e devolvia a ocorrencia a
  -- `pendente`, e redeclarar abria enquete nova com 48 horas zeradas: quem
  -- estava perdendo levava 2 contra, desfazia, redeclarava e repetia ate o
  -- grupo cansar, vencendo o prazo sem voto e recebendo o ouro cheio. Reiniciar
  -- a votacao quantas vezes quiser e o mesmo que nao ter votacao.
  --
  -- Sem a trava de dia corrente, de proposito: o `fora_do_dia` la embaixo existe
  -- para proteger ofensiva ja fechada e ranking que os outros ja viram, e em
  -- validacao nao ha nem um nem outro. A enquete vive ate 48 horas, e boa parte
  -- delas cai no dia seguinte ao da declaracao.
  if o.status = 'em_validacao' then
    -- Voto de ex-membro tambem tranca. Ele nao decide o resultado (a resolucao
    -- so conta membro de agora), mas ele e prova de que a enquete correu, e
    -- deixar o autor reabrir por causa de quem saiu e o mesmo laco de novo.
    if exists (select 1 from votos_validacao where occurrence_id = p_occ) then
      return json_build_object('error', 'ja_votada');
    end if;

    update occurrences
       set vezes_feitas = 0,
           status = 'pendente',
           feito_em = null,
           foto_path = null,
           minutos_declarados = null,
           validacao_ate = null,
           ultima_marcacao_sp = null,
           proximo_toque_em = v_toque,
           ouro_ultima = 0
     where id = p_occ;

    return json_build_object(
      'ok', true,
      'ouro', (select ouro from profiles where id = o.user_id),
      'ouro_devolvido', 0
    );
  end if;

  -- Reprovada nao se desfaz. Desfazer aqui devolveria a ocorrencia ao estado de
  -- declarar, que e recurso pela porta dos fundos: abrir outra enquete sobre o
  -- mesmo dia esta fora de escopo por decisao de produto.
  if o.status = 'atrasado' and o.minutos_declarados is not null then
    return json_build_object('error', 'ja_validada');
  end if;

  -- Estorno da marcacao de HOJE em rotina de janela.
  if h.regra_frequencia->>'tipo' in ('n_por_semana', 'n_por_mes') then
    if o.ultima_marcacao_sp is distinct from public.hoje_sp() then
      return json_build_object('error', 'fora_do_dia');
    end if;

    if o.ouro_ultima = 0 or o.ouro_creditado < o.ouro_ultima then
      return json_build_object('error', 'sem_contabilidade');
    end if;

    if (select ouro from profiles where id = o.user_id) < o.ouro_ultima then
      return json_build_object('error', 'saldo_gasto');
    end if;

    update profiles
       set ouro = ouro - o.ouro_ultima,
           xp = greatest(0, xp - o.ouro_ultima)
     where id = o.user_id
     returning ouro into v_ouro;

    update occurrences
       set vezes_feitas = vezes_feitas - 1,
           ouro_creditado = ouro_creditado - o.ouro_ultima,
           status = case when o.status = 'feito' then 'pendente' else o.status end,
           feito_em = case when o.status = 'feito' then null else feito_em end,
           ultima_marcacao_sp = null,
           -- Mesma devolucao de toque do ramo de cima, e so quando a janela
           -- volta a `pendente`: fora disso o `check_in` nunca zerou o campo.
           proximo_toque_em = case when o.status = 'feito'
                                then v_toque else proximo_toque_em end,
           ouro_ultima = 0
     where id = p_occ;

    if o.status = 'feito' then
      update streaks
         set atual = coalesce(o.streak_anterior, 0),
             ultima_data_sp = o.data_streak_anterior
       where habit_id = o.habit_id and user_id = o.user_id;
    end if;

    return json_build_object(
      'ok', true,
      'ouro', v_ouro,
      'ouro_devolvido', o.ouro_ultima,
      'vezes_feitas', o.vezes_feitas - 1
    );
  end if;

  -- So o dia corrente. Desmarcar o passado mexeria em ofensiva ja fechada e em
  -- ranking que os outros ja viram.
  if o.data_sp <> public.hoje_sp() then
    return json_build_object('error', 'fora_do_dia');
  end if;

  -- Marcacao que nunca pagou: devolve o copo e mais nada.
  if o.status <> 'feito' and o.vezes_feitas > 0 and o.ouro_creditado = 0 then
    update occurrences set vezes_feitas = vezes_feitas - 1 where id = p_occ;
    return json_build_object(
      'ok', true,
      'ouro', (select ouro from profiles where id = o.user_id),
      'ouro_devolvido', 0,
      'vezes_feitas', o.vezes_feitas - 1
    );
  end if;

  -- Check-in sem contabilidade gravada e de antes da 0019.
  if o.ouro_creditado = 0 then
    return json_build_object('error', 'sem_contabilidade');
  end if;

  -- Estorno nunca perdoa diferenca: clamp em zero aqui era ouro infinito.
  if (select ouro from profiles where id = o.user_id) < o.ouro_creditado then
    return json_build_object('error', 'saldo_gasto');
  end if;

  update profiles
     set ouro = ouro - o.ouro_creditado,
         xp = greatest(0, xp - o.ouro_creditado)
   where id = o.user_id
   returning ouro into v_ouro;

  -- A ocorrencia voltou ao zero: a comprovacao e a declaracao voltam junto. Os
  -- votos tambem, e e a mesma razao das outras colunas: enquete resolvida de um
  -- check-in que nao existe mais nao e historico, e restos de declaracao
  -- deixariam a ocorrencia `pendente` e nao declaravel ao mesmo tempo.
  delete from votos_validacao where occurrence_id = p_occ;

  update occurrences
     set vezes_feitas = 0,
         status = 'pendente',
         feito_em = null,
         foto_path = null,
         minutos_declarados = null,
         validacao_ate = null,
         ouro_creditado = 0,
         ultima_marcacao_sp = null,
         proximo_toque_em = v_toque,
         ouro_ultima = 0,
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

-- ---------------------------------------------------- 11. quem ignora em_validacao
--
-- Nenhuma das duas funcoes abaixo muda, e isso e conferido, nao presumido:
--
--   `marcar_atrasadas` varre `where o.status = 'pendente'`. Ocorrencia esperando
--   o grupo nao esta pendente, entao nao perde vida nem tem ofensiva zerada. E a
--   reprovada sai da resolucao ja como `atrasado`, que tambem nao e `pendente`:
--   ela nunca volta a passar por ali, entao reprovar nunca custa vida.
--
--   `toques_pendentes` filtra `status in ('pendente', 'atrasado')`. Quem
--   declarou nao e cutucado sobre o que ja fez. Alem disso o `check_in` deste
--   modulo zera `proximo_toque_em`, que e a outra metade da mesma trava.

-- ------------------------------------------------------------------ 12. cron

-- DOIS JOBS, NUNCA UM COMANDO COM AS DUAS COISAS. O pg_cron roda o comando
-- inteiro numa transacao: uma excecao dentro de UMA resolucao desfaria junto a
-- cobranca de vida e a marcacao de atrasado daquela hora, para os 7 usuarios,
-- toda hora, em silencio. Job separado e transacao separada, e a resolucao que
-- estourar nao leva mais nada junto.
--
-- `marcar-atrasadas` (jobid 2) fica exatamente como esta hoje, e nao depende de
-- nada deste arquivo: ela varre `status = 'pendente'`, e `em_validacao` nunca
-- e pendente. Reescrita com o mesmo `jobname` e o mesmo comando de proposito,
-- para que o estado final seja o mesmo tendo ou nao passado por aqui.
select cron.schedule(
  'marcar-atrasadas',
  '5 * * * *',
  $cron$select public.marcar_atrasadas()$cron$
);

-- Dez minutos depois, para nao disputar a mesma janela. O que sobrar do `limit`
-- sai na hora seguinte, e prazo de 48 horas nao se importa com 10 minutos.
select cron.schedule(
  'resolver-validacoes',
  '15 * * * *',
  $cron$select public.resolver_validacoes()$cron$
);
