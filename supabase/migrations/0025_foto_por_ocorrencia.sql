-- 0025_foto_por_ocorrencia
--
-- Nove furos achados em revisoes adversariais. O primeiro e o sexto sao
-- bloqueantes.
--
-- 1. BLOQUEANTE: a foto nao era da ocorrencia.
--    `check_in` fazia duas perguntas sobre `foto_path`: comeca com `auth.uid()`
--    (0013) e existe em `storage.objects` (0019). Nunca fez a terceira, que e a
--    que importa: essa foto e DESTE check-in? O revisor pegou o `foto_path` de
--    uma ocorrencia de agua e mandou numa ocorrencia "Academia" de grupo com
--    `exige_foto = true`. Recebeu os 10 de ouro. Uma foto na vida satisfazia
--    `exige_foto` para sempre, em qualquer rotina, para sempre.
--
--    O caminho passa a ser `<uid>/<occurrence_id>/<nome>.<ext>`, e a validacao
--    passa a exigir que o SEGUNDO segmento seja o id da ocorrencia que esta
--    sendo marcada. As tres perguntas viram uma funcao so, `foto_da_ocorrencia`,
--    porque regra de foto que existe em uma das duas funcoes de check-in e regra
--    que da para contornar pela outra (CLAUDE.md, "funcao irma esquecida").
--
--    A policy do bucket nao muda: `p_checkins_insert` so olha
--    `(storage.foldername(name))[1] = auth.uid()::text`, e com um nivel a mais
--    esse primeiro segmento continua sendo o uid. Conferido no banco, nao
--    presumido.
--
--    Rotina de varias marcacoes no mesmo dia continua reusando a foto da propria
--    ocorrencia: e o `coalesce(p_foto, o.foto_path)` que ja existia, e agora ele
--    reusa uma foto que comprovadamente e daquela ocorrencia.
--
-- 2. ALTO: desfazer deixava a foto para tras. `desfazer_check_in` zerava
--    `vezes_feitas` e `ouro_creditado` e mantinha `foto_path`. Marcar com foto,
--    desmarcar, remarcar sem foto pagava de novo, porque o `coalesce(p_foto,
--    o.foto_path)` achava a foto orfa. O desfazer completo passa a limpar.
--
-- 3. ALTO: `regra_valida` (0007) devolvia NULL para jsonb torto, e `if not
--    regra_valida(...)` nao dispara com NULL. O habito entrava e
--    `gerar_ocorrencias` estourava 23502, devolvendo ao navegador o corpo da
--    funcao e o id de outro usuario no DETAIL. Bug e vazamento no mesmo lugar.
--
-- 4. MEDIO: `token_rapido` e documentado como de uso unico que gira a cada
--    chamada (`quick-check-in/index.ts:8`). `check_in_por_token` girava,
--    `check_in` nunca girou: marcar pelo app deixava o token da notificacao
--    valido. Agora os dois giram.
--
-- 5. BAIXO: `p_acao` sem lista branca. Qualquer string diferente de `adiar` caia
--    no caminho de check-in. Valor desconhecido passa a ser recusado, nao
--    interpretado.
--
-- 6. BLOQUEANTE: "N vezes por semana" aceitava as tres marcacoes no mesmo
--    minuto. A ocorrencia de `n_por_semana` cobre a SEMANA inteira com
--    `vezes_alvo = 3`, e nada olhava o dia da marcacao: tres cliques seguidos
--    fechavam a semana e pagavam as tres. Medido: saldo de 24 para 54 num
--    minuto, com uma foto so. Idem `n_por_mes`.
--
--    Passa a valer UMA marcacao por dia nesses dois tipos. Diaria, modulo de
--    horario e modulo de agua nao mudam: agua e varias vezes NO MESMO dia de
--    proposito, e travar por dia mataria o modulo.
--
-- 7. ALTO: esse ouro nao tinha estorno. `desfazer_check_in` recusava com
--    `fora_do_dia` porque a `data_sp` da ocorrencia e o domingo (ou o ultimo
--    dia do mes), nunca o dia em que a pessoa marcou. Com uma marcacao por dia,
--    cada clique virou escasso: um clique errado custaria um slot da semana
--    inteira, sem volta. Agora da para desfazer a marcacao FEITA HOJE,
--    devolvendo exatamente o que ela pagou, guardado em `ouro_ultima`.
--
-- 8. MEDIO: o token girava a cada copo. O item 4 acima fez `check_in` girar
--    `token_rapido` em toda chamada, e em rotina de agua isso mata a
--    notificacao das 8h assim que a pessoa marca o primeiro copo pela tela:
--    tocar em Concluir na notificacao devolveria erro numa rotina que ainda
--    esta aberta. O token passa a girar quando a ocorrencia FECHA. Em
--    ocorrencia de uma marcacao so, que e a maioria esmagadora, fechar e marcar
--    sao a mesma coisa, entao o uso unico continua valendo onde importa.
--
-- 9. ALTO: a foto valia para a janela inteira. O `coalesce(p_foto, o.foto_path)`
--    existe para a rotina de varias marcacoes NO MESMO DIA nao pedir foto a cada
--    marcacao, e para isso ele esta certo. So que a ocorrencia de `n_por_semana`
--    e a de `n_por_mes` cobrem varios dias, e com o item 6 passaram a aceitar uma
--    marcacao por dia: a foto do primeiro dia continuava comprovando os dias
--    seguintes da mesma janela, e so o primeiro dia precisava provar. Mesma
--    familia do item 1, a foto de uma ocorrencia valendo em outra, agora dentro
--    da mesma ocorrencia.
--
--    A foto guardada passa a valer so quando a marcacao anterior foi HOJE, o que
--    o `ultima_marcacao_sp` do item 6 ja sabe responder. Agua e qualquer rotina
--    de varias marcacoes no mesmo dia nao sentem, porque a marcacao anterior foi
--    hoje; rotina diaria e modulo de horario tampouco, porque a primeira marcacao
--    fecha a ocorrencia. Uma funcao so, `foto_de_hoje`, chamada pelas duas
--    funcoes de check-in, pelo mesmo motivo do item 1.
--
-- Segunda rodada adversarial, seis furos a mais. Todos medidos.
--
-- 10. BLOQUEANTE: o item 9 filtrava so a foto GUARDADA. Reenviar o mesmo
--     `p_foto` passava direto, porque `foto_da_ocorrencia` nao tinha nocao de
--     data: em `n_por_semana` com `exige_foto`, o mesmo caminho pagou 10 por dia,
--     30 no total, com um arquivo so, e o caminho era adivinhavel porque o front
--     gravava sempre `foto.webp`. A pergunta certa nunca foi "esse arquivo e
--     seu", e "esse arquivo foi enviado agora, para este ato". `foto_da_ocorrencia`
--     passa a exigir `updated_at` de hoje, e o front passa a gravar nome unico
--     por envio (`useCheckIn.ts`).
--
-- 11. ALTO: a mesma foto de ontem pagava pelo `check_in` e era recusada com
--     `foto_obrigatoria` pelo `check_in_por_token`. Abrir o app em vez de tocar
--     na notificacao contornava a regra. Cai junto com o item 10, porque agora as
--     duas fazem a mesma pergunta sobre a mesma coluna.
--
-- 12. ALTO: o item 8 acima transformou o token em credencial de varios usos. Um
--     `token_rapido` marcou os 5 copos de agua e os 3 dias de uma janela
--     `n_por_semana`, 30 de ouro, porque ele so girava ao FECHAR. Agora o
--     `check_in_por_token` gira a cada uso bem sucedido, que e o unico jeito de
--     uso unico ser unico. O `check_in`, que e o app e nao consome token nenhum,
--     continua girando so ao fechar, para nao matar notificacao ja entregue de
--     rotina ainda aberta: o item 8 continua valendo para ele.
--
-- 13. ALTO: recusa girava o token. O ramo `foto_obrigatoria` (e o `fora_da_faixa`)
--     giravam numa ocorrencia ainda aberta, exatamente o que o comentario do item
--     8 diz que nao pode. Recusa nunca gira: quem nao marcou nada nao gastou uso.
--
-- 14. MEDIO: `ouro_creditado` ficava negativo. O desfazer de janela fazia
--     `ouro_creditado - ouro_ultima` sem conferir nada, e o revisor forcou -5.
--     `ouro_creditado` e a fonte do ranking do grupo, entao linha torta corrompe
--     o ranking em silencio. Recusa, sem clamp em zero, pela mesma razao de
--     sempre: clamp esconde o caso que precisa ser visto.
--
-- 15. MEDIO: janela vencida continuava pagando. Ocorrencia de `n_por_semana`
--     vencida ha 30 dias pagou 10. Nesses dois tipos o check-in passa a ser
--     recusado depois que a janela fecha. Rotina diaria e modulo de horario nao
--     mudam: la marcar atrasado e permitido de proposito.

