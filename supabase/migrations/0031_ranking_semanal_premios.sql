-- 0031_ranking_semanal_premios
--
-- O ranking do grupo deixa de ser mensal e passa a ser SEMANAL, e o grupo ganha
-- uma competicao: o dono cadastra um premio em ouro para 1o, 2o e 3o lugar, e o
-- servidor paga sozinho toda segunda.
--
-- POR QUE A SEMANA, e nao o mes. A 0021 trocou a ofensiva pelo ouro e criou a
-- janela do mes com um motivo escrito: "sem a janela do mes, quem entrou
-- primeiro fica na frente para sempre e membro novo nasce perdendo". O mes leva
-- esse mesmo defeito na versao pequena: no dia 25 a disputa ja esta decidida e
-- quem esta em quarto nao tem mais o que fazer por seis dias. A semana devolve
-- um comeco de jogo a cada segunda, que e exatamente o que um app de habito
-- precisa vender. O acumulado continua embaixo, como memoria do grupo.
--
-- POR QUE O PREMIO E SERVER-AUTHORITATIVE ATE O FIM. Nenhuma tela decide quem
-- ganhou, quanto ganhou, nem quando. O cliente so LE `premiacoes`. Isso segue a
-- regra do projeto de que valor de jogo nasce no servidor, e aqui ela pesa mais
-- que em qualquer outro lugar: e a primeira vez que o app credita ouro sem
-- nenhum check-in por tras.
--
-- AS TRES TRAVAS CONTRA IMPRIMIR OURO:
--
--   1. A CHAVE `(group_id, semana, posicao)` E a trava contra pagar duas vezes.
--      Nao existe flag "ja paguei" em lugar nenhum: o credito sai das linhas que
--      o `insert ... on conflict do nothing` EFETIVAMENTE inseriu. Rodar a
--      funcao dez vezes na mesma segunda paga uma vez so, porque da segunda
--      chamada em diante o `returning` volta vazio e nao ha o que creditar.
--   2. GRUPO DE UMA PESSOA SO NAO PAGA. Sem isso, criar um grupo sozinho,
--      cadastrar 500 no primeiro lugar e fazer um check-in por semana seria uma
--      maquina de ouro sem nenhum adversario. Sao necessarias no minimo DUAS
--      pessoas com ouro na semana.
--   3. TETO DE 500 POR POSICAO, na constraint da tabela e na RPC. A loja tem
--      peca de 1500, e premio livre desvalorizaria de uma vez a loja inteira, o
--      bau e o ouro que todo mundo ja acumulou.
--   4. O PREMIO SO VALE PARA A SEMANA QUE COMECOU DEPOIS DELE. O ranking da
--      semana e visivel ao vivo, entao sem esta trava o dono olha o placar no
--      domingo a noite, se ve em primeiro, cadastra 500 no primeiro lugar,
--      recebe na segunda de manha e devolve para zero: autonegocio de custo
--      zero, repetivel toda semana. `groups.premios_em` guarda QUANDO o premio
--      mudou pela ultima vez, e `premiar_semana` so paga o grupo cuja data e
--      anterior ao inicio da semana premiada.
--
-- SEM RETROATIVIDADE, de proposito. A primeira premiacao e a da primeira semana
-- que FECHAR depois desta migration. `premiacoes` nasce vazia e ninguem recebe
-- nada por semana passada: pagar historico seria despejar ouro de meses na
-- carteira de todo mundo de uma vez.

-- =========================================================== 1. a semana em SP
--
-- `date_trunc('week')` do Postgres corta na SEGUNDA (padrao ISO), que e o que o
-- dono pediu. Conferido no banco de producao: em 2026-08-13 (quinta) devolve
-- 2026-08-10, uma segunda.
--
-- Sem `set search_path` e sem `security definer`, igual a `hoje_sp()` e a
-- `inicio_do_mes_sp()` que ela substitui: nao toca em tabela nenhuma, e sem o
-- SET o planner ainda consegue embutir a constante dentro das consultas que a
-- chamam.
create or replace function public.inicio_da_semana_sp()
returns date language sql stable as $$
  select date_trunc('week', (now() at time zone 'America/Sao_Paulo'))::date
$$;

