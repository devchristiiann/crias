-- 0034 Pocoes, vida menos radical, enquete de tela como post do feed e brinde.
--
-- Quatro assuntos numa migration so porque eles se encostam: a vida deixa de
-- cair rapido demais, e a pocao vermelha e o que devolve vida; a pocao azul
-- dobra ouro e por isso mexe na contabilidade da ocorrencia; a enquete de tempo
-- de tela vira post comum do feed e por isso ganha instante de publicacao; e o
-- brinde aos usuarios atuais entrega justamente ouro e uma pocao de vida.

-- ---------------------------------------------------------------- parte 1
-- Vida: perda menor e com teto por dia.
--
-- O relato que originou isto: uma conta acordou com 10 de 50. O banco mostrou
-- por que. `marcar_atrasadas` cobrava 10 por ocorrencia vencida, e as
-- ocorrencias de um dia inteiro vencem todas no mesmo instante: uma unica
-- rodada do cron tirou 30 de uma conta e 50 de outra, que morreu, renasceu e
-- perdeu todas as ofensivas de uma vez. Nao havia bug, havia soma. A regra
-- agora e 5 por ocorrencia com teto de 10 por dia, entao um dia ruim custa no
-- maximo um quinto da vida e morrer exige cinco dias seguidos de abandono.

alter table vida_eventos drop constraint if exists vida_eventos_motivo_check;
alter table vida_eventos add constraint vida_eventos_motivo_check
  check (motivo in ('atraso', 'recaida', 'renascimento', 'escudo', 'descanso', 'pocao'));

-- O teto diario le a soma do dia por usuario. Sem indice essa leitura vira
-- varredura da tabela inteira a cada hora, para cada pessoa atrasada.
create index if not exists idx_vida_eventos_user_data
  on vida_eventos (user_id, criado_em desc);

create or replace function public.marcar_atrasadas()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total int;
  v_custo constant int := 5;
  v_teto_dia constant int := 10;
begin
  create temp table if not exists tmp_venceu (user_id uuid, habit_id uuid) on commit drop;
  delete from tmp_venceu;
  create temp table if not exists tmp_protegido (user_id uuid) on commit drop;
  delete from tmp_protegido;
  create temp table if not exists tmp_perda (user_id uuid, perda int) on commit drop;
  delete from tmp_perda;

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

  -- Teto por dia de Sao Paulo, somando o que ja foi cobrado hoje. O `left join
  -- lateral` le apenas eventos ANTERIORES a esta rodada, porque os desta ainda
  -- nao foram gravados, e e isso que faz duas rodadas no mesmo dia respeitarem
  -- o mesmo teto em vez de cada uma ter o seu.
  insert into tmp_perda
  select v.user_id,
         least(v_custo * v.perdidas,
               greatest(0, v_teto_dia - coalesce(j.perdido_hoje, 0)))
    from (select user_id, count(*)::int as perdidas from tmp_venceu group by 1) v
    left join lateral (
      select -sum(e.delta)::int as perdido_hoje
        from vida_eventos e
       where e.user_id = v.user_id
         and e.motivo = 'atraso'
         and (e.criado_em at time zone 'America/Sao_Paulo')::date = public.hoje_sp()
    ) j on true;

  update profiles p
     set vida = greatest(0, p.vida - t.perda)
    from tmp_perda t
   where p.id = t.user_id and t.perda > 0;

  insert into vida_eventos (user_id, delta, vida_depois, motivo)
  select p.id, -t.perda, p.vida, 'atraso'
    from profiles p
    join tmp_perda t on t.user_id = p.id
   where t.perda > 0;

  -- Primeiro vacilo do dia consome um escudo. Quem ja gastou hoje nao gasta
  -- outro, e continua protegido: duas rodadas do cron no mesmo dia custam um
  -- escudo so. E so consome quando existe ofensiva viva que seria zerada.
  --
  -- Fica fora do filtro de perda de proposito: bater no teto de vida do dia nao
  -- salva a ofensiva, quem salva a ofensiva e o escudo.
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
end
$$;