-- ------------------------------------------------- 1. a foto e da ocorrencia?

-- Tres perguntas, uma resposta. Substitui o par `foto_do_dono` + `exists em
-- storage.objects` que estava copiado dentro do `check_in`.
--
-- `split_part` em vez de `storage.foldername`: a funcao do storage descarta o
-- ultimo segmento, entao ela responde "quais sao as pastas", e aqui a pergunta
-- e "qual e o segundo segmento", que e diferente quando o nome tem barra.
--
-- Segmento 3 nao vazio e o que impede `<uid>/<occ_id>` sem arquivo nenhum de
-- passar por caminho valido.
--
-- Nao e `security definer` de proposito: quem chama ja e, e o `stable` roda com
-- os privilegios de quem chamou. Um definer aqui daria leitura de
-- `storage.objects` a qualquer um que ganhasse execute por descuido.
--
-- QUARTA pergunta, e a que faltava: essa foto foi enviada HOJE? Sem ela, a
-- pergunta respondida era "esse arquivo e seu e e desta ocorrencia", que uma
-- ocorrencia de `n_por_semana` responde de graca a semana inteira: o revisor
-- reenviou o mesmo `p_foto` do primeiro dia em cada dia da janela e recebeu 10
-- por dia, 30 no total, com um arquivo so. O `foto_de_hoje` abaixo nao alcanca
-- esse caso, porque ele filtra a foto GUARDADA e o `p_foto` chega por fora.
--
-- `updated_at`, nunca `created_at`: o upload do Supabase Storage aceita upsert,
-- e no upsert a linha e ATUALIZADA. `created_at` fica com a data do primeiro
-- envio e passa a mentir sobre um arquivo que acabou de ser reenviado;
-- `updated_at` sobe a cada gravacao. Conferido no banco: existem linhas em
-- `storage.objects` com `created_at <> updated_at`, que so o upsert produz.
-- Reenviar o mesmo caminho hoje e um envio de hoje, e passar e o certo.
create or replace function public.foto_da_ocorrencia(
  p_caminho text, p_user uuid, p_occ uuid
) returns boolean
language sql stable as $$
  select p_caminho is not null
     and split_part(p_caminho, '/', 1) = p_user::text
     and split_part(p_caminho, '/', 2) = p_occ::text
     and split_part(p_caminho, '/', 3) <> ''
     and exists (
       select 1 from storage.objects
        where bucket_id = 'checkins' and name = p_caminho
          and (updated_at at time zone 'America/Sao_Paulo')::date = public.hoje_sp()
     )
