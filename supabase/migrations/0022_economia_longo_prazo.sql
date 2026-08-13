-- 0022 Economia de longo prazo.
--
-- Cinco assuntos, todos vindos do design 2026-08-13-modulos-de-rotina-design.md:
--   1. Multiplicador em faixas: sem bonus antes de 30 dias, dobro so em 1 ano.
--   2. Estorno do bonus que o arredondamento pagou no primeiro dia.
--   3. Vida zero para de zerar ofensiva: adoece e joga fora o progresso do bau.
--   4. Escudo de ofensiva, comprado e consumido no servidor.
--   5. Cura do personagem doente.

-- ---------------------------------------------------------------- 1. colunas

alter table public.profiles
  add column if not exists doente boolean not null default false,
  add column if not exists escudos smallint not null default 0,
  add column if not exists bau_base int not null default 0,
  add column if not exists escudo_usado_em date;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_escudos_check') then
    alter table public.profiles
      add constraint profiles_escudos_check check (escudos >= 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'profiles_bau_base_check') then
    alter table public.profiles
      add constraint profiles_bau_base_check check (bau_base >= 0);
  end if;
end $$;

-- `profiles` tem grant de SELECT na tabela inteira, entao as colunas novas ja
-- nascem visiveis para o grupo, que e o que o design 1.5 pede. O que nao pode
-- existir e UPDATE: escudo, doenca e progresso de bau sao valores de jogo, e
-- valor de jogo so a RPC escreve. O grant atual de update e so em `nome`
-- (0015:139), mas o revoke fica explicito aqui porque a proxima pessoa que der
-- um `grant update` na tabela inteira nao vai lembrar desta regra.
revoke update (doente, escudos, bau_base, escudo_usado_em)
  on public.profiles from public, anon, authenticated;

-- O consumo do escudo precisa aparecer na trilha: a regra do projeto e que
-- nada muda no personagem sem o usuario saber por que.
alter table public.vida_eventos drop constraint if exists vida_eventos_motivo_check;
alter table public.vida_eventos
  add constraint vida_eventos_motivo_check
  check (motivo in ('atraso', 'recaida', 'renascimento', 'escudo'));

-- --------------------------------------------------- 2. multiplicador novo

-- Antes era `least(2.0, 1.0 + least(streak,30)/30.0)`: com ofensiva 1 dava
-- 1,0333, e `ceil(10 * 1,0333)` = 11. O "bonus de constancia" aparecia no
-- primeiro dia e era so arredondamento. Agora e faixa: nada antes de 30 dias,
-- e o dobro exige um ano. O sistema passa a pagar menos do que pagava, o que e
-- seguro para a loja e para o bau.
create or replace function public.multiplicador(streak int) returns numeric
language sql immutable as $$
  select case
    when streak >= 365 then 2.0
    when streak >= 180 then 1.5
    when streak >= 90  then 1.25
    when streak >= 30  then 1.1
    else 1.0
  end::numeric
$$;

revoke execute on function public.multiplicador(int) from public, anon, authenticated;

-- ----------------------------------------------------- 3. estorno do bonus

-- Devolve o que o arredondamento pagou a mais. Sem clamp em zero: clamp
-- esconde exatamente o caso que precisa ser visto, e ja foi furo real neste
-- projeto (`desfazer_check_in` com `greatest(0, ...)` virou ouro infinito).
--
-- Isto e conserto pontual do estado medido em 13/08/2026, NAO regra permanente.
-- Por isso o alvo e preso duas vezes:
--   `vezes_alvo = 1`  ocorrencia de uma marcacao so. Rotina de `n_por_semana`
--     com 3 marcacoes tem `ouro_creditado` legitimamente acima do `ouro_base`,
--     porque ela paga POR marcacao. Sem esta trava o estorno confiscaria ouro
--     ganho direito.
--   `data_sp <= 2026-08-13`  o dia em que a medicao foi feita. Check-in de
--     amanha ja nasce com o multiplicador novo e nao tem nada a estornar.
-- Sem os dois, uma reexecucao futura viraria confisco em vez de conserto.
-- Idempotente dentro desse recorte: depois de gravar `ouro_creditado` igual ao
-- `ouro_base`, nenhuma linha casa com `ouro_creditado > ouro_base` e rodar de
-- novo nao desconta nada.
do $$
declare v_negativos text;
begin
  with dif as (
    select o.user_id, sum(o.ouro_creditado - h.ouro_base)::int as diff
      from public.occurrences o
      join public.habits h on h.id = o.habit_id
     where o.status = 'feito'
       and o.ouro_creditado > h.ouro_base
       and o.vezes_alvo = 1
       and o.data_sp <= date '2026-08-13'
     group by 1
  )
  select string_agg(p.nome || ' (ouro ' || p.ouro || ', xp ' || p.xp
                    || ', estorno ' || d.diff || ')', '; ')
    into v_negativos
    from dif d
    join public.profiles p on p.id = d.user_id
   where p.ouro < d.diff or p.xp < d.diff;

  if v_negativos is not null then
    raise exception 'estorno do bonus deixaria saldo negativo: %', v_negativos;
  end if;

  with dif as (
    select o.user_id, sum(o.ouro_creditado - h.ouro_base)::int as diff
      from public.occurrences o
      join public.habits h on h.id = o.habit_id
     where o.status = 'feito'
       and o.ouro_creditado > h.ouro_base
       and o.vezes_alvo = 1
       and o.data_sp <= date '2026-08-13'
     group by 1
  )
  update public.profiles p
     set ouro = p.ouro - d.diff,
         xp = p.xp - d.diff
    from dif d
   where p.id = d.user_id;

  -- `ouro_creditado` alimenta o ranking do grupo, entao o ranking se corrige
  -- junto. Este UPDATE tem que vir depois do de profiles: ele e o que apaga a
  -- condicao usada para calcular a diferenca.
  update public.occurrences o
     set ouro_creditado = h.ouro_base
    from public.habits h
   where h.id = o.habit_id
     and o.status = 'feito'
     and o.ouro_creditado > h.ouro_base
     and o.vezes_alvo = 1
     and o.data_sp <= date '2026-08-13';