-- ---------------------------------------------------------------- parte 2
-- Pocoes: duas colunas de contador e o dia do ouro dobrado.
--
-- Contador em `profiles`, e nao tabela de inventario, porque `escudos` ja e
-- exatamente isso desde a 0022 e o padrao existente cobre o caso. Sem grant de
-- update para `authenticated`, igual as demais colunas de jogo: so RPC escreve.

alter table profiles add column if not exists pocoes_vida smallint not null default 0;
alter table profiles add column if not exists pocoes_ouro smallint not null default 0;
alter table profiles add column if not exists ouro_dobrado_em date;

alter table profiles drop constraint if exists profiles_pocoes_vida_check;
alter table profiles add constraint profiles_pocoes_vida_check check (pocoes_vida >= 0);
alter table profiles drop constraint if exists profiles_pocoes_ouro_check;
alter table profiles add constraint profiles_pocoes_ouro_check check (pocoes_ouro >= 0);

grant select (pocoes_vida, pocoes_ouro, ouro_dobrado_em) on profiles to authenticated;

-- O bonus da pocao azul mora fora de `occurrences.ouro_creditado` de proposito.
-- `ouro_creditado` e a base do ranking do grupo, e dobrar ali seria comprar
-- posicao no ranking com ouro. A chave primaria por ocorrencia tambem e o que
-- impede marcar, desfazer e remarcar para receber o bonus duas vezes.
create table if not exists bonus_ouro (
  occurrence_id uuid primary key references occurrences(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  valor int not null check (valor > 0),
  criado_em timestamptz not null default now()
);

alter table bonus_ouro enable row level security;
revoke all on bonus_ouro from public, anon, authenticated;

create or replace function public.comprar_pocao(p_tipo text, p_token uuid default null)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_p profiles;
  v_preco int;
  v_cache json; v_dono uuid; v_acao text; v_res json;
  v_ouro int; v_pocoes_vida int; v_pocoes_ouro int; v_escudos int;
begin
  -- Preco no servidor, nunca no payload. Tipo desconhecido e recusado, nunca
  -- interpretado: lista branca, mesma regra do `p_acao` da 0025.
  v_preco := case p_tipo
    when 'vida' then 120
    when 'ouro' then 250
    when 'escudo' then 800
    else null
  end;
  if v_preco is null then
    return json_build_object('error', 'pocao_invalida');
  end if;

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
      if v_dono <> auth.uid() or v_acao <> 'comprar_pocao_' || p_tipo then
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
         pocoes_vida = pocoes_vida + case when p_tipo = 'vida' then 1 else 0 end,
         pocoes_ouro = pocoes_ouro + case when p_tipo = 'ouro' then 1 else 0 end,
         escudos = escudos + case when p_tipo = 'escudo' then 1 else 0 end
   where id = auth.uid()
   returning ouro, pocoes_vida, pocoes_ouro, escudos
        into v_ouro, v_pocoes_vida, v_pocoes_ouro, v_escudos;

  v_res := json_build_object(
    'ok', true,
    'tipo', p_tipo,
    'ouro', v_ouro,
    'pocoes_vida', v_pocoes_vida,
    'pocoes_ouro', v_pocoes_ouro,
    'escudos', v_escudos
  );

  if p_token is not null then
    insert into intencoes (id, user_id, acao, resultado)
      values (p_token, auth.uid(), 'comprar_pocao_' || p_tipo, v_res)
    on conflict (id) do update
      set user_id = excluded.user_id,
          acao = excluded.acao,
          resultado = excluded.resultado,
          criado_em = excluded.criado_em;
  end if;

  return v_res;
end
$$;

revoke execute on function public.comprar_pocao(text, uuid) from public, anon, authenticated;
grant execute on function public.comprar_pocao(text, uuid) to authenticated;

-- `comprar_escudo` continua existindo e vira casca. Duas portas para a mesma
-- compra seriam duas contabilidades para manter iguais, e a tela antiga da
-- Trilha ainda chama esta.
create or replace function public.comprar_escudo(p_token uuid default null)
returns json
language sql
security definer
set search_path = public
as $$
  select public.comprar_pocao('escudo', p_token);
$$;

revoke execute on function public.comprar_escudo(uuid) from public, anon, authenticated;
grant execute on function public.comprar_escudo(uuid) to authenticated;

create or replace function public.usar_pocao(p_tipo text, p_token uuid default null)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_p profiles;
  v_cache json; v_dono uuid; v_acao text; v_res json;
  v_vida int; v_restantes int;
  v_cura constant int := 25;
begin
  if p_tipo not in ('vida', 'ouro') then
    return json_build_object('error', 'pocao_invalida');
  end if;

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
      if v_dono <> auth.uid() or v_acao <> 'usar_pocao_' || p_tipo then
        return json_build_object('error', 'token_invalido');
      end if;
      return v_cache;
    end if;
  end if;

  if p_tipo = 'vida' then
    if v_p.pocoes_vida < 1 then
      return json_build_object('error', 'sem_pocao');
    end if;
    -- Recusar com a vida cheia protege a pocao, nao o banco: gastar um item
    -- para ganhar zero e o tipo de perda que ninguem entende depois.
    if v_p.vida >= 50 then
      return json_build_object('error', 'vida_cheia');
    end if;

    update profiles
       set vida = least(50, vida + v_cura),
           pocoes_vida = pocoes_vida - 1
     where id = auth.uid()
     returning vida, pocoes_vida into v_vida, v_restantes;

    insert into vida_eventos (user_id, delta, vida_depois, motivo)
    values (auth.uid(), v_vida - v_p.vida, v_vida, 'pocao');

    v_res := json_build_object('ok', true, 'tipo', 'vida', 'vida', v_vida, 'restantes', v_restantes);
  else
    if v_p.pocoes_ouro < 1 then
      return json_build_object('error', 'sem_pocao');
    end if;
    if v_p.ouro_dobrado_em = public.hoje_sp() then
      return json_build_object('error', 'ja_ativo');
    end if;

    update profiles
       set ouro_dobrado_em = public.hoje_sp(),
           pocoes_ouro = pocoes_ouro - 1
     where id = auth.uid()
     returning pocoes_ouro into v_restantes;

    v_res := json_build_object(
      'ok', true, 'tipo', 'ouro',
      'ate', public.hoje_sp(), 'restantes', v_restantes
    );
  end if;

  if p_token is not null then
    insert into intencoes (id, user_id, acao, resultado)
      values (p_token, auth.uid(), 'usar_pocao_' || p_tipo, v_res)
    on conflict (id) do update
      set user_id = excluded.user_id,
          acao = excluded.acao,
          resultado = excluded.resultado,
          criado_em = excluded.criado_em;
  end if;

  return v_res;
end
$$;

revoke execute on function public.usar_pocao(text, uuid) from public, anon, authenticated;
grant execute on function public.usar_pocao(text, uuid) to authenticated;

-- ---------------------------------------------------------------- parte 3
-- Gatilhos sobre `occurrences`.
--
-- ponytail: estes dois gatilhos existem para nao reescrever `check_in`,
-- `check_in_por_token`, `resolver_validacao` e `desfazer_check_in`. Juntas elas
-- passam de 700 linhas de contabilidade de ouro, ofensiva e bau, e copiar tudo
-- para mudar quatro linhas e risco de regressao maior que o ganho. Se um dia
-- essas funcoes forem reescritas por outro motivo, a hora de absorver os
-- gatilhos e essa.

create or replace function public.occ_antes_de_gravar()
returns trigger
language plpgsql
as $$
begin
  -- A declaracao de tempo de tela publica o post na hora, e nao quando a
  -- enquete fecha. O feed ordena por `feito_em`, entao sem isto a enquete nao
  -- tem lugar na linha do tempo. O prazo tambem cai de 48 para 24 horas: a
  -- `check_in` da 0026 ainda escreve 48, e este gatilho e a fonte de verdade.
  if new.status = 'em_validacao' and old.status is distinct from 'em_validacao' then
    new.feito_em := coalesce(new.feito_em, now());
    new.validacao_ate := now() + interval '24 hours';
  end if;

  -- Aprovar nao republica o post. `resolver_validacao` escreve `feito_em =
  -- now()`, e sem isto o post pularia para o topo do feed um dia depois.
  if new.status = 'feito' and old.status = 'em_validacao' and old.feito_em is not null then
    new.feito_em := old.feito_em;
  end if;

  return new;
end
$$;

drop trigger if exists occ_antes_de_gravar on occurrences;
create trigger occ_antes_de_gravar
  before update on occurrences
  for each row execute function public.occ_antes_de_gravar();

create or replace function public.occ_depois_de_gravar()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_delta int;
  v_dobra date;
  v_vida int;
  v_antes int;
begin
  -- Pocao azul: bonus igual ao ouro que a ocorrencia acabou de pagar. Fica em
  -- `bonus_ouro`, fora de `ouro_creditado`, para nao entrar no ranking. Nao e
  -- estornado no desfazer, e isso nao abre brecha: a chave por ocorrencia paga
  -- uma vez so, entao marcar, desfazer e remarcar rende o mesmo que marcar.
  if new.ouro_creditado > old.ouro_creditado then
    select ouro_dobrado_em into v_dobra from profiles where id = new.user_id;
    if v_dobra = new.data_sp then
      v_delta := new.ouro_creditado - old.ouro_creditado;
      insert into bonus_ouro (occurrence_id, user_id, valor)
      values (new.id, new.user_id, v_delta)
      on conflict (occurrence_id) do nothing;
      if found then
        update profiles set ouro = ouro + v_delta, xp = xp + v_delta
         where id = new.user_id;
      end if;
    end if;
  end if;

  -- Descanso: a primeira rotina fechada do dia devolve 5 de vida. Sem isto a
  -- vida so andava para baixo, e a unica saida era morrer para renascer.
  if new.status = 'feito' and old.status is distinct from 'feito' then
    if not exists (
      select 1 from occurrences o
       where o.user_id = new.user_id and o.data_sp = new.data_sp
         and o.status = 'feito' and o.id <> new.id
    ) then
      select vida into v_antes from profiles where id = new.user_id for update;
      if v_antes < 50 then
        update profiles set vida = least(50, vida + 5)
         where id = new.user_id
         returning vida into v_vida;
        insert into vida_eventos (user_id, delta, vida_depois, motivo)
        values (new.user_id, v_vida - v_antes, v_vida, 'descanso');
      end if;
    end if;
  end if;

  return null;
end
$$;

drop trigger if exists occ_depois_de_gravar on occurrences;
create trigger occ_depois_de_gravar
  after update on occurrences
  for each row execute function public.occ_depois_de_gravar();

-- Enquetes que ja existem passam a ter lugar na linha do tempo. O instante da
-- declaracao e recuperavel: `validacao_ate` foi escrito como declaracao mais 48
-- horas. O prazo novo e o mesmo 24 horas dos que vierem depois.
update occurrences
   set feito_em = validacao_ate - interval '48 hours',
       validacao_ate = greatest(now() + interval '1 hour', validacao_ate - interval '24 hours')
 where status = 'em_validacao' and feito_em is null;

-- ---------------------------------------------------------------- parte 4
-- Brinde e aviso avulso por push.

create table if not exists brindes (
  user_id uuid not null references profiles(id) on delete cascade,
  chave text not null,
  titulo text not null,
  corpo text not null,
  ouro int not null default 0 check (ouro >= 0),
  pocoes_vida smallint not null default 0 check (pocoes_vida >= 0),
  visto_em timestamptz,
  criado_em timestamptz not null default now(),
  primary key (user_id, chave)
);

alter table brindes enable row level security;
revoke all on brindes from public, anon, authenticated;
grant select on brindes to authenticated;

drop policy if exists brindes_leitura on brindes;
create policy brindes_leitura on brindes
  for select to authenticated
  using (user_id = (select auth.uid()));

create or replace function public.marcar_brinde_visto(p_chave text)
returns json
language plpgsql
security definer
set search_path = public
as $$
begin
  update brindes set visto_em = coalesce(visto_em, now())
   where user_id = auth.uid() and chave = p_chave;
  if not found then
    return json_build_object('error', 'brinde_inexistente');
  end if;
  return json_build_object('ok', true);
end
$$;

revoke execute on function public.marcar_brinde_visto(text) from public, anon, authenticated;
grant execute on function public.marcar_brinde_visto(text) to authenticated;

-- Push que nao nasce de ocorrencia. `toques_pendentes` responde por lembrete de
-- rotina e nao serve para aviso do produto; sem esta fila, avisar todo mundo
-- exigiria uma edge function nova por aviso.
create table if not exists avisos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  titulo text not null,
  corpo text not null,
  url text check (url is null or url ~ '^/[^/]'),
  criado_em timestamptz not null default now(),
  enviado_em timestamptz
);