$$;

revoke execute on function public.foto_da_ocorrencia(text, uuid, uuid)
  from public, anon, authenticated;

-- A foto guardada na ocorrencia so volta a valer quando a marcacao anterior foi
-- HOJE. Ver o item 9 do cabecalho: sem isso a foto do primeiro dia de uma janela
-- de `n_por_semana` ou `n_por_mes` comprovava os dias seguintes dela.
--
-- Funcao, e nao um `case` copiado nas duas funcoes de check-in, pelo mesmo
-- motivo da `foto_da_ocorrencia`: regra de foto que existe numa das duas e
-- regra que da para contornar pela outra (CLAUDE.md, "funcao irma esquecida").
--
-- `p_ultima` nulo (ocorrencia nunca marcada, ou zerada pelo desfazer) devolve
-- nulo pela propria comparacao, que e a resposta certa: nao ha marcacao anterior
-- para herdar foto de nenhuma.
create or replace function public.foto_de_hoje(p_caminho text, p_ultima date)
returns text
language sql stable as $$
  select case when p_ultima = public.hoje_sp() then p_caminho end
$$;

revoke execute on function public.foto_de_hoje(text, date)
  from public, anon, authenticated;

-- ------------------------------------------------------------ 2. data_valida

-- `quinzenal` e `avulsa` guardam uma data em texto, e `regra_valida` so
-- perguntava se o campo existia. Ancora lixo passava, e `gerar_ocorrencias`
-- estourava no `(regra->>'ancora')::date`.
--
-- Cast dentro de bloco com excecao porque nao ha jeito imutavel de perguntar
-- "isto e uma data?" sem tentar: `pg_input_is_valid` e STABLE, e `regra_valida`
-- e IMMUTABLE por obrigacao (a check constraint `habit_regra_valida` exige).
create or replace function public.data_valida(t text) returns boolean
language plpgsql immutable strict as $$
begin
  perform t::date;
  return true;
