-- 0018: comprar personagem pela loja voltou a funcionar.
--
-- A 0017 deixou `equipar_item` conferindo posse ANTES de desviar por slot.
-- Para acessorio, cenario e fundo isso esta certo: a compra e um passo
-- separado. Para personagem nao: comprar e vestir sao a mesma acao, feita por
-- `trocar_personagem`, que cobra e registra a posse. Como a pessoa ainda nao
-- possui o personagem no momento do clique, a conferencia disparava primeiro e
-- toda compra de personagem na loja respondia `item_nao_possuido`.
--
-- O desvio por slot passa a vir primeiro, e a conferencia de posse fica so nos
-- slots onde ela faz sentido.

create or replace function public.equipar_item(p_item text, p_slot text default null)
returns json
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_slot text;
begin
  if p_item is null then
    -- Tirar precisa saber de onde. Sem o slot, o padrao e o acessorio, que era
    -- o unico que existia antes da 0017.
    v_slot := coalesce(p_slot, 'acessorio');
  else
    select slot into v_slot from avatar_items where id = p_item and ativo;
    if v_slot is null then return json_build_object('error', 'item_inexistente'); end if;
  end if;

  -- Personagem sai antes da conferencia de posse: trocar_personagem e quem
  -- cobra, registra a posse e valida ouro.
  if v_slot = 'personagem' then
    return public.trocar_personagem(p_item);
  end if;

  if p_item is not null
     and not exists (select 1 from owned_items
                      where user_id = auth.uid() and item_id = p_item) then
    return json_build_object('error', 'item_nao_possuido');
  end if;

  if v_slot = 'acessorio' then
    update profiles set item_equipado = p_item where id = auth.uid();
  elsif v_slot = 'cenario' then
    update profiles set cenario_equipado = p_item where id = auth.uid();
  elsif v_slot = 'fundo' then
    update profiles set fundo_equipado = p_item where id = auth.uid();
  else
    return json_build_object('error', 'slot_invalido');
  end if;

  return json_build_object('ok', true, 'slot', v_slot);
end $$;

revoke execute on function public.equipar_item(text, text) from public, anon, authenticated;
grant execute on function public.equipar_item(text, text) to authenticated;
