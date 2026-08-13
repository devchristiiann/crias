-- 0028 Idempotencia e custo dos jobs.
--
-- Tres assuntos, todos vindos de auditoria sobre codigo ja em producao:
--
--   1. IDEMPOTENCIA. O CLAUDE.md diz "toda operacao e idempotente", e tres RPCs
--      nao eram: `registrar_recaida` cobrava 5 de vida por clique,
--      `comprar_escudo` cobrava 800 de ouro por POST e `curar` devolvia erro
--      para o proprio POST repetido. `for update` serializa, nao deduplica.
--
--   2. CUSTO DOS JOBS na escala alvo (centenas de usuarios, 7 grupos cada, 5
--      participantes por grupo). `toques_pendentes` descartava a maior parte do
--      teto de notificacao, e `gerar_ocorrencias` refazia 7 de cada 8 dias toda
--      noite.
--
--   3. FOTO DE CHECK-IN que cresce para sempre, sem nenhuma limpeza.
--
-- NENHUM INDICE E NENHUMA POLICY NASCE AQUI, de proposito: a 0027 e quem cuida
-- disso, e duas migrations criando o mesmo indice colidem.

-- ============================================================ 1. intencoes
--
-- Token de intencao para as RPCs que gastam ouro. O que faltava nao era lock, e
-- sim uma chave que diga "este e o MESMO pedido que ja atendi": o `for update`
-- de `comprar_escudo` faz o segundo POST esperar o primeiro e entao cobrar de
-- novo, certinho e duas vezes.
--
-- Guarda o resultado, nao so a marca. Repetir o pedido precisa devolver a MESMA
-- resposta do original, senao a tela mostra erro para uma compra que deu certo.
--
-- Sem policy: RLS ligada e zero policy ja e negar tudo, e o cliente nao tem
-- grant nenhum aqui. `updated_em` nao existe porque a linha nunca muda: e
-- registro do que aconteceu, igual a `vida_eventos` e `recaidas`.
create table if not exists public.intencoes (
  id uuid primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  acao text not null,
  resultado json not null,
  criado_em timestamptz not null default now()
);

alter table public.intencoes enable row level security;

revoke all on public.intencoes from public, anon, authenticated;

-- PRAZO DE VALIDADE, porque `id` e escolhido pelo cliente e a linha, sozinha,
-- nunca morre. Sem prazo a tabela cresce para sempre e, pior, um token de meses
-- atras continua devolvendo o `resultado` guardado com o saldo de ouro daquela
-- epoca. Nenhum ouro nasce disso (a resposta e so um espelho), mas a tela
-- mostraria uma carteira que nao existe mais.
--
-- 24 HORAS e a escolha, e ela tem dois lados que puxam para lados opostos:
--
--   curto demais cobra duas vezes. Passado o prazo, o token expirado e tratado
--   como token novo (e a regra: nao punir quem retentou tarde com um erro), e
--   isso quer dizer que a acao roda de novo e cobra de novo. Entao o prazo
--   precisa ser confortavelmente maior que qualquer retentativa real do mesmo
--   toque: duplo clique, retentativa de rede, aba que reenvia ao voltar do
--   background. Tudo isso acontece em segundos, e o cliente gera token novo a
--   cada carregamento de pagina, entao 24h ja e ordens de grandeza de folga.
--
--   longo demais devolve saldo velho. 24h limita a mentira a um dia, e so para
--   quem repetir literalmente o mesmo token.
--
-- QUEM MANDA E A LEITURA, nao o expurgo. As duas RPCs filtram por
-- `criado_em > now() - intencao_ttl()`, entao o token vence na hora certa mesmo
-- que o job nao tenha rodado. O expurgo so devolve espaco. Se a validade
-- morasse so no job, "expirado" viraria "expirado quando o cron lembrar".
--
-- Uma definicao so, lida por tres lugares que precisam concordar (as duas RPCs
-- e o expurgo). Sem `set search_path` de proposito, igual a `hoje_sp()`: nao e
-- `security definer`, nao toca em tabela nenhuma, e sem o SET o planner ainda
-- consegue embutir a constante.
create or replace function public.intencao_ttl() returns interval
language sql immutable as $$ select interval '24 hours' $$;