exception when others then
  return false;
end $$;

revoke execute on function public.data_valida(text) from public, anon, authenticated;

-- ---------------------------------------------------------- 3. regra_valida

-- Duas classes de defeito de uma vez:
--
--   a) NULL. `(r->>'vezes')::int between 1 and 7` com `vezes` ausente e NULL, e
--      NULL nao e recusa: nem no `if not ...` da `criar_habito`, nem numa check
--      constraint, onde NULL passa. O `coalesce(..., false)` externo fecha isso
--      para todos os ramos de uma vez.
--   b) Excecao. `('abc')::int` nao devolve NULL, levanta 22P02, e o erro cru ia
--      para o navegador. O `~ '^[0-9]{1,2}$'` garante que o cast so acontece
--      quando ele nao pode falhar, e o teto de dois digitos evita o overflow de
--      `int` que um numero gigante causaria.
--
-- A funcao continua IMMUTABLE e a constraint `habit_regra_valida` continua
-- valendo: as 11 rotinas em producao foram conferidas contra a versao nova e
-- todas passam, entao nenhum UPDATE futuro nelas vai bater na constraint.
create or replace function public.regra_valida(r jsonb) returns boolean
language sql immutable as $$
  select coalesce(case r->>'tipo'
    when 'diaria' then true
    when 'semanal_dias' then jsonb_typeof(r->'dias') = 'array' and jsonb_array_length(r->'dias') between 1 and 7
    when 'dias_uteis' then jsonb_typeof(r->'dias') = 'array' and jsonb_array_length(r->'dias') between 1 and 5
    when 'quinzenal' then public.data_valida(r->>'ancora')
    when 'mensal_dia' then (r->>'dia') ~ '^[0-9]{1,2}$' and (r->>'dia')::int between 1 and 31
    when 'n_por_semana' then (r->>'vezes') ~ '^[0-9]{1,2}$' and (r->>'vezes')::int between 1 and 7
    when 'n_por_mes' then (r->>'vezes') ~ '^[0-9]{1,2}$' and (r->>'vezes')::int between 1 and 31
    when 'avulsa' then public.data_valida(r->>'data')
    else false
  end, false)
$$;