create index if not exists idx_avisos_pendentes on avisos (criado_em) where enviado_em is null;

alter table avisos enable row level security;
revoke all on avisos from public, anon, authenticated;

create or replace function public.avisos_pendentes(p_limite int default 200)
returns table (
  aviso_id uuid,
  user_id uuid,
  titulo text,
  corpo text,
  url text,
  endpoint text,
  p256dh text,
  auth text
)
language sql
security definer
set search_path = public
as $$
  select a.id, a.user_id, a.titulo, a.corpo, a.url, s.endpoint, s.p256dh, s.auth
    from avisos a
    join push_subs s on s.user_id = a.user_id
   where a.enviado_em is null
   order by a.criado_em
   limit p_limite;
$$;

revoke execute on function public.avisos_pendentes(int) from public, anon, authenticated;
grant execute on function public.avisos_pendentes(int) to service_role;

create or replace function public.marcar_aviso_enviado(p_aviso uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update avisos set enviado_em = now() where id = p_aviso and enviado_em is null;
$$;

revoke execute on function public.marcar_aviso_enviado(uuid) from public, anon, authenticated;
grant execute on function public.marcar_aviso_enviado(uuid) to service_role;

-- O brinde de verdade. Credito e aviso saem das linhas EFETIVAMENTE inseridas,
-- nunca de quem "deveria" receber: rodar esta migration duas vezes nao paga
-- duas vezes, e a mesma trava do `premiar_semana` da 0031.
with novos as (
  insert into brindes (user_id, chave, titulo, corpo, ouro, pocoes_vida)
  select p.id,
         'crias_2_1',
         'Presente do Crias',
         'Chegaram as poções, e a vida ficou menos dura. Você ganhou 500 de ouro e uma poção de vida para começar.',
         500,
         1
    from profiles p
  on conflict (user_id, chave) do nothing
  returning user_id, ouro, pocoes_vida
),
creditados as (
  update profiles p
     set ouro = p.ouro + n.ouro,
         pocoes_vida = p.pocoes_vida + n.pocoes_vida
    from novos n
   where p.id = n.user_id
  returning p.id
)
insert into avisos (user_id, titulo, corpo, url)
select id,
       'Presente do Crias',
       'Você ganhou 500 de ouro e uma poção de vida. Abra o app para ver.',
       '/loja'
  from creditados;
