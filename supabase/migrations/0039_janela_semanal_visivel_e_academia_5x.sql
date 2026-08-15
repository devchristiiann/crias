-- 0039 A rotina de janela aparece durante a janela, e a Academia vira 5x por semana.
--
-- O motor de recorrencia ja tinha `n_por_semana`, com uma ocorrencia por
-- periodo, `inicio_janela` no primeiro dia e `data_sp` no ultimo. Ninguem usava:
-- havia zero habito desse tipo em producao, e por dois motivos que se somavam.
-- O gerador so criava a linha quando a serie de 2 dias alcancava o ULTIMO dia da
-- janela, entao de segunda a quinta a linha nem existia; e a tela Hoje filtra
-- por `data_sp`, entao a linha so apareceria no domingo. Quem escolhesse "5
-- vezes por semana" recebia uma rotina que so dava para marcar no ultimo dia.
--
-- Esta migration ancora a linha no PRIMEIRO dia da janela e faz cada marcacao
-- publicar no feed. A tela e o feed acompanham no mesmo commit.

create or replace function public.gerar_ocorrencias(dias int default 2)
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
  -- A janela sai do proprio dia candidato, e nao de uma ancora guardada: a
  -- semana de qualquer dia e a segunda que o antecede, e o mes e o dia 1. Assim
  -- o mesmo `case` serve tanto para a linha nascer na segunda quanto para ela
  -- nascer hoje, quando o habito foi criado no meio da semana.
  janela as (
    select a.*,
      case regra->>'tipo'
        when 'n_por_semana' then a.data_sp - (extract(isodow from a.data_sp)::int - 1)
        when 'n_por_mes' then date_trunc('month', a.data_sp)::date
        else a.data_sp
      end as ini
    from alvo a
  ),
  filtrado as (
    select j.*,
      case regra->>'tipo'
        when 'n_por_semana' then j.ini + 6
        when 'n_por_mes' then (date_trunc('month', j.ini) + interval '1 month - 1 day')::date
        else j.data_sp
      end as fim
    from janela j
    where case regra->>'tipo'
      when 'diaria' then true
      when 'semanal_dias' then regra->'dias' @> to_jsonb(extract(dow from data_sp)::int)
      when 'dias_uteis' then regra->'dias' @> to_jsonb(extract(isodow from data_sp)::int)
      when 'quinzenal' then mod(abs(data_sp - (regra->>'ancora')::date), 14) = 0
      when 'mensal_dia' then extract(day from data_sp)::int = (regra->>'dia')::int
      -- Nasce no primeiro dia da janela. O segundo ramo cobre o habito criado no
      -- meio dela, e so quando ainda cabem os dias que a meta pede: uma meta de
      -- 5 aberta no sabado nasceria vencida e cobraria vida de quem acabou de
      -- criar a rotina.
      when 'n_por_semana' then data_sp = ini
        or (data_sp = public.hoje_sp()
            and (8 - extract(isodow from data_sp)::int) >= (regra->>'vezes')::int)
      when 'n_por_mes' then data_sp = ini
        or (data_sp = public.hoje_sp()
            and (extract(day from (date_trunc('month', data_sp) + interval '1 month - 1 day')::date)::int
                 - extract(day from data_sp)::int + 1) >= (regra->>'vezes')::int)
      when 'avulsa' then data_sp = (regra->>'data')::date
      else false
    end
  ),
  -- `vence_em` sai calculado aqui, uma vez so, e sobre `fim`, que e o dia em que
  -- a janela fecha. Recalcular a hora da faixa por outro caminho e como os dois
  -- divergiriam, e no `dormir` a faixa de madrugada ja vem somada de 1440 por
  -- `minutos_faixa`.
  calculado as (
    select f.*,
      case
        when f.modulo in ('acordar', 'dormir') then
          ((f.fim::timestamp
            + (public.minutos_faixa(
                 f.modulo,
                 f.config->'faixas'->(jsonb_array_length(f.config->'faixas') - 1)->>'ate'
               ) * interval '1 minute'))
            at time zone 'America/Sao_Paulo')
        else ((f.fim + time '23:59') at time zone 'America/Sao_Paulo')
      end as vence_em
    from filtrado f
  )
  insert into occurrences (
    habit_id, user_id, data_sp, inicio_janela, vence_em, proximo_toque_em, vezes_alvo
  )
  select
    habit_id,
    user_id,
    fim,
    ini,
    vence_em,
    -- O lembrete cai no PRIMEIRO dia da janela, nao no ultimo: um lembrete que
    -- so toca no domingo de uma meta semanal chega quando nao da mais tempo.
    -- ponytail: a escada de 4 toques ainda se esgota nesse primeiro dia, entao
    -- meta semanal com lembrete e cutucada de segunda, e so. Se isso doer, o
    -- conserto e `toques_pendentes` reabrir o toque a cada dia da janela.
    case
      when modulo = 'agua' then
        case when jsonb_array_length(config->'lembretes') > 0
          then ((ini + (config->'lembretes'->>0)::time) at time zone 'America/Sao_Paulo')
          else null end
      when lembrete_hora is null then null
      else ((ini + lembrete_hora) at time zone 'America/Sao_Paulo')
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
    -- `marcar_atrasadas` cobraria vida de quem acabou de criar a rotina.
    and not (modulo in ('acordar', 'dormir') and vence_em <= now())
  on conflict (habit_id, user_id, data_sp) do nothing;

  get diagnostics inseridas = row_count;
  return inseridas;