-- Funcao nova nasce com execute para `public` e `anon` pelo default do Supabase.
-- Devolve so uma data, mas a regra do projeto e revogar dos TRES papeis, porque
-- tirar de `public, anon` NAO tira de `authenticated`.
--
-- NENHUM GRANT DE VOLTA, e isso foi conferido em `pg_proc.proacl` antes: os
-- unicos chamadores sao `ranking_grupo`, `posicoes_grupos` e `premiar_semana`,
-- todas `security definer` de dono `postgres`, e o cron roda com esse mesmo
-- papel. `hoje_sp()` vive assim desde a 0013, com `{postgres=X,service_role=X}`,
-- e nenhuma tela nunca a chamou direto.
revoke execute on function public.inicio_da_semana_sp() from public, anon, authenticated;

-- ==================================================== 2. o premio fica no grupo
--
-- Tres colunas em vez de tabela nova porque o premio e propriedade do grupo, uma
-- linha por posicao, sempre tres, nunca mais. Tabela filha aqui so criaria join
-- e a pergunta "e se faltar a linha do 2o lugar".
--
-- `default 0` faz todo grupo que ja existe nascer sem competicao: quem nao
-- cadastrar premio nenhum nao muda de comportamento em nada.
--
-- NAO EXISTE GRANT DE UPDATE PARA `authenticated` EM `groups`, e e isso que
-- protege estas colunas, nao o formulario. Conferido: a ACL da tabela e
-- `authenticated=rm`, so leitura. Quem escreve premio e `atualizar_grupo`, que e
-- `security definer` e confere o dono. Fosse `arw`, um PATCH direto no
-- PostgREST cadastraria 500 no proprio nome, e o furo ja aconteceu duas vezes
-- neste projeto (`item_equipado`, `avatar_base`).
alter table public.groups add column if not exists premio_1 int not null default 0;
alter table public.groups add column if not exists premio_2 int not null default 0;
alter table public.groups add column if not exists premio_3 int not null default 0;

-- QUANDO o premio foi definido pela ultima vez. E a trava contra o dono premiar
-- a si mesmo depois de ja saber quem ganhou: o placar da semana e visivel ao
-- vivo, entao sem ela bastava olhar no domingo, cadastrar 500 no proprio lugar,
-- receber na segunda e devolver para zero.
--
-- NULO POR PADRAO, e nao `now()`: grupo sem data nunca paga. Isso vale para o
-- grupo real que existe hoje, que fica sem premiacao ate o dono cadastrar o
-- premio e a semana seguinte fechar. E o comportamento desejado, nao um efeito
-- colateral: retroagir aqui seria pagar por uma competicao que ninguem sabia
-- que estava valendo.
alter table public.groups add column if not exists premios_em timestamptz;

alter table public.groups drop constraint if exists groups_premios_faixa;
alter table public.groups add constraint groups_premios_faixa check (
  premio_1 between 0 and 500
  and premio_2 between 0 and 500
  and premio_3 between 0 and 500
);

-- ============================================== 3. atualizar_grupo com o premio
--
-- DROP ANTES DO CREATE, e nao `create or replace`: parametro novo muda a
-- assinatura, e `create or replace` criaria uma SEGUNDA funcao com o mesmo nome
-- em vez de substituir a primeira. Duas sobrecargas de `atualizar_grupo` deixam
-- o PostgREST escolhendo qual chamar pelo formato do corpo, e a versao velha
-- continuaria viva ignorando premio calado.
--
-- O drop leva junto os grants, entao eles sao refeitos abaixo, sem esquecer o
-- `authenticated` no revoke: revogar de `public, anon` NAO tira o execute dele.
drop function if exists public.atualizar_grupo(uuid, text, boolean);