revoke execute on function public.intencao_ttl() from public, anon, authenticated;

-- Expurgo no mesmo molde dos outros jobs do banco (`marcar_atrasadas`,
-- `resolver_validacoes`): funcao nomeada, testavel por SQL, chamada pelo cron.
-- Nasce LIGADO, ao contrario da `limpar-fotos`: aqui nao ha dado de usuario
-- nenhum para perder, so token ja vencido pela leitura das proprias RPCs.
--
-- Sem indice em `criado_em`: indice e assunto da 0027, e a 0027 roda ANTES
-- desta migration, entao nao ha como ela indexar uma tabela que ainda nao
-- existe. O seq scan diario cabe: a tabela guarda no maximo um dia de token de
-- duas acoes raras (curar e comprar_escudo).
create or replace function public.expurgar_intencoes()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare v_total int;
begin
  delete from intencoes where criado_em < now() - public.intencao_ttl();
  get diagnostics v_total = row_count;
  return v_total;
end $$;

revoke execute on function public.expurgar_intencoes() from public, anon, authenticated;

select cron.schedule(
  'expurgar-intencoes',
  '20 4 * * *',
  $cron$select public.expurgar_intencoes()$cron$
);

-- ==================================================== 2. registrar_recaida
--
-- JANELA DE 2 MINUTOS, e a escolha da janela e a decisao inteira desta funcao.
--
-- Dedup por dia seria errado: recaida repetida no mesmo dia e comportamento
-- real de quem esta tentando parar, e engolir a segunda seria mentir para o
-- usuario sobre o proprio dia dele, e ainda por cima a favor dele (nao cobra a
-- vida que devia cobrar). Dedup por dia rouba o registro verdadeiro.
--
-- Dedup por segundos seria pouco: o POST duplicado nao vem so de duplo clique,
-- vem tambem de retentativa de rede e de aba que reenvia ao voltar do
-- background, e esses chegam dezenas de segundos depois.
--
-- 2 minutos e o intervalo em que a segunda chamada e quase certamente a mesma
-- intencao, e em que uma segunda recaida GENUINA do mesmo habito nao e
-- comportamento plausivel: ninguem recai duas vezes na mesma coisa em 120
-- segundos e considera isso duas historias diferentes. Passou disso, o registro
-- vale e cobra de novo, que e o ponto do habito de perda.
--
-- ATOMICIDADE sem indice novo (indice e da 0027): o `for update` no proprio
-- perfil primeiro, a leitura de `recaidas` depois. Em READ COMMITTED cada
-- comando pega um snapshot novo, entao a segunda chamada, ao acordar do lock,
-- enxerga a linha que a primeira acabou de gravar. E o mesmo raciocinio que
-- `resolver_validacao` (0026) ja documenta.
create or replace function public.registrar_recaida(p_habito uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  h habits;
  v_custo_vida constant int := 5;
  v_janela constant interval := interval '2 minutes';
  v_vida_perdida int := 0;
  v_ouro_perdido int := 0;
  v_vida int;
  v_ouro int;
  v_renasceu boolean := false;
  v_repetida recaidas;
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

  -- Lock antes da pergunta. Sem ele, duas chamadas simultaneas leem `recaidas`
  -- vazia ao mesmo tempo e as duas gravam.
  perform 1 from profiles where id = auth.uid() for update;

  select * into v_repetida
    from recaidas r
   where r.habit_id = p_habito
     and r.user_id = auth.uid()
     and r.criado_em > now() - v_janela
   order by r.criado_em desc
   limit 1;

  if found then
    -- Devolve o resultado do registro original, nao um erro: para quem tocou uma
    -- vez, o pedido foi atendido. `repetida` existe para a tela poder diferenciar
    -- se algum dia quiser, e nenhum cliente atual precisa ler isso.
    select vida, ouro into v_vida, v_ouro from profiles where id = auth.uid();
    return json_build_object(
      'ok', true,
      'repetida', true,
      'vida_perdida', v_repetida.vida_perdida,
      'ouro_perdido', v_repetida.ouro_perdido,
      'vida', v_vida,
      'ouro', v_ouro,
      'renasceu', false
    );
  end if;

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

  if v_vida = 0 then
    update profiles
       set vida = 50,
           doente = true,
           bau_base = (select count(distinct o.data_sp)::int from occurrences o
                        where o.user_id = auth.uid() and o.status = 'feito')
     where id = auth.uid();
    insert into vida_eventos (user_id, delta, vida_depois, motivo)
      values (auth.uid(), 50, 50, 'renascimento');
    v_vida := 50;
    v_renasceu := true;
  end if;

  return json_build_object(
    'ok', true,
    'repetida', false,
    'vida_perdida', v_vida_perdida,
    'ouro_perdido', v_ouro_perdido,
    'vida', v_vida,
    'ouro', v_ouro,
    'renasceu', v_renasceu
  );
end $$;

revoke execute on function public.registrar_recaida(uuid) from public, anon, authenticated;
grant execute on function public.registrar_recaida(uuid) to authenticated;

-- =========================================== 3. curar e comprar_escudo
--
-- Passam a aceitar `p_token`, o id que o CLIENTE gera uma vez por intencao e
-- repete em toda retentativa daquele mesmo toque. Com token, o segundo POST
-- devolve a resposta guardada e nao cobra nada. Sem token (`null`), o
-- comportamento e exatamente o de hoje: o front antigo continua funcionando
-- enquanto nao passa a mandar o campo.
--
-- O `drop` do zero-argumento e obrigatorio: manter os dois faria
-- `comprar_escudo()` virar chamada ambigua. Com a versao de um argumento com
-- default, `supabase.rpc('curar')` sem corpo continua resolvendo aqui.
--
-- So o resultado de SUCESSO e guardado. `ouro_insuficiente` e `nao_esta_doente`
-- sao estados que mudam sozinhos e precisam ser retentaveis: guardar erro
-- transformaria um "junte mais ouro" numa recusa permanente daquele token.
--
-- A leitura do token respeita `intencao_ttl()`. Token vencido nao e erro: ele
-- simplesmente nao e encontrado, e o pedido segue como se fosse novo. Por isso
-- o insert fecha em `on conflict (id) do update`: a linha vencida pode ainda
-- estar na mesa (o expurgo roda uma vez por dia) e a gravacao nova tem que
-- passar por cima dela em vez de estourar violacao de chave.
drop function if exists public.curar();

create or replace function public.curar(p_token uuid default null)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_preco constant int := 200;
  v_p profiles;
  v_cache json; v_dono uuid; v_acao text; v_res json;
begin
  select * into v_p from profiles where id = auth.uid() for update;
  if not found then
    return json_build_object('error', 'sem_perfil');
  end if;

  if p_token is not null then
    select i.user_id, i.acao, i.resultado into v_dono, v_acao, v_cache
      from intencoes i
     where i.id = p_token
       and i.criado_em > now() - public.intencao_ttl();
    if found then
      -- Token de outra pessoa ou de outra acao nao vira resposta: vira recusa.
      -- Uma resposta so, sem dizer qual dos dois motivos, igual ao resto.
      if v_dono <> auth.uid() or v_acao <> 'curar' then
        return json_build_object('error', 'token_invalido');
      end if;
      return v_cache;
    end if;
  end if;

  if not v_p.doente then
    return json_build_object('error', 'nao_esta_doente');
  end if;

  if v_p.ouro < v_preco then
    return json_build_object('error', 'ouro_insuficiente', 'falta', v_preco - v_p.ouro);
  end if;

  update profiles set ouro = ouro - v_preco, doente = false where id = auth.uid();

  v_res := json_build_object('ok', true, 'ouro', v_p.ouro - v_preco);

  if p_token is not null then
    insert into intencoes (id, user_id, acao, resultado)
      values (p_token, auth.uid(), 'curar', v_res)
    on conflict (id) do update
      set user_id = excluded.user_id,
          acao = excluded.acao,
          resultado = excluded.resultado,
          criado_em = excluded.criado_em;
  end if;

  return v_res;
end $$;

revoke execute on function public.curar(uuid) from public, anon, authenticated;
grant execute on function public.curar(uuid) to authenticated;

drop function if exists public.comprar_escudo();

create or replace function public.comprar_escudo(p_token uuid default null)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_preco constant int := 800;
  v_p profiles; v_ouro int; v_escudos int;
  v_cache json; v_dono uuid; v_acao text; v_res json;
begin
  select * into v_p from profiles where id = auth.uid() for update;
  if not found then
    return json_build_object('error', 'sem_perfil');
  end if;

  if p_token is not null then
    select i.user_id, i.acao, i.resultado into v_dono, v_acao, v_cache
      from intencoes i
     where i.id = p_token
       and i.criado_em > now() - public.intencao_ttl();
    if found then
      if v_dono <> auth.uid() or v_acao <> 'comprar_escudo' then
        return json_build_object('error', 'token_invalido');
      end if;
      return v_cache;
    end if;
  end if;

  if v_p.ouro < v_preco then
    return json_build_object('error', 'ouro_insuficiente', 'falta', v_preco - v_p.ouro);
  end if;

  update profiles
     set ouro = ouro - v_preco,
         escudos = escudos + 1
   where id = auth.uid()
   returning ouro, escudos into v_ouro, v_escudos;

  v_res := json_build_object('ok', true, 'escudos', v_escudos, 'ouro', v_ouro);

  if p_token is not null then
    insert into intencoes (id, user_id, acao, resultado)
      values (p_token, auth.uid(), 'comprar_escudo', v_res)
    on conflict (id) do update
      set user_id = excluded.user_id,
          acao = excluded.acao,
          resultado = excluded.resultado,
          criado_em = excluded.criado_em;
  end if;

  return v_res;
end $$;

revoke execute on function public.comprar_escudo(uuid) from public, anon, authenticated;
grant execute on function public.comprar_escudo(uuid) to authenticated;

-- ==================================================== 4. marcar_atrasadas
--
-- Duas trocas, nenhuma mudanca de regra. O corpo e o mesmo da 0022, linha por
-- linha, fora os dois pontos abaixo:
--
--   a) o `exists (select 1 from habits ...)` correlacionado, avaliado uma vez
--      por ocorrencia vencida, vira juncao unica com `habits`. Na escala alvo
--      isso e uma consulta em vez de milhares.
--
--   b) o `bau_base` deixa de ser subconsulta correlacionada por perfil e passa
--      a sair de uma agregacao unica, restrita a quem realmente zerou a vida
--      nesta rodada. Vale registrar a medida honesta: a funcao ja retorna cedo
--      quando nada venceu, e perfil com vida zero e raro, entao o ganho aqui e
--      pequeno hoje. O `count(distinct data_sp)` que custa caro de verdade e o
--      irmao dele dentro de `check_in`, que roda no primeiro check-in de cada
--      dia de cada usuario e cresce com o historico. Aquele quer indice em
--      `occurrences (user_id, status)`, e indice e da 0027: fica reportado, nao
--      criado aqui.
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
  create temp table if not exists tmp_protegido (user_id uuid) on commit drop;
  delete from tmp_protegido;

  -- A folga de 24h existe porque rotina comum vence as 23:59: sem ela, quem
  -- marca depois da meia-noite perderia vida por um dia que mal acabou.
  -- Modulo de horario nao tem esse problema, ele vence na hora exata da ultima
  -- faixa. Passou a faixa, e atrasado.
  with venceu as (
    update occurrences o
       set status = 'atrasado', proximo_toque_em = now()
      from habits h
     where h.id = o.habit_id
       and o.status = 'pendente'
       and o.vence_em + case
             when h.modulo in ('acordar', 'dormir') then interval '0'
             else interval '24 hours'
           end < now()
    returning o.user_id, o.habit_id
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

  -- Primeiro vacilo do dia consome um escudo. Quem ja gastou hoje nao gasta
  -- outro, e continua protegido: duas rodadas do cron no mesmo dia custam um
  -- escudo so. E so consome quando existe ofensiva viva que seria zerada.
  with consumo as (
    update profiles p
       set escudos = p.escudos - 1,
           escudo_usado_em = public.hoje_sp()
     where p.escudos > 0
       and p.escudo_usado_em is distinct from public.hoje_sp()
       and exists (
             select 1
               from tmp_venceu v
               join streaks st on st.habit_id = v.habit_id
                              and st.user_id = v.user_id
              where v.user_id = p.id
                and st.atual > 0
           )
    returning p.id, p.vida
  )
  insert into vida_eventos (user_id, delta, vida_depois, motivo)
  select id, 0, vida, 'escudo' from consumo;

  insert into tmp_protegido
  select distinct v.user_id
    from tmp_venceu v
    join profiles p on p.id = v.user_id
   where p.escudo_usado_em = public.hoje_sp();

  update streaks s set atual = 0
    from tmp_venceu v
   where s.habit_id = v.habit_id
     and s.user_id = v.user_id
     and not exists (select 1 from tmp_protegido t where t.user_id = v.user_id);

  insert into vida_eventos (user_id, delta, vida_depois, motivo)
  select id, 50, 50, 'renascimento' from profiles where vida = 0;

  -- Adoece e joga o progresso do bau fora, sem apagar historico: `bau_base`
  -- recebe a contagem atual de dias produtivos. A ofensiva nao e mais tocada.
  -- `zerados` e uma CTE, entao ela ve o estado ANTES deste update, que e
  -- exatamente o conjunto que o `where vida = 0` da 0022 pegava.
  with zerados as (
    select id from profiles where vida = 0
  ),
  produtivos as (
    select o.user_id, count(distinct o.data_sp)::int as dias
      from occurrences o
      join zerados z on z.id = o.user_id
     where o.status = 'feito'
     group by o.user_id
  )
  update profiles p
     set vida = 50,
         doente = true,
         bau_base = coalesce(pr.dias, 0)
    from zerados z
    left join produtivos pr on pr.user_id = z.id
   where p.id = z.id;

  return v_total;
end $$;

revoke execute on function public.marcar_atrasadas() from public, anon, authenticated;

-- ==================================================== 5. toques_pendentes
--
-- O `limit p_limite` estava dentro de `candidatas`, ANTES do CTE que decide
-- qual toque cabe. Boa parte das 200 candidatas sai de `decidido` com
-- `toque_escolhido` nulo (ocorrencia de agua com todos os alarmes gastos,
-- ocorrencia sem lembrete que ainda nao chegou na cutucada) e e descartada no
-- `where` final: o teto util por rodada era uma fracao de 200, e o que sobrava
-- fora do corte esperava a proxima rodada de 5 minutos.
--
-- Notificacao que nao sai e falha de produto, nao de performance. O limite
-- passa para depois de todos os filtros, que e onde ele significa "200
-- notificacoes por rodada" de verdade.
--
-- O `order by` entra junto porque limite sem ordem escolhe linha arbitraria: o
-- mais atrasado tem que ser o primeiro a sair, e nao o que o plano quis. O
-- desempate por `d.id` mantem os aparelhos da mesma ocorrencia vizinhos, para o
-- corte nao partir um usuario de tres aparelhos no meio.
--
-- O `where` de `candidatas` (`proximo_toque_em <= now()`) ja e o que limita o
-- conjunto: sem o limite antecipado, `decidido` calcula sobre o que esta
-- realmente vencido agora, que e o trabalho que precisa ser feito de qualquer
-- jeito.
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
  order by d.proximo_toque_em, d.id
  limit p_limite
$$;

revoke execute on function public.toques_pendentes(int) from public, anon, authenticated;

-- ============================================= 6. janela do gerador diario
--
-- `gerar_ocorrencias(7)` monta `habits x generate_series(8 dias)` com `left join
-- group_members`, ou seja, cada rotina de grupo multiplicada pelo numero de
-- membros, vezes 8 dias, toda noite. Na escala alvo isso e ordem de 100 mil
-- linhas por madrugada, das quais 7 de cada 8 morrem no `on conflict do
-- nothing` porque ja foram criadas na noite anterior.
--
-- NENHUMA OCORRENCIA DEIXA DE NASCER A TEMPO: o job roda TODA noite, e o filtro
-- de frequencia e avaliado por dia de calendario. Semanal, dias uteis,
-- quinzenal, mensal, `n_por_semana` (que so casa no domingo), `n_por_mes` (que
-- so casa no ultimo dia do mes) e avulsa: todas casam num dia especifico, e
-- todo dia especifico e visitado pela rodada da propria vespera.
--
-- O AGENDAMENTO DE PUSH tambem nao precisa de antecedencia:
-- `proximo_toque_em` nasce junto com a ocorrencia, e `toques_pendentes` so olha
-- `proximo_toque_em <= now()`. Uma ocorrencia criada as 03:10 do proprio dia ja
-- tem o lembrete daquele dia agendado. Ocorrencia de dia futuro nunca esta
-- vencida, entao existir com 7 dias de antecedencia nao adianta nada para o
-- push.
--
-- MAS EXISTIR A TEMPO NAO E A MESMA PERGUNTA QUE PODER SER MARCADA, e e aqui
-- que a reducao cobra um preco. `check_in` (0024:47) recusa apenas quando
-- `coalesce(inicio_janela, data_sp) > hoje_sp()`, e o gerador escreve
-- `inicio_janela` DIFERENTE de `data_sp` em exatamente dois tipos:
--
--   `n_por_semana` casa so no domingo, com `inicio_janela = data_sp - 6`.
--   `n_por_mes`    casa so no ultimo dia do mes, com
--                  `inicio_janela = date_trunc('month', data_sp)`.
--   todos os outros nascem com `inicio_janela = data_sp`.
--
-- Nesses dois tipos a marcacao vale em QUALQUER dia da janela, nao so no
-- `data_sp`. E a ocorrencia so existe a partir do dia em que o gerador a
-- alcanca, entao o alcance do job vira um TETO sobre a janela marcavel:
--
--   tipo             janela do check_in       com dias=7        com dias=2
--   n_por_semana     seg a dom (7 dias)       7 (a janela toda) sex a dom (3)
--   n_por_mes        dia 1 ao ultimo (28-31)  os ultimos 8      os ultimos 3
--   todos os outros  o proprio dia (1)        1                 1
--
-- Ou seja: os 7 dias nunca cobriram `n_por_mes` inteiro, e o corte para 2
-- encolhe os dois para 3 dias.
--
-- QUANDO ISSO VIRA BUG DE VERDADE: no dia em que alguem puder marcar um dia que
-- nao seja hoje ou ontem. Hoje ninguem pode, e a trava e a tela, nao o gerador:
-- `useOcorrenciasHoje` consulta `data_sp in [ontem, hoje]`, e o `data_sp`
-- desses dois tipos e o domingo ou o ultimo dia do mes, entao a ocorrencia so
-- aparece nesses dois dias. O teto de 3 esta acima do que a tela alcanca, e em
-- 13/08/2026 a producao tem 0 rotinas dos dois tipos. Se um dia a tela passar a
-- mostrar a janela inteira, que e o que "3 vezes por semana" promete ao
-- usuario, o teto passa a ser visivel e vira bug de produto.
--
-- CAMINHO DE VOLTA, um comando:
--
--   select cron.alter_job(
--     (select jobid from cron.job where jobname = 'gerar-ocorrencias'),
--     command := $$select public.gerar_ocorrencias(31)$$
--   );
--
-- 31 cobre a janela inteira dos dois tipos e paga o custo de volta em todos.
-- DECIDI NAO FAZER ALCANCE POR TIPO dentro do gerador: a lista de frequencias
-- ja vive em dois `case` que precisam concordar (o do filtro e o do
-- `inicio_janela`), e um terceiro `case` so para o alcance da serie e a forma
-- de bug que este projeto ja pagou caro. Nao vale por 0 rotinas.
--
-- ENTAO POR QUE 2 E NAO 0: os 2 dias nao sao antecedencia, sao redundancia
-- contra uma noite em que o cron nao rodou. `dias = 2` (hoje, +1 e +2) mantem
-- duas noites de folga e corta o trabalho para 3/8. Os 7 dias continuam
-- disponiveis para backfill manual: `select public.gerar_ocorrencias(7)`.
--
-- Nao mexo no default da funcao: `criar_habito` chama `gerar_ocorrencias(7)` e
-- rotina nova continua nascendo com a semana inteira.
select cron.schedule(
  'gerar-ocorrencias',
  '10 3 * * *',
  $cron$select public.gerar_ocorrencias(2)$cron$
);

-- ================================================ 7. resolver_validacoes
--
-- DECIDI NAO REESCREVER EM OPERACAO DE CONJUNTO, e a justificativa e a regra do
-- projeto, nao preguica:
--
--   `resolver_validacao` e o unico lugar que paga o modulo `tela`. Ela decide
--   quorum, calcula ofensiva com o mesmo criterio do `check_in`, grava
--   `streak_anterior`, paga ouro e xp, e ainda avalia e abre bau chamando
--   `abrir_bau`, que sorteia premio e escreve em `baus`. Uma versao de conjunto
--   teria que reimplementar ofensiva, contabilidade e sorteio numa SEGUNDA
--   copia dessas regras. Este projeto ja pagou exatamente essa conta:
--   `check_in_por_token` era a copia esquecida do `check_in` e pagou ouro sem
--   gravar `ouro_creditado`, virando ouro infinito. Duas contabilidades para o
--   mesmo pagamento e o furo, nao a otimizacao.
--
--   E o custo medido nao pede o risco: o teto e 500 chamadas por hora, ou 8 por
--   minuto, cada uma com um punhado de consultas por chave primaria. Em
--   13/08/2026 a producao tinha 0 ocorrencias em `em_validacao` e 0 rotinas do
--   modulo `tela`. Otimizar isso agora e trocar seguranca de regra por um ganho
--   que nao existe.
--
-- O que o laco realmente pede e indice para o `where status = 'em_validacao'
-- and validacao_ate <= now()`, e indice e assunto da 0027.
--
-- Nada e alterado nesta secao de proposito.

-- ======================================== 8. limpeza de foto de check-in
--
-- O bucket `checkins` (0009) nunca teve limpeza: nenhum `remove` no codigo,
-- `desfazer_check_in` zera `foto_path` sem apagar o arquivo, e toda tentativa
-- recusada por `foto_invalida` deixa objeto orfao. O caminho leva um nome novo
-- a cada envio de proposito (anti-replay), entao reenvio tambem acumula.
--
-- DELETE DIRETO EM `storage.objects` NAO SERVE, e este e o ponto tecnico que
-- decide o desenho: o Supabase instala o gatilho `protect_objects_delete`, que
-- levanta `Direct deletion from storage tables is not allowed. Use the Storage
-- API instead.` E ele tem razao: apagar a linha deixaria os bytes no S3 para
-- sempre, cobrados e sem ponteiro. A remocao de verdade so acontece pela API de
-- Storage, e quem fala com a API de Storage neste projeto e edge function: a
-- `limpar-fotos`, no mesmo molde do `push-dispatch`.
--
-- POR QUE A `service_role` NAO MORA NO BANCO, ja que o atalho e tentador: a
-- primeira versao desta secao lia a chave em `privado.config` e chamava a API
-- por `pg_net`. Isso troca o alcance de um segredo pelo alcance do projeto
-- inteiro. `internal_secret` vazado deixa o ladrao disparar uma function que ja
-- roda sozinha de cinco em cinco minutos; `service_role` vazada e Storage, Auth
-- e toda tabela com a RLS por baixo. E o banco tem porta demais para ela:
-- qualquer `security definer` com `search_path` frouxo, um dump de suporte, um
-- backup restaurado noutro lugar, e a chave sai junto. Ela mora onde o projeto
-- ja a guarda, em `Deno.env` da function. O banco manda so o `internal_secret`,
-- que e o nivel de confianca certo para um gatilho de cron.
--
-- ISSO APAGA FOTO DE CLIENTE, entao a seguranca esta em quatro travas:
--
--   1. UMA definicao de "apagavel", nao duas. `fotos_orfas()` e a lista, e a
--      limpeza consome exatamente `fotos_orfas()`. O que voce ve na consulta e
--      literalmente o que sai. Duas consultas parecidas divergiriam um dia, e o
--      dia em que divergissem seria o dia em que uma foto viva sumiria. A
--      function nao reimplementa criterio nenhum: ela nao sabe o que e orfao,
--      so apaga o que a lista devolveu. O TETO POR RODADA E PARTE DA LISTA,
--      pelo mesmo motivo: com o `limit` no TypeScript, a lista devolvia um
--      conjunto e a limpeza apagava outro, menor, depois de o conjunto inteiro
--      atravessar o PostgREST. Agora o corte e do banco e `fotos_orfas(n)`
--      continua sendo exatamente o que some. O default 200 e o mesmo teto que a
--      edge function usa; ela passa o numero explicitamente mesmo assim, para o
--      teto nao ficar escrito em dois lugares que podem divergir em silencio.
--   2. Idade minima de 30 dias, fixa, sem parametro. Sem knob nao existe a
--      chamada com `0` feita as pressas. Reenvio, desfazer e recusa acontecem em
--      minutos, nao em um mes.
--   3. `not exists` contra `occurrences.foto_path` inteiro, sem recorte de data
--      nem de usuario. Objeto referenciado por qualquer ocorrencia fica.
--   4. O job NASCE DESLIGADO. Job de exclusao que nasce ligado e como se perde
--      foto de usuario.
--
-- Nao ha grant para ninguem: quem le a lista e a function com `service_role`, e
-- o `revoke` de `public, anon, authenticated` nao alcanca esse papel, igual ao
-- que `toques_pendentes` ja faz para o `push-dispatch`. A lista tambem vale
-- sozinha, com o job desligado: e a resposta honesta para "o que sumiria se eu
-- ligasse isto".
-- O `drop` da versao sem argumento e obrigatorio pelo mesmo motivo do `curar()`:
-- com as duas vivas, `fotos_orfas()` viraria chamada ambigua. E no-op se a
-- funcao nunca existiu.
drop function if exists public.fotos_orfas();

create or replace function public.fotos_orfas(p_limite int default 200)
returns table (caminho text, bytes bigint, criado_em timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select o.name,
         coalesce((o.metadata->>'size')::bigint, 0),
         o.created_at
    from storage.objects o
   where o.bucket_id = 'checkins'
     and o.created_at < now() - interval '30 days'
     and not exists (
           select 1 from public.occurrences oc where oc.foto_path = o.name
         )
   -- Mais velha primeiro, e por isso o `limit` nao esconde nada: o que ficar de
   -- fora e o mais novo, e sai na rodada seguinte.
   order by o.created_at
   limit p_limite
$$;

revoke execute on function public.fotos_orfas(int) from public, anon, authenticated;

-- O CRON NAO APAGA NADA: ele so acorda a `limpar-fotos`, exatamente como o job
-- do `push-dispatch` (0012) acorda a dele. O segredo sai de `privado.config` em
-- tempo de execucao, nunca do arquivo versionado, e o ref do Crias esta escrito
-- por extenso porque o ref literal e a garantia de que isto nunca aponta para o
-- outro projeto da mesma conta.
--
-- NASCE DESLIGADO, e por `schedule_in_database` com `active := false` em vez de
-- `cron.schedule` seguido de desligar: assim nao existe nem a janela de um
-- comando em que o job esteja ligado. (`update cron.job` tambem nao e uma
-- opcao: a tabela nao aceita escrita do `postgres`.)
--
-- Ligar e um comando consciente, depois de olhar `select * from
-- public.fotos_orfas(1000000)` e de deployar a function. O numero grande e de
-- proposito: `fotos_orfas()` sem argumento mostra so o lote de 200 da proxima
-- rodada, e a pergunta antes de ligar e "quanto sumiria ao todo".
--
--   select cron.alter_job(
--     (select jobid from cron.job where jobname = 'limpar-fotos'),
--     active := true
--   );
select cron.schedule_in_database(
  job_name := 'limpar-fotos',
  schedule := '30 4 * * *',
  command  := $cron$
    select net.http_post(
      url := 'https://oeaftenwsmbkdxqseqrb.supabase.co/functions/v1/limpar-fotos',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-internal-secret', privado.segredo('internal_secret')
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 25000
    )
  $cron$,
  database := current_database(),
  username := null,
  active   := false
);