end $$;

-- ------------------------------------------------------------ 4. vida zero

-- Vida zero deixa de zerar todas as ofensivas. Com a escada de anos isso era
-- destrutivo demais: uma rotina perfeita de 200 dias morreria por causa de tres
-- rotinas diferentes atrasadas. No lugar, o personagem adoece e o progresso do
-- bau volta a contar do zero.
--
-- O escudo entra aqui: um escudo protege o DIA inteiro, nao uma rotina, e e
-- consumido no primeiro vacilo do dia. `escudo_usado_em` e o que impede o cron
-- gastar um segundo escudo quando rodar de novo no mesmo dia.
--
-- O QUE O ESCUDO PROTEGE, exatamente e so isso: a ofensiva. Ele NAO segura a
-- perda de vida, NAO segura a doenca e NAO segura o progresso do bau. Esses
-- tres sao consequencia de vida, nao de ofensiva: a rotina atrasada continua
-- custando 10 de vida com escudo, e vida em zero continua adoecendo e zerando
-- o bau. Quem quiser dizer o contrario na tela esta mentindo para o usuario.
--
-- E so consome quando ha o que proteger: se todas as ofensivas do usuario ja
-- estao em zero, nada seria zerado nesta rodada e queimar 800 de ouro seria
-- cobrar por um servico que nao foi prestado.
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
  -- faixa. Manter a folga ali faria a perda de vida chegar so no dia seguinte e
  -- a ofensiva quebrar tarde, depois da pessoa ja ter marcado o dia novo.
  -- Passou a faixa, e atrasado.
  --
  -- `habits.modulo` nasce na 0023, que aplica na mesma transacao desta. Entre
  -- as duas o cron so consegue erro, nunca dado errado.
  with venceu as (
    update occurrences o
       set status = 'atrasado', proximo_toque_em = now()
     where o.status = 'pendente'
       and o.vence_em + case
             when exists (select 1 from habits h
                           where h.id = o.habit_id
                             and h.modulo in ('acordar', 'dormir'))
               then interval '0'
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
  -- escudo so.
  --
  -- So consome quando existe ofensiva viva que seria zerada nesta rodada. Quem
  -- esta com tudo em zero nao tem o que salvar, e queimar 800 de ouro para
  -- proteger nada e o tipo de cobranca que o usuario descobre depois.
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
  update profiles p
     set vida = 50,
         doente = true,
         bau_base = (select count(distinct o.data_sp)::int from occurrences o
                      where o.user_id = p.id and o.status = 'feito')
   where p.vida = 0;

  return v_total;
end $$;

revoke execute on function public.marcar_atrasadas() from public, anon, authenticated;

-- ----------------------------------------------- 5. recaida na vida zero

-- Mesma troca do `marcar_atrasadas`: vida zerada adoece e reseta o bau, em vez
-- de zerar todas as ofensivas.
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
    'vida_perdida', v_vida_perdida,
    'ouro_perdido', v_ouro_perdido,
    'vida', v_vida,
    'ouro', v_ouro,
    'renasceu', v_renasceu
  );
end $$;

revoke execute on function public.registrar_recaida(uuid) from public, anon, authenticated;
grant execute on function public.registrar_recaida(uuid) to authenticated;

-- --------------------------------------------------- 6. curar e comprar escudo

-- Preco constante no corpo da funcao. O front nunca envia preco: se divergir, a
-- RPC recusa e a tela mostra o erro.
create or replace function public.curar()
returns json
language plpgsql
security definer
set search_path = public
as $$
declare v_preco constant int := 200; v_p profiles;
begin
  select * into v_p from profiles where id = auth.uid() for update;
  if not found then
    return json_build_object('error', 'sem_perfil');
  end if;

  if not v_p.doente then
    return json_build_object('error', 'nao_esta_doente');
  end if;

  if v_p.ouro < v_preco then
    return json_build_object('error', 'ouro_insuficiente', 'falta', v_preco - v_p.ouro);
  end if;

  update profiles set ouro = ouro - v_preco, doente = false where id = auth.uid();

  return json_build_object('ok', true, 'ouro', v_p.ouro - v_preco);
end $$;

revoke execute on function public.curar() from public, anon, authenticated;
grant execute on function public.curar() to authenticated;

create or replace function public.comprar_escudo()
returns json
language plpgsql
security definer
set search_path = public
as $$
declare v_preco constant int := 800; v_p profiles; v_ouro int; v_escudos int;
begin
  select * into v_p from profiles where id = auth.uid() for update;
  if not found then
    return json_build_object('error', 'sem_perfil');
  end if;

  if v_p.ouro < v_preco then
    return json_build_object('error', 'ouro_insuficiente', 'falta', v_preco - v_p.ouro);
  end if;

  update profiles
     set ouro = ouro - v_preco,
         escudos = escudos + 1
   where id = auth.uid()
   returning ouro, escudos into v_ouro, v_escudos;

  return json_build_object('ok', true, 'escudos', v_escudos, 'ouro', v_ouro);
end $$;

revoke execute on function public.comprar_escudo() from public, anon, authenticated;
grant execute on function public.comprar_escudo() to authenticated;