-- `create or replace` preserva a ACL antiga, entao esta funcao so estava fechada
-- por heranca da 0007. Em banco limpo ela nasceria aberta a `authenticated`, que
-- e a primeira armadilha do CLAUDE.md. Revoke explicito, como toda funcao daqui.
--
-- Nao quebra a check constraint `habit_regra_valida`: `habits` nao tem insert
-- nem update para `anon` nem para `authenticated` (conferido no banco), entao
-- quem avalia a constraint e sempre o dono das RPCs `security definer`. Mesma
-- situacao da `data_valida` acima, que a `regra_valida` chama.
revoke execute on function public.regra_valida(jsonb) from public, anon, authenticated;

-- ------------------------------------------------------------ 4. criar_habito

-- Corpo identico ao da 0023, com uma unica troca: `if not regra_valida(...)`
-- vira `if regra_valida(...) is not true`. A funcao acima ja nao devolve NULL,
-- mas a chamada tambem nao pode depender disso: e ela que decide se o habito
-- entra, e "nao sei" nunca pode virar "pode entrar" num ponto de entrada.
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
    -- `is not true` e nao `not`: com jsonb torto a resposta era NULL, e
    -- `if not NULL` nao dispara.
    if public.regra_valida(v_regra) is not true then
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

-- ------------------------------------ 5. o dia da marcacao e o que ela pagou

-- Duas colunas para os itens 6 e 7.
--
-- `ultima_marcacao_sp` e o dia da ultima marcacao. E ele, e so ele, que recusa
-- a segunda marcacao do mesmo dia em `n_por_semana` e `n_por_mes`: contar
-- linhas de historico nao serve, porque historico de marcacao nao existe, a
-- ocorrencia guarda so o contador.
--
-- `ouro_ultima` e o que ESSA marcacao pagou, gravado no instante em que ela
-- paga, do mesmo jeito que `ouro_creditado` guarda o total da ocorrencia. Sem
-- ele o estorno teria que recalcular `ceil(ouro_base * multiplicador)`, e valor
-- recalculado nao e estorno: basta a ofensiva mudar entre marcar e desmarcar
-- para o estorno devolver mais do que pagou.
--
-- `occurrences` nao tem update nem insert para `anon` nem para `authenticated`
-- (conferido no banco: so `postgres` e `service_role` tem), e o `grant select`
-- dessa tabela e por coluna desde a 0019, entao coluna nova nasce invisivel para
-- o cliente.
--
-- `ouro_ultima` fica assim: e contabilidade, e contabilidade de check-in nao vai
-- para o cliente, do mesmo jeito que `ouro_creditado` nao vai (0021).
--
-- `ultima_marcacao_sp` ganha select, e so ele. Sem essa coluna a tela nao tem
-- como saber que a janela ja foi marcada hoje: o botao prometia "Marcar 2 de 3"
-- e so descobria `ja_marcado_hoje` no clique, e o botao de desfazer aparecia num
-- caso que so devolve `fora_do_dia`. O dia em que a pessoa marcou a propria
-- rotina nao e segredo dela para ela, e para o colega de grupo ele nao diz mais
-- do que o `status` e o `vezes_feitas` que a 0019 ja liberou.
alter table occurrences add column if not exists ultima_marcacao_sp date;
alter table occurrences add column if not exists ouro_ultima int not null default 0;

grant select (ultima_marcacao_sp) on occurrences to authenticated;

-- ---------------------------------------------------------------- 6. check_in

