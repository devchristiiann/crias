-- 0035 O descanso paga uma vez por dia, e nao uma vez por marcacao.
--
-- Achado num teste adversarial da 0034, dentro de begin e rollback: o gatilho
-- media "primeira rotina do dia" olhando se existia OUTRA ocorrencia feita
-- naquele dia. Desmarcar e remarcar a mesma rotina voltava a ser a primeira, e
-- cada ida e volta devolvia mais 5 de vida, pela tela, sem limite. A chave por
-- dia e a mesma trava do bonus_ouro e da premiacao semanal: quem paga e a linha
-- efetivamente inserida, nunca a condicao recalculada.

create table if not exists descansos (
  user_id uuid not null references profiles(id) on delete cascade,
  data_sp date not null,
  criado_em timestamptz not null default now(),
  primary key (user_id, data_sp)
);

alter table descansos enable row level security;
revoke all on descansos from public, anon, authenticated;

-- Quem ja recebeu o descanso hoje entra na tabela agora, senao a correcao
-- pagaria de novo para quem acabou de receber pela regra antiga.
insert into descansos (user_id, data_sp)
select distinct e.user_id, (e.criado_em at time zone 'America/Sao_Paulo')::date
  from vida_eventos e
 where e.motivo = 'descanso'
on conflict do nothing;

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
  -- bonus_ouro, fora de ouro_creditado, para nao entrar no ranking. Nao e
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

  -- Descanso: o primeiro dia produtivo devolve 5 de vida, uma vez por dia. Sem
  -- isto a vida so andava para baixo, e a unica saida era morrer para renascer.
  if new.status = 'feito' and old.status is distinct from 'feito' then
    insert into descansos (user_id, data_sp) values (new.user_id, new.data_sp)
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