end
$$;

revoke execute on function public.gerar_ocorrencias(int) from public, anon, authenticated;

-- Cada marcacao de rotina de janela publica no feed.
--
-- Sem isto, quatro das cinco idas a academia ficam invisiveis para o grupo, e
-- num grupo que exige foto isso e perder a comprovacao: a rotina fica
-- `pendente` ate a ultima marcacao, e o feed so mostra quem tem `feito_em`.
-- Quem distingue janela de rotina comum e `inicio_janela <> data_sp`, que o
-- gerador so produz para `n_por_semana` e `n_por_mes`: a agua tem `vezes_alvo`
-- maior que 1 e nao e janela, e seis copos por dia no feed seriam ruido.
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

  if new.inicio_janela is distinct from new.data_sp then
    if new.vezes_feitas > old.vezes_feitas then
      new.feito_em := now();
    elsif new.vezes_feitas = 0 and old.vezes_feitas > 0 then
      -- Desfez a unica marcacao da janela: nao ha o que mostrar no feed.
      new.feito_em := null;
    end if;
  end if;

  return new;
end
$$;

revoke execute on function public.occ_antes_de_gravar() from public, anon, authenticated;

drop trigger if exists occ_antes_de_gravar on occurrences;
create trigger occ_antes_de_gravar
  before update on occurrences
  for each row
  when (new.status is distinct from old.status
        or new.vezes_feitas is distinct from old.vezes_feitas)
  execute function public.occ_antes_de_gravar();

-- A Academia do Crias 2.0: de segunda a sexta obrigatorias para 5 dias
-- quaisquer da semana. Quem treina no sabado passa a contar, e quem falta na
-- terca nao perde vida se fechar os 5 dias.
--
-- Nada do passado e tocado: as ocorrencias de 13 e 14 de agosto ficam com o
-- status e o `ouro_creditado` que tem, entao ninguem perde ouro. As ofensivas
-- tambem ficam de pe, e passam a contar semanas em vez de dias, o que so
-- favorece quem ja tinha.
update habits
   set regra_frequencia = '{"tipo": "n_por_semana", "vezes": 5}'::jsonb
 where id = '4bd75dfb-6a0e-47e7-9164-e3d31f50d97d';

-- As ocorrencias diarias que a regra velha deixou marcadas para o futuro nao
-- servem mais. So saem as que nunca foram tocadas: sem marcacao, sem ouro e
-- ainda pendentes. Se alguma tivesse historico, ela ficaria de pe.
delete from occurrences
 where habit_id = '4bd75dfb-6a0e-47e7-9164-e3d31f50d97d'
   and data_sp > public.hoje_sp()
   and status = 'pendente'
   and vezes_feitas = 0
   and ouro_creditado = 0;

select public.gerar_ocorrencias(2);