create or replace function public.atualizar_grupo(
  p_grupo uuid,
  p_nome text default null,
  p_exige_foto boolean default null,
  p_premio_1 int default null,
  p_premio_2 int default null,
  p_premio_3 int default null
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare v_nome text;
begin
  -- Grupo inexistente e grupo de terceiro respondem a MESMA coisa: resposta
  -- diferente deixaria descobrir quais grupos existem trocando o id no payload.
  if not exists (select 1 from groups where id = p_grupo and dono_id = auth.uid()) then
    return json_build_object('error', 'sem_permissao');
  end if;

  v_nome := nullif(trim(coalesce(p_nome, '')), '');

  if p_nome is not null and v_nome is null then
    return json_build_object('error', 'nome_vazio');
  end if;

  -- Faixa conferida AQUI, alem da constraint. A constraint e a trava real, mas
  -- ela aborta a transacao e o SDK entrega isso como falha de invocacao, sem o
  -- corpo `{ error }` que a tela sabe traduzir: o usuario veria erro sem texto.
  if coalesce(p_premio_1, 0) not between 0 and 500
     or coalesce(p_premio_2, 0) not between 0 and 500
     or coalesce(p_premio_3, 0) not between 0 and 500 then
    return json_build_object('error', 'premio_invalido');
  end if;

  -- `premios_em` so anda quando algum valor MUDA DE VERDADE, e a comparacao e
  -- entre valor antigo e valor novo, nunca "veio nao nulo": se salvar o mesmo
  -- numero reiniciasse o relogio, burlar a trava seria abrir a folha e apertar
  -- Salvar de novo. Do lado direito do `set`, cada coluna ainda vale o valor
  -- ANTIGO da linha, que e o que torna a comparacao possivel num comando so.
  update groups
     set nome = coalesce(left(v_nome, 40), nome),
         exige_foto = coalesce(p_exige_foto, exige_foto),
         premio_1 = coalesce(p_premio_1, premio_1),
         premio_2 = coalesce(p_premio_2, premio_2),
         premio_3 = coalesce(p_premio_3, premio_3),
         premios_em = case
           when coalesce(p_premio_1, premio_1) is distinct from premio_1
             or coalesce(p_premio_2, premio_2) is distinct from premio_2
             or coalesce(p_premio_3, premio_3) is distinct from premio_3
           then now()
           else premios_em
         end
   where id = p_grupo;

  return json_build_object('ok', true);
end $$;

revoke execute on function public.atualizar_grupo(uuid, text, boolean, int, int, int)
  from public, anon, authenticated;
grant execute on function public.atualizar_grupo(uuid, text, boolean, int, int, int)
  to authenticated;

-- ======================================================== 4. premiacoes
--
-- E o registro historico de quem levou o que, e AO MESMO TEMPO a trava de
-- pagamento. Uma coisa so de proposito: uma tabela de log paralela a um flag de
-- "ja pago" seriam duas verdades para o mesmo fato, e o dia em que
-- divergissem seria o dia em que alguem recebe duas vezes.
--
-- `semana` e a SEGUNDA que abriu a semana premiada, nunca o dia do pagamento: o
-- pagamento pode atrasar, a semana nao.
--
-- Sem `updated_em`: a linha nunca muda depois de escrita, e registro do que
-- aconteceu, igual a `vida_eventos`, `recaidas` e `intencoes`.
create table if not exists public.premiacoes (
  group_id uuid not null references public.groups(id) on delete cascade,
  semana date not null,
  posicao int not null check (posicao between 1 and 3),
  user_id uuid not null references public.profiles(id) on delete cascade,
  ouro int not null check (ouro > 0),
  criado_em timestamptz not null default now(),
  primary key (group_id, semana, posicao)
);

alter table public.premiacoes enable row level security;

-- A pergunta da policy e "quais sao meus grupos", nunca "sou membro deste
-- grupo": `e_membro` roda por linha varrida e `meus_grupos` roda uma vez.
drop policy if exists p_premiacoes_read on public.premiacoes;
create policy p_premiacoes_read on public.premiacoes for select
  using (group_id in (select public.meus_grupos()));

-- Leitura para membro, escrita para ninguem. Quem grava e `premiar_semana`, que
-- e `security definer`. Sem policy de insert, update ou delete: RLS ligada mais
-- zero policy ja e negar, e o `revoke all` e a segunda tranca. Revoga dos TRES
-- papeis: tirar de `public, anon` nao tira de `authenticated`.
revoke all on public.premiacoes from public, anon, authenticated;
grant select on public.premiacoes to authenticated;

-- NENHUM INDICE NOVO, e isso e decisao medida, nao esquecimento. A chave
-- primaria `(group_id, semana, posicao)` JA e o indice das duas unicas leituras
-- que existem: a policy filtra por `group_id`, e a tela pede as premiacoes de um
-- grupo ordenadas por `semana` desc. Indice que e subconjunto de outro e peso
-- morto em toda escrita, e a regra do projeto e nao criar o segundo.

-- ==================================================== 5. premiar_semana
--
-- Paga o podio da semana que ACABOU DE FECHAR, uma vez por semana, chamada pelo
-- `pg_cron`. Nao existe caminho de tela ate aqui.
--
-- CRITERIO IDENTICO AO DE `ranking_grupo`: ouro da janela desc, ofensiva total
-- desc, nome. Se o pagamento usasse outro criterio, a tela mostraria um podio e
-- o servidor pagaria outro, e o grupo teria razao em achar que foi roubado.
--
-- POR QUE ELA E SEGURA RODANDO ATRASADA, e isto e sutil:
-- `inicio_da_semana_sp() - 7` na terca, na quarta ou no domingo ainda devolve a
-- MESMA segunda, porque `inicio_da_semana_sp()` so muda quando vira a semana.
-- Entao um cron que falhou na segunda e rodou na terca paga exatamente a semana
-- certa. O teto conhecido: se ele falhar a SEMANA INTEIRA, aquela semana nunca
-- e paga sozinha, porque na segunda seguinte `v_semana` ja andou. Para isso
-- existe `p_semana`, e so para isso: `select public.premiar_semana('2026-08-03')`
-- paga a mao a semana perdida, e a chave primaria garante que rodar isso numa
-- semana ja paga nao paga nada de novo.
--
-- `p_semana` exige SEGUNDA. Uma data digitada no meio da semana fatiaria uma
-- janela de 7 dias atravessada, montando um podio que nunca existiu em tela
-- nenhuma. Recusar alto e melhor que pagar errado.
--
-- ponytail: teto conhecido e aceito por ora. Uma pessoa pode criar N grupos, por
-- uma segunda conta em cada um e levar premio em todos na mesma semana; a trava
-- de duas pessoas com ouro custa uma conta extra e nao segura isso. Correcao
-- quando doer: teto semanal de ouro premiado por conta, somando todos os grupos.
create or replace function public.premiar_semana(p_semana date default null)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_semana date := coalesce(p_semana, public.inicio_da_semana_sp() - 7);
  v_pagos jsonb;
begin
  if extract(isodow from v_semana) <> 1 then
    raise exception 'premiar_semana: % nao e uma segunda-feira', v_semana;
  end if;

  with ganhos as (
    -- `group_members` no comeco, e nao `occurrences`, porque quem saiu do grupo
    -- sai do ranking na mesma hora: ele nao aparece na tela e nao pode aparecer
    -- no pagamento. As ocorrencias dele continuam no banco.
    select m.group_id, m.user_id, p.nome, sum(o.ouro_creditado)::int as ouro_semana
      from group_members m
      join profiles p on p.id = m.user_id
      join habits h on h.group_id = m.group_id
      join occurrences o on o.habit_id = h.id and o.user_id = m.user_id
     where o.status = 'feito'
       and o.data_sp >= v_semana
       and o.data_sp < v_semana + 7
     group by m.group_id, m.user_id, p.nome
    -- So entra quem GANHOU ouro na semana. Zero na semana nao sobe ao podio nem
    -- em grupo de tres pessoas paradas.
    having sum(o.ouro_creditado) > 0
  ),
  ordenado as (
    select
      g.group_id,
      g.user_id,
      count(*) over (partition by g.group_id) as premiaveis,
      row_number() over (
        partition by g.group_id
        order by
          g.ouro_semana desc,
          (
            select coalesce(sum(s.atual), 0)::int
              from streaks s
              join habits h2 on h2.id = s.habit_id
             where h2.group_id = g.group_id and s.user_id = g.user_id
          ) desc,
          g.nome
      ) as posicao
    from ganhos g
  ),
  a_pagar as (
    select
      o.group_id,
      o.user_id,
      o.posicao,
      case o.posicao
        when 1 then gr.premio_1
        when 2 then gr.premio_2
        when 3 then gr.premio_3
      end as ouro
    from ordenado o
    join groups gr on gr.id = o.group_id
    -- `premiaveis >= 2` e a trava contra o grupo de uma pessoa so imprimir ouro.
    --
    -- `premios_em` e a trava contra o dono premiar depois de ver o placar: o
    -- premio precisa ter sido definido ANTES de a semana comecar. A conversao e
    -- para o INSTANTE de Sao Paulo, nunca UTC cru: a segunda comeca as 03:00
    -- UTC, e comparar com a meia-noite UTC poria a fronteira tres horas cedo, no
    -- domingo a noite de Sao Paulo, recusando premio cadastrado dentro do prazo.
    -- Grupo com `premios_em` nulo cai fora sozinho: comparar com nulo nao e
    -- verdadeiro, e por isso quem nunca cadastrou premio nunca paga.
    where o.posicao <= 3
      and o.premiaveis >= 2
      and gr.premios_em < (v_semana::timestamp at time zone 'America/Sao_Paulo')
  ),
  inseridos as (
    insert into premiacoes (group_id, semana, posicao, user_id, ouro)
    select group_id, v_semana, posicao, user_id, ouro
      from a_pagar
     -- Posicao sem premio cadastrado nao vira linha: `premiacoes` guarda quem
     -- RECEBEU, nao quem ficou em terceiro num grupo que so premia o primeiro.
     where ouro > 0
    on conflict (group_id, semana, posicao) do nothing
    returning group_id, posicao, user_id, ouro
  ),
  creditados as (
    -- O credito sai de `inseridos`, nunca de `a_pagar`: e a diferenca entre
    -- "quem deveria receber" e "quem acabou de ser registrado agora". Somado por
    -- pessoa antes do update porque a mesma pessoa pode subir ao podio em mais
    -- de um grupo na mesma rodada, e Postgres nao aceita atualizar a mesma linha
    -- duas vezes no mesmo comando.
    update profiles p
       set ouro = p.ouro + t.total
      from (
        select i.user_id, sum(i.ouro)::int as total from inseridos i group by i.user_id
      ) t
     where p.id = t.user_id
    returning p.id
  )
  select coalesce(
    jsonb_agg(jsonb_build_object(
      'user_id', i.user_id, 'group_id', i.group_id, 'posicao', i.posicao, 'ouro', i.ouro
    )),
    '[]'::jsonb
  )
    into v_pagos
    from inseridos i;

  -- O AVISO NUNCA DERRUBA O PAGAMENTO. Comando separado e dentro de bloco com
  -- excecao de proposito: junto no mesmo `with`, um erro ao gravar a linha da
  -- central de notificacoes desfaria o credito inteiro da rodada. Mesma decisao
  -- que o `push-dispatch` tomou: perder o registro e ruim, perder o valor e
  -- inaceitavel. O `raise warning` deixa rastro em `cron.job_run_details`.
  begin
    insert into notificacoes (user_id, titulo, corpo, url)
    select
      (e->>'user_id')::uuid,
      (e->>'posicao') || 'º lugar em ' || g.nome,
      'A semana fechou e você ganhou ' || (e->>'ouro') || ' de ouro.',
      '/grupos/' || (e->>'group_id')
      from jsonb_array_elements(v_pagos) e
      join groups g on g.id = (e->>'group_id')::uuid;
  exception when others then
    raise warning 'premiar_semana: aviso da semana % nao gravado (%)', v_semana, sqlerrm;
  end;

  return jsonb_array_length(v_pagos);
end $$;

-- Ninguem chama isto pela tela: quem paga premio e o cron, com o papel do banco.
revoke execute on function public.premiar_semana(date) from public, anon, authenticated;

-- ============================== 6. o ranking passa a ler a semana, e so isso
--
-- As duas funcoes sao as da 0021, com DUAS mudancas e nenhuma outra: a janela
-- vira `inicio_da_semana_sp()` e a chave de saida `ouro_mes` vira `ouro_semana`.
-- O gate `e_membro`, o desempate, o `ouro_total`, o `concluidos_hoje` e os
-- grants ficam como estavam. Elas continuam repetindo a mesma ordem de
-- proposito: criterio diferente entre a lista e o detalhe poria a mesma pessoa
-- em posicoes diferentes nas duas telas.
create or replace function public.ranking_grupo(p_grupo uuid)
returns json
language sql
security definer
stable
set search_path = public
as $$
  select coalesce(
    json_agg(
      json_build_object(
        'user_id', t.user_id,
        'ouro_semana', t.ouro_semana,
        'ouro_total', t.ouro_total,
        'streak_total', t.streak_total,
        'concluidos_hoje', t.concluidos_hoje
      )
      order by t.ouro_semana desc, t.streak_total desc, t.nome
    ),
    '[]'::json
  )
  from (
    select
      m.user_id,
      p.nome,
      coalesce(sum(o.ouro_creditado) filter (
        where o.data_sp >= public.inicio_da_semana_sp()
      ), 0)::int as ouro_semana,
      coalesce(sum(o.ouro_creditado), 0)::int as ouro_total,
      (
        select coalesce(sum(s.atual), 0)::int
          from streaks s
          join habits h on h.id = s.habit_id
         where h.group_id = p_grupo and s.user_id = m.user_id
      ) as streak_total,
      count(o.id) filter (
        where o.data_sp = (now() at time zone 'America/Sao_Paulo')::date
      )::int as concluidos_hoje
    from group_members m
    join profiles p on p.id = m.user_id
    left join habits h on h.group_id = p_grupo
    left join occurrences o
      on o.habit_id = h.id and o.user_id = m.user_id and o.status = 'feito'
    where m.group_id = p_grupo
    group by m.user_id, p.nome
  ) t
  -- Grupo inexistente e grupo de terceiro respondem a mesma lista vazia:
  -- mensagem diferente deixa descobrir quais grupos existem.
  where public.e_membro(p_grupo)
$$;

revoke execute on function public.ranking_grupo(uuid) from public, anon, authenticated;
grant execute on function public.ranking_grupo(uuid) to authenticated;

create or replace function public.posicoes_grupos()
returns json
language sql
security definer
stable
set search_path = public
as $$
  with meus as (
    select group_id from group_members where user_id = auth.uid()
  ),
  pontos as (
    select
      gm.group_id,
      gm.user_id,
      p.nome,
      coalesce((
        select sum(o.ouro_creditado)
          from occurrences o
          join habits h on h.id = o.habit_id
         where h.group_id = gm.group_id
           and o.user_id = gm.user_id
           and o.status = 'feito'
           and o.data_sp >= public.inicio_da_semana_sp()
      ), 0)::int as ouro_semana,
      coalesce((
        select sum(s.atual)
          from streaks s
          join habits h on h.id = s.habit_id
         where h.group_id = gm.group_id and s.user_id = gm.user_id
      ), 0)::int as streak_total
    from group_members gm
    join profiles p on p.id = gm.user_id
    where gm.group_id in (select group_id from meus)
  ),
  ordenado as (
    select
      group_id,
      user_id,
      row_number() over (
        partition by group_id
        order by ouro_semana desc, streak_total desc, nome
      ) as posicao
    from pontos
  )
  select coalesce(
    json_agg(json_build_object('grupo', group_id, 'posicao', posicao)),
    '[]'::json
  )
  from ordenado
  where user_id = auth.uid()
$$;

revoke execute on function public.posicoes_grupos() from public, anon, authenticated;
grant execute on function public.posicoes_grupos() to authenticated;

-- ==================================== 7. a janela do mes sai de cena
--
-- DEPOIS das duas funcoes acima, nunca antes: `inicio_do_mes_sp()` era chamada
-- so por elas, e o corpo de funcao SQL em string nao cria dependencia no
-- catalogo, entao o drop passaria calado deixando as duas quebradas em tempo de
-- execucao. Com a ordem certa, ninguem mais a chama quando ela cai.
drop function if exists public.inicio_do_mes_sp();

-- ============================================================ 8. o cron
--
-- SEGUNDA 03:05 UTC, que e 00:05 de Sao Paulo o ano todo (o Brasil nao tem mais
-- horario de verao). Cinco minutos depois da virada, e nao no minuto zero, para
-- nao competir com nada que role exatamente na meia-noite.
--
-- NASCE LIGADO, ao contrario da `limpar-fotos`: esta funcao credita ouro, nao
-- apaga dado de ninguem, e ate existir premio cadastrado em algum grupo ela nao
-- paga nada. Primeira execucao esperada: a segunda seguinte ao deploy.
--
-- `cron.schedule` com nome que ja existe substitui o job no lugar, entao repetir
-- a migration nao cria job duplicado.
select cron.schedule(
  'premiar-semana',
  '5 3 * * 1',
  $cron$select public.premiar_semana()$cron$
);
