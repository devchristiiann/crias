-- 0015_personagens
--
-- Trocar de personagem passa a custar ouro. Antes era UPDATE direto do cliente
-- em profiles.avatar_base, de graca e sem limite.
--
-- Duas travas, porque uma so nao segura:
--   1. a RPC cobra e valida a base recebida;
--   2. o privilegio de coluna sai de authenticated, senao da para driblar a RPC
--      com PATCH /rest/v1/profiles {"avatar_base":"base-05"} e trocar de graca.
--      Foi exatamente esse o furo do item_equipado, corrigido no 0013.

-- ---------------------------------------------------------------------------
-- 1. Marca de que o personagem inicial ja foi escolhido.
--
-- O onboarding grava avatar_base no primeiro passo, quando o usuario tem zero
-- de ouro: cobrar ali trancaria o cadastro. A flag separa "primeira escolha"
-- de "troca", sem depender do valor da coluna (quem escolhe base-01 no
-- onboarding nao muda nada e continuaria com uma troca gratis guardada).
--
-- Quem ja existe recebe true: essa gente ja passou pelo onboarding e a escolha
-- inicial ja foi gasta.
-- ---------------------------------------------------------------------------

-- O backfill roda so na criacao da coluna. Um `update ... where not definido`
-- solto marcaria como gasta a escolha de quem se cadastrou depois, toda vez que
-- a migration fosse reaplicada.
do $$
begin
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'profiles'
       and column_name = 'personagem_definido'
  ) then
    alter table public.profiles
      add column personagem_definido boolean not null default false;
    update public.profiles set personagem_definido = true;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 2. Preco em um lugar so.
--
-- Interna: quem consulta usa info_personagem, que ja devolve o contexto todo.
-- ---------------------------------------------------------------------------

create or replace function public.custo_personagem() returns int
language sql immutable as $$ select 25 $$;

revoke execute on function public.custo_personagem() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Consulta do preco, para a tela mostrar o custo ANTES de cobrar.
--
-- O front nao chuta 25: ele le daqui. Se o preco mudar, a tela acompanha.
-- ---------------------------------------------------------------------------

create or replace function public.info_personagem()
returns json language sql stable security definer set search_path = public as $$
  select json_build_object(
    'custo', public.custo_personagem(),
    'gratis', not p.personagem_definido,
    'ouro', p.ouro,
    'base', p.avatar_base
  )
  from public.profiles p where p.id = auth.uid()
$$;

-- ---------------------------------------------------------------------------
-- 4. A troca.
--
-- Cobra so quando ja existe escolha anterior E a base muda de verdade. Tocar
-- no personagem que ja esta vestido nao debita nada: seria cobrar por nada.
-- ---------------------------------------------------------------------------

create or replace function public.trocar_personagem(p_base text)
returns json language plpgsql security definer set search_path = public as $$
declare
  -- Precisa bater com BASES em src/lib/sprites.ts. Base invalida deixaria o
  -- Avatar renderizar o boneco padrao com o perfil apontando para o nada.
  v_bases constant text[] := array[
    'base-01', 'base-02', 'base-03', 'base-04', 'base-05', 'base-06'
  ];
  v_custo constant int := public.custo_personagem();
  v_atual text;
  v_definido boolean;
  v_ouro int;
  v_cobrado int := 0;
begin
  if p_base is null or not (p_base = any (v_bases)) then
    return json_build_object('error', 'base_invalida');
  end if;

  -- O lock e o que impede duplo clique de debitar duas vezes.
  select avatar_base, personagem_definido, ouro
    into v_atual, v_definido, v_ouro
    from public.profiles where id = auth.uid() for update;

  if not found then
    return json_build_object('error', 'sem_perfil');
  end if;

  if v_definido and p_base <> v_atual then
    if v_ouro < v_custo then
      return json_build_object(
        'error', 'ouro_insuficiente', 'custo', v_custo, 'ouro', v_ouro
      );
    end if;
    v_cobrado := v_custo;
  end if;

  update public.profiles
     set avatar_base = p_base,
         personagem_definido = true,
         ouro = ouro - v_cobrado
   where id = auth.uid();

  return json_build_object(
    'ok', true, 'base', p_base, 'custo', v_cobrado, 'ouro', v_ouro - v_cobrado
  );
end $$;

-- Armadilha da casa: `revoke ... from public, anon` NAO tira o EXECUTE de
-- authenticated, que ganha execute por padrao no Supabase. Revoga dos tres e
-- concede de volta so para quem deve chamar.
revoke execute on function public.info_personagem() from public, anon, authenticated;
revoke execute on function public.trocar_personagem(text) from public, anon, authenticated;

grant execute on function public.info_personagem() to authenticated;
grant execute on function public.trocar_personagem(text) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Fecha o PATCH direto.
--
-- Sem isso a RPC vira decoracao: o cliente escreve avatar_base pelo PostgREST
-- e troca de personagem sem pagar. Sobra nome, que nao tem custo nenhum.
-- ---------------------------------------------------------------------------

revoke update on public.profiles from public, anon, authenticated;
grant update (nome) on public.profiles to authenticated;