-- Corpo da 0024 com oito trocas: o status vem antes da foto, a foto passa por
-- `foto_da_ocorrencia` (que agora tambem exige envio de hoje), a exigencia de
-- foto passa pela mesma funcao (e nao mais por "nao e nulo"), a foto guardada so
-- se reusa quando a marcacao anterior foi hoje, uma marcacao por dia em rotina
-- de janela, janela fechada nao paga mais, o dia e o valor da marcacao ficam
-- gravados, e o `token_rapido` gira ao fechar a ocorrencia.
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

  -- Quatro perguntas sobre a foto: de quem e a pasta, de QUAL OCORRENCIA e a
  -- subpasta, se o arquivo existe mesmo e se ele foi enviado HOJE. Faltando a
  -- segunda, a foto de uma ocorrencia servia de comprovacao para qualquer outra;
  -- faltando a quarta, a foto de ontem comprovava o dia de hoje da mesma janela.
  -- Isto vale para todo modulo, agua inclusive: a agua deixou de EXIGIR foto,
  -- nao de VALIDAR a que vier.
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

  -- `coalesce(p_foto, ...)` continua sendo o reuso da foto pela rotina de
  -- varias marcacoes no mesmo dia, e agora reusa uma foto que sabidamente e
  -- DESTA ocorrencia. Foto em caminho antigo (`<uid>/<occ>.webp`, sem subpasta)
  -- deixa de contar como comprovacao: ela e indistinguivel da foto de qualquer
  -- outra rotina, que e exatamente o furo.
  --
  -- E a foto guardada so vale de novo quando a marcacao anterior foi HOJE (item
  -- 9). Ver `foto_de_hoje`.
  if coalesce(v_exige_foto, false)
     and not public.foto_da_ocorrencia(
           coalesce(p_foto, public.foto_de_hoje(o.foto_path, o.ultima_marcacao_sp)),
           auth.uid(), p_occ) then
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
         -- Token de uso unico gira aqui tambem. Ele girava so no caminho da
         -- notificacao, entao marcar pelo app deixava vivo o token que ja tinha
         -- saido na carga do push: uso unico que nao era unico.
         --
         -- Ao FECHAR, nao a cada marcacao. Girar no copo 1 de 5 matava a
         -- notificacao das 8h no instante em que a pessoa marcasse pela tela, e
         -- o Concluir dela devolveria `token_invalido` numa rotina que ainda
         -- esta aberta. Em ocorrencia de uma marcacao so, fechar e marcar sao a
         -- mesma coisa e o uso unico continua exatamente como estava.
         token_rapido = case when v_completou then gen_random_uuid() else token_rapido end,
         -- O dia da marcacao e o que ela pagou. Gravados sempre, para todo
         -- tipo: quem le e que decide se importa (a trava de um por dia e o
         -- estorno so olham `n_por_semana` e `n_por_mes`), e um `case` aqui
         -- seria uma segunda lista de tipos para manter igual a primeira.
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

-- ------------------------------------------- 7. check_in pela notificacao

