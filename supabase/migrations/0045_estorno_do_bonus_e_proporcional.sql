-- 0045 O estorno do bonus da pocao devolve o que aquela marcacao pagou, e nao a
-- semana inteira.
--
-- Achado testando a 0043: numa janela de 2, com a pocao de ouro ativa, marcar
-- duas vezes pagava 60 de base mais 60 de bonus, e desfazer UMA marcacao tirava
-- os 60 de bonus inteiros. A pessoa ficava com 30, quando o certo era 60. O
-- comentario da 0038 chamava isso de "erra para o lado do servidor", e era
-- aceitavel enquanto a ocorrencia guardava um dia; com a janela ela guarda a
-- semana, e o erro passou a ser grande demais para chamar de arredondamento.
--
-- Agora o estorno acompanha a base: devolve exatamente a diferenca de
-- `ouro_creditado`, limitada ao que ainda ha de bonus. Zerou, a linha sai, e
-- remarcar volta a pagar, o que e neutro porque o dinheiro voltou inteiro. Sem
-- saldo para estornar, a linha CONGELA com `estornado_em`, e e isso que continua
-- impedindo o laco de desfazer e remarcar com a carteira vazia.

create or replace function public.occ_depois_de_gravar()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_delta int;
  v_valor int;
  v_dobra date;
  v_dia date;
  v_vida int;
  v_antes int;
  v_ouro int;
begin
  if new.ouro_creditado > old.ouro_creditado then
    select ouro_dobrado_em into v_dobra from profiles where id = new.user_id;
    -- Em janela o dia que vale e o de hoje, que e quando a marcacao aconteceu:
    -- `data_sp` la e o ultimo dia do periodo, nunca o dia do check-in.
    v_dia := case
      when new.inicio_janela is distinct from new.data_sp then public.hoje_sp()
      else new.data_sp
    end;
    if v_dobra = v_dia then
      v_delta := new.ouro_creditado - old.ouro_creditado;
      insert into bonus_ouro (occurrence_id, user_id, valor)
      values (new.id, new.user_id, v_delta)
      on conflict (occurrence_id) do update
        set valor = bonus_ouro.valor + excluded.valor
      where bonus_ouro.estornado_em is null;
      -- `found` cobre os dois caminhos que pagam, insercao e acumulo, e e falso
      -- quando o `where` do conflito barra a linha ja congelada.
      if found then
        update profiles set ouro = ouro + v_delta, xp = xp + v_delta
         where id = new.user_id;
      end if;
    end if;
  end if;

  if new.ouro_creditado < old.ouro_creditado then
    select valor into v_valor from bonus_ouro
     where occurrence_id = new.id and estornado_em is null;
    if v_valor is not null then
      v_delta := least(old.ouro_creditado - new.ouro_creditado, v_valor);
      select ouro into v_ouro from profiles where id = new.user_id for update;
      if v_ouro >= v_delta then
        update profiles
           set ouro = ouro - v_delta,
               xp = greatest(0, xp - v_delta)
         where id = new.user_id;
        if v_valor - v_delta = 0 then
          delete from bonus_ouro where occurrence_id = new.id;
        else
          update bonus_ouro set valor = valor - v_delta where occurrence_id = new.id;
        end if;
      else
        -- Sem saldo nao ha estorno, e por isso a linha congela: sem o carimbo,
        -- remarcar pagaria o bonus de novo e a volta viraria torneira.
        update bonus_ouro set estornado_em = now() where occurrence_id = new.id;
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

revoke execute on function public.occ_depois_de_gravar() from public, anon, authenticated;
