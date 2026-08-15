-- 0037 Correcoes achadas nas duas revisoes adversariais da 0034 e 0035.

-- 1. Lista branca que devolve NULL nao e lista branca.
--
-- `if p_tipo not in ('vida','ouro')` devolve NULL quando `p_tipo` e nulo, e
-- `if NULL` nao dispara: a guarda inteira era pulada, `p_tipo = 'vida'` tambem
-- dava NULL e a execucao caia no `else`, que e a pocao de ouro. Chamar
-- `usar_pocao(null)` gastava uma pocao azul. Com token era pior: a acao virava
-- NULL, a coluna e NOT NULL, e o erro cru do Postgres chegava ao navegador com
-- o corpo da funcao no CONTEXT. Mesma armadilha que a `regra_valida` ja pagou.
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
  if p_tipo is null or p_tipo not in ('vida', 'ouro') then
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

-- Mesma guarda explicita na compra. Ela ja recusava nulo por acidente feliz,
-- porque o `case` sem `when null` deixa o preco nulo, e acidente feliz nao e
-- trava: quem mexer no `case` amanha nao tem como saber que dependia disso.
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
  if p_tipo is null then
    return json_build_object('error', 'pocao_invalida');
  end if;

  -- Preco no servidor, nunca no payload. Tipo desconhecido e recusado, nunca
  -- interpretado: lista branca, mesma regra do p_acao da 0025.
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

-- 2. Gatilho de efeito, com tres correcoes.
--
-- a) O descanso passa a ser chaveado pelo DIA REAL, e nao pelo dia da
--    ocorrencia. Rotina diaria aceita marcacao atrasada, entao fechar quatro
--    dias parados numa sentada devolvia 5 por dia, 20 de vida de uma vez, de
--    graca, o que anulava a pocao de vida. O backfill da 0035 ja tinha usado o
--    dia real, entao a tabela nascera com uma semantica e o gatilho escrevia em
--    outra.
-- b) O bonus da pocao de ouro passa a ser ESTORNADO no desfazer. Antes, marcar
--    e parar deixava o bonus na carteira sem check-in nenhum registrado.
-- c) O bonus ACUMULA na mesma ocorrencia. Rotina de "N vezes por semana" paga
--    por marcacao, e o `do nothing` dobrava so a primeira.
--
-- Este corpo e substituido pela 0038: o estorno que apaga a linha reabre um
-- laco quando o saldo nao cobre o valor. Ver la.
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
  v_ouro int;
begin
  if new.ouro_creditado > old.ouro_creditado then
    select ouro_dobrado_em into v_dobra from profiles where id = new.user_id;
    if v_dobra = new.data_sp then
      v_delta := new.ouro_creditado - old.ouro_creditado;
      insert into bonus_ouro (occurrence_id, user_id, valor)
      values (new.id, new.user_id, v_delta)
      on conflict (occurrence_id) do update set valor = bonus_ouro.valor + excluded.valor;
      update profiles set ouro = ouro + v_delta, xp = xp + v_delta
       where id = new.user_id;
    end if;
  end if;

  if new.ouro_creditado < old.ouro_creditado then
    select valor into v_delta from bonus_ouro where occurrence_id = new.id;
    if v_delta is not null then
      select ouro into v_ouro from profiles where id = new.user_id for update;
      if v_ouro >= v_delta then
        delete from bonus_ouro where occurrence_id = new.id;
        update profiles
           set ouro = ouro - v_delta,
               xp = greatest(0, xp - v_delta)
         where id = new.user_id;
      end if;
    end if;
  end if;

  -- Descanso: o primeiro dia produtivo devolve 5 de vida, uma vez por dia. Sem
  -- isto a vida so andava para baixo, e a unica saida era morrer para renascer.
  if new.status = 'feito' and old.status is distinct from 'feito' then
    insert into descansos (user_id, data_sp) values (new.user_id, public.hoje_sp())
    on conflict (user_id, data_sp) do nothing;
    if found then
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

-- 3. `set search_path` no gatilho de campo, e `revoke execute` nos dois.
--    Nenhum dos dois e chamavel na pratica, porque funcao que devolve `trigger`
--    o Postgres recusa fora de contexto de gatilho, mas o advisor aponta e a
--    regra do projeto e explicita: o par e sempre
--    `revoke ... from public, anon, authenticated`.
create or replace function public.occ_antes_de_gravar()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- A declaracao de tempo de tela publica o post na hora, e nao quando a
  -- enquete fecha. O feed ordena por feito_em, entao sem isto a enquete nao tem
  -- lugar na linha do tempo. O prazo tambem cai de 48 para 24 horas: a check_in
  -- da 0026 ainda escreve 48, e este gatilho e a fonte de verdade.
  if new.status = 'em_validacao' and old.status is distinct from 'em_validacao' then
    new.feito_em := coalesce(new.feito_em, now());
    new.validacao_ate := now() + interval '24 hours';
  end if;

  -- Aprovar nao republica o post. resolver_validacao escreve feito_em = now(),
  -- e sem isto o post pularia para o topo do feed um dia depois.
  if new.status = 'feito' and old.status = 'em_validacao' and old.feito_em is not null then
    new.feito_em := old.feito_em;
  end if;

  return new;
end
$$;

revoke execute on function public.occ_antes_de_gravar() from public, anon, authenticated;
revoke execute on function public.occ_depois_de_gravar() from public, anon, authenticated;

-- 4. Clausula WHEN nos dois gatilhos. Sem ela eles entram no plpgsql em TODO
--    update de `occurrences`, e `registrar_toque` roda a cada push.
drop trigger if exists occ_antes_de_gravar on occurrences;
create trigger occ_antes_de_gravar
  before update on occurrences
  for each row
  when (new.status is distinct from old.status)
  execute function public.occ_antes_de_gravar();

drop trigger if exists occ_depois_de_gravar on occurrences;
create trigger occ_depois_de_gravar
  after update on occurrences
  for each row
  when (new.status is distinct from old.status
        or new.ouro_creditado is distinct from old.ouro_creditado)
  execute function public.occ_depois_de_gravar();

-- 5. `idx_occ_feed` virou indice morto no dia em que o feed passou a ler
--    tambem `em_validacao`: o predicado parcial `status = 'feito'` nao cobre o
--    `in`, e a consulta mais quente do app caiu em varredura sequencial mais
--    ordenacao.
drop index if exists idx_occ_feed;
create index idx_occ_feed on occurrences (habit_id, feito_em desc)
  where status in ('feito', 'em_validacao');

-- 6. `idx_vida_eventos_user_data` da 0034 e copia exata de `idx_vida_user`, que
--    ja existia. Nao e subconjunto, e o mesmo indice, e a 0034 quebrou no
--    proprio arquivo a regra que ela cita.
drop index if exists idx_vida_eventos_user_data;

-- 7. O teto diario de perda de vida comparava uma expressao sobre `criado_em`,
--    que nenhum indice atende. Comparar o instante inicial do dia usa
--    `idx_vida_user`.
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
         and e.criado_em >= public.instante_sp(public.hoje_sp(), '00:00')
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