-- Corpo da 0024 com as mesmas trocas do `check_in`: lista branca de `p_acao` na
-- entrada, exigencia de foto pela mesma `foto_da_ocorrencia`, uma marcacao por
-- dia em rotina de janela, janela fechada nao pagando mais, e dia e valor da
-- marcacao gravados.
--
-- Duas regras de token so existem aqui, e as duas sao sobre uso unico: o token
-- gira em TODA marcacao bem sucedida, e NUNCA numa recusa. O `check_in` nao
-- recebe token nenhum, entao nao ha o que espelhar la.
--
-- Toda regra nova precisa existir aqui tambem: este caminho ja foi a porta dos
-- fundos deste projeto uma vez, pagando ouro sem gravar `ouro_creditado`.
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
  -- INTERPRETADO, e a acao mais cara era o padrao. Recusar vem primeiro que
  -- ler a ocorrencia de proposito, senao uma acao invalida ainda queimaria o
  -- token de quem mandou.
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

  -- Mesma trava de uma marcacao por dia do `check_in`. Regra que existisse so
  -- numa das duas funcoes seria regra contornavel pela outra, e esta ja foi a
  -- porta dos fundos deste projeto uma vez.
  --
  -- O token NAO gira nesta recusa, ao contrario das duas abaixo: a ocorrencia
  -- continua aberta e a marcacao de amanha e legitima, entao queimar o token
  -- aqui mataria a notificacao que ainda vai ser usada.
  if h.regra_frequencia->>'tipo' in ('n_por_semana', 'n_por_mes')
     and o.ultima_marcacao_sp is not distinct from public.hoje_sp() then
    return json_build_object('error', 'ja_marcado_hoje');
  end if;

  -- Mesma trava de janela fechada do `check_in`, e tambem sem girar o token: a
  -- recusa nao consome uso nenhum.
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

  -- Mesmas duas funcoes do `check_in`: aqui a foto so pode vir de `o.foto_path`,
  -- e ela tem que ser desta ocorrencia e da marcacao de hoje igual la. Regra que
  -- existisse so numa das duas seria regra contornavel pela outra, e este
  -- caminho nao tem `p_foto` para contornar com foto nova: em dia novo de janela
  -- a marcacao pela notificacao passa a exigir que a pessoa abra o app e mande a
  -- foto, que e exatamente o que `exige_foto` quer dizer.
  if coalesce(v_exige_foto, false)
     and not public.foto_da_ocorrencia(
           public.foto_de_hoje(o.foto_path, o.ultima_marcacao_sp),
           o.user_id, o.id) then
    -- RECUSA NAO GIRA. Este ramo girava o token de uma ocorrencia ainda aberta,
    -- que e exatamente o que o item 8 do cabecalho diz que nao pode: a pessoa
    -- tocou em Concluir, nao marcou nada, e perdia a notificacao. Uso unico
    -- conta uso, e recusa nao e uso.
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
      -- Mesma regra do ramo acima: recusa nao gira. Aqui a ocorrencia ate esta
      -- perdida para hoje, mas queimar o token nao adianta nada e a regra tem
      -- que ser uma so, senao volta a ser caso a caso.
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
         -- Gira em TODA marcacao bem sucedida, ao contrario do `check_in`. O
         -- item 8 do cabecalho mandou girar so ao fechar, e isso transformou o
         -- token numa credencial de varios usos: um unico `token_rapido` marcou
         -- os 5 copos de agua e os 3 dias de uma janela `n_por_semana`, 30 de
         -- ouro. Este e o caminho DO TOKEN, e uso unico tem que ser unico.
         --
         -- O `check_in` continua girando so ao fechar, e a assimetria e o ponto:
         -- la a pessoa marcou pela tela, sem gastar token nenhum, e queimar o
         -- token de uma rotina ainda aberta mataria a notificacao das 8h que ja
         -- foi entregue e ainda serve.
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

-- Sem grant nenhum, igual a 0023 e a 0024: quem chama e a edge function
-- `quick-check-in` com `service_role`. Um `grant ... to authenticated` aqui
-- daria ao cliente um caminho de check-in que nao passa por `auth.uid()`.
revoke execute on function public.check_in_por_token(uuid, text) from public, anon, authenticated;

-- ------------------------------------------------------- 8. desfazer_check_in

