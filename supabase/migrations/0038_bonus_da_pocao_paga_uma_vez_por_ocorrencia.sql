-- 0038 O bonus da pocao de ouro paga uma vez por ocorrencia, e ponto.
--
-- A 0037 estornava o bonus no desfazer e APAGAVA a linha de `bonus_ouro`. Com a
-- linha apagada, remarcar pagava de novo, e o estorno so acontece quando o
-- saldo cobre o valor. Quem mantivesse o saldo baixo entrava num laco fechado:
-- desfazer devolvia a base (a trava `saldo_gasto` do desfazer garante saldo para
-- isso), o bonus nao era estornado por falta de saldo, e remarcar pagava o bonus
-- outra vez. Trinta de ouro por volta, sem limite, tudo pela tela. Achado
-- testando a propria correcao, nao em revisao.
--
-- A regra agora e a mesma dos `baus` e das `premiacoes`: a linha e o recibo, e
-- recibo nao se apaga. Enquanto ela nunca foi acertada o bonus acumula, que e o
-- que a rotina de "N vezes por semana" precisa. Depois de acertada, ela congela:
-- aquela ocorrencia nao paga bonus nunca mais, tenha o estorno acontecido ou
-- nao. O teto do que se pode ganhar sem check-in fica em um bonus, uma vez,
-- para quem tinha gastado o saldo antes de desfazer.

alter table bonus_ouro add column if not exists estornado_em timestamptz;

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
  v_pago boolean;
begin
  if new.ouro_creditado > old.ouro_creditado then
    select ouro_dobrado_em into v_dobra from profiles where id = new.user_id;
    if v_dobra = new.data_sp then
      v_delta := new.ouro_creditado - old.ouro_creditado;
      insert into bonus_ouro (occurrence_id, user_id, valor)
      values (new.id, new.user_id, v_delta)
      on conflict (occurrence_id) do update
        set valor = bonus_ouro.valor + excluded.valor
      where bonus_ouro.estornado_em is null;
      -- `found` cobre os dois caminhos que pagam, insercao e acumulo, e e falso
      -- quando o `where` do conflito barra a linha ja acertada.
      v_pago := found;
      if v_pago then
        update profiles set ouro = ouro + v_delta, xp = xp + v_delta
         where id = new.user_id;
      end if;
    end if;
  end if;

  -- Desfazer acerta a linha uma vez so. O estorno depende de saldo, o carimbo
  -- nao: sem carimbo incondicional, quem esta sem saldo remarca e recebe de
  -- novo. Estorno parcial de rotina de janela devolve o bonus inteiro daquela
  -- ocorrencia, de proposito: erra para o lado do servidor, e a alternativa
  -- seria contabilidade proporcional para um caso que rende trinta de ouro.
  if new.ouro_creditado < old.ouro_creditado then
    select valor into v_delta from bonus_ouro
     where occurrence_id = new.id and estornado_em is null;
    if v_delta is not null then
      select ouro into v_ouro from profiles where id = new.user_id for update;
      if v_ouro >= v_delta then
        update profiles
           set ouro = ouro - v_delta,
               xp = greatest(0, xp - v_delta)
         where id = new.user_id;
      end if;
      update bonus_ouro set estornado_em = now() where occurrence_id = new.id;
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

revoke execute on function public.occ_depois_de_gravar() from public, anon, authenticated;

-- O placar da enquete precisa chegar ao vivo. `votos_validacao` nao estava na
-- publicacao, entao a assinatura do cliente era inerte e quem estava com a tela
-- do grupo aberta via "Validado 0" enquanto os colegas votavam. A policy de
-- select ja restringe a leitura a membro do grupo, e o Realtime honra RLS.
alter publication supabase_realtime add table public.votos_validacao;
