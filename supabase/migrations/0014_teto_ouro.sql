-- 0014_teto_ouro
-- Teto de 10 de ouro por habito. Sem teto, quem cadastra o proprio habito
-- define a propria recompensa, e a economia inteira do jogo perde o sentido:
-- basta criar um habito de 100 para comprar tudo em um dia.

update public.habits set ouro_base = 10 where ouro_base > 10;

alter table public.habits drop constraint if exists habits_ouro_base_check;
alter table public.habits add constraint habits_ouro_base_check
  check (ouro_base between 1 and 10);

create or replace function public.criar_habito(
  p_titulo text,
  p_regra jsonb,
  p_icone text default 'target',
  p_lembrete time default null,
  p_ouro_base int default 10,
  p_group_id uuid default null
) returns json language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if coalesce(trim(p_titulo), '') = '' then
    return json_build_object('error', 'titulo_vazio');
  end if;

  if not public.regra_valida(p_regra) then
    return json_build_object('error', 'frequencia_invalida');
  end if;

  if p_ouro_base is null or p_ouro_base < 1 or p_ouro_base > 10 then
    return json_build_object('error', 'ouro_base_invalido');
  end if;

  if p_group_id is not null and not public.e_membro(p_group_id) then
    return json_build_object('error', 'grupo_invalido');
  end if;

  insert into habits (escopo, group_id, user_id, titulo, icone, regra_frequencia, lembrete_hora, ouro_base)
  values (
    case when p_group_id is null then 'user' else 'group' end,
    p_group_id,
    case when p_group_id is null then auth.uid() else null end,
    left(trim(p_titulo), 80),
    coalesce(nullif(trim(p_icone), ''), 'target'),
    p_regra,
    p_lembrete,
    p_ouro_base
  )
  returning id into v_id;

  perform public.gerar_ocorrencias(7);

  return json_build_object('ok', true, 'id', v_id);
end $$;

revoke execute on function public.criar_habito(text, jsonb, text, time, int, uuid)
  from public, anon, authenticated;
grant execute on function public.criar_habito(text, jsonb, text, time, int, uuid)
  to authenticated;