-- Corpo da 0023 com duas trocas: o desfazer COMPLETO tambem limpa `foto_path`,
-- e rotina de janela (`n_por_semana`, `n_por_mes`) ganha estorno da marcacao
-- feita hoje.
--
-- Por que so o completo. O desfazer completo devolve a ocorrencia ao zero:
-- `vezes_feitas = 0`, `status = 'pendente'`, `ouro_creditado = 0`. Manter a foto
-- ali era guardar uma comprovacao de um check-in que nao existe mais, e o
-- `coalesce(p_foto, o.foto_path)` do `check_in` a encontrava: marcar com foto,
-- desmarcar e remarcar sem foto pagava de novo com prova de nada.
--
-- O ramo parcial da agua nao zera nada: ele devolve UMA marcacao de N e o dia
-- continua em andamento, com as outras marcacoes de pe. A foto continua sendo a
-- comprovacao valida daquela ocorrencia, que nao voltou ao zero, entao apagar
-- ali destruiria a prova de marcacoes que ninguem desfez. E, de todo modo,
-- rotina de agua nunca exige foto (0024), entao o que sobra ali nao paga nada.
create or replace function public.desfazer_check_in(p_occ uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare o occurrences; h habits; v_ouro int;
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

  -- Estorno da marcacao de HOJE em rotina de janela. A `data_sp` de
  -- `n_por_semana` e o domingo e a de `n_por_mes` e o ultimo dia do mes, entao
  -- o `fora_do_dia` logo abaixo recusava todas: esse ouro nunca teve estorno.
  -- Enquanto as tres marcacoes cabiam no mesmo minuto isso quase nao doia; com
  -- uma por dia, cada clique virou escasso e um clique errado custaria um slot
  -- da semana inteira.
  --
  -- Devolve `ouro_ultima`, que e o que aquela marcacao pagou, nunca um valor
  -- recalculado, e devolve UMA marcacao, nunca a janela inteira: as marcacoes
  -- dos outros dias nao foram desfeitas por ninguem.
  if h.regra_frequencia->>'tipo' in ('n_por_semana', 'n_por_mes') then
    -- Marcacao de outro dia nao se desfaz, que e a mesma regra do dia corrente
    -- valendo para uma ocorrencia cuja `data_sp` nao serve de referencia.
    -- Depois de desfazer, `ultima_marcacao_sp` fica null e a segunda chamada
    -- cai exatamente aqui: nao existe estorno em dobro.
    if o.ultima_marcacao_sp is distinct from public.hoje_sp() then
      return json_build_object('error', 'fora_do_dia');
    end if;

    -- Mesma guarda de `sem_contabilidade` do caminho de baixo: sem o registro
    -- do que foi pago nao existe estorno honesto. Hoje so alcanca marcacao
    -- anterior a esta migration, e e por isso que ela fica.
    --
    -- E o total tem que comportar a parcela. `ouro_creditado - ouro_ultima` era
    -- feito as cegas e o revisor forcou -5 na coluna: `ouro_creditado` e a fonte
    -- do ranking do grupo (0021), entao linha torta corrompe o ranking em
    -- silencio, sem ninguem receber erro nenhum. Sem clamp em zero, pelo motivo
    -- de sempre: clamp esconde exatamente o caso que precisa aparecer.
    if o.ouro_ultima = 0 or o.ouro_creditado < o.ouro_ultima then
      return json_build_object('error', 'sem_contabilidade');
    end if;

    -- Sem clamp em zero, pelo mesmo motivo de sempre: quem ja gastou o ouro na
    -- loja nao desmarca de graca, senao e maquina de ouro infinita.
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
           ouro_ultima = 0
     where id = p_occ;

    -- So a marcacao que FECHOU a janela mexeu na ofensiva, entao so ela a
    -- devolve. `streak_anterior` continua gravado: as marcacoes dos outros dias
    -- seguem de pe e um fechamento futuro tem que voltar ao mesmo ponto.
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
         -- A ocorrencia voltou ao zero: a comprovacao volta junto. Ver o
         -- cabecalho.
         foto_path = null,
         ouro_creditado = 0,
         -- A ocorrencia voltou ao zero: o registro da ultima marcacao volta
         -- junto, senao sobra um "pagou tanto, tal dia" de um check-in que nao
         -- existe mais.
         ultima_marcacao_sp = null,
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

-- 10. Privilegio que ninguem usa, em toda tabela do schema.
--
-- O Supabase concede `all` para `anon` e `authenticated` na criacao, e este
-- projeto so revogou select, insert, update e delete. Sobraram TRUNCATE, TRIGGER
-- e REFERENCES nas treze tabelas.
--
-- Nenhum dos tres e alcancavel pelo PostgREST hoje, entao isto nao fecha furo
-- aberto: fecha a porta antes de alguem construir o corredor. TRIGGER e o pior
-- dos tres, porque e permissao de rodar codigo na tabela dos outros. Nada no app
-- usa nenhum deles, entao revogar nao quebra nada.
revoke truncate, trigger, references on all tables in schema public
  from public, anon, authenticated;
