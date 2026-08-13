-- 0007_criar_habito
-- Criar habito e gerar as ocorrencias tem que acontecer junto. Sem isso o habito
-- novo so apareceria na tela depois do cron da meia-noite.
-- A validacao da regra e repetida aqui de proposito: o Zod do front protege a UI,
-- o banco protege o dado. Quem chama a API direto passa so por esta.

create or replace function public.regra_valida(r jsonb) returns boolean
language sql immutable as $$
  select case r->>'tipo'
    when 'diaria' then true
    when 'semanal_dias' then jsonb_typeof(r->'dias') = 'array' and jsonb_array_length(r->'dias') between 1 and 7
    when 'dias_uteis' then jsonb_typeof(r->'dias') = 'array' and jsonb_array_length(r->'dias') between 1 and 5
    when 'quinzenal' then (r->>'ancora') is not null
    when 'mensal_dia' then (r->>'dia')::int between 1 and 31
    when 'n_por_semana' then (r->>'vezes')::int between 1 and 7
    when 'n_por_mes' then (r->>'vezes')::int between 1 and 31
    when 'avulsa' then (r->>'data') is not null
    else false
  end
$$;

alter table public.habits drop constraint if exists habit_regra_valida;
alter table public.habits add constraint habit_regra_valida
  check (public.regra_valida(regra_frequencia));

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

  if p_ouro_base is null or p_ouro_base < 1 or p_ouro_base > 100 then
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

create or replace function public.arquivar_habito(p_habito uuid)
returns json language plpgsql security definer set search_path = public as $$
declare v habits;
begin
  select * into v from habits where id = p_habito;
  if not found then
    return json_build_object('error', 'habito_inexistente');
  end if;

  -- Habito de grupo so o dono do grupo arquiva. Habito pessoal so o proprio dono.
  if v.escopo = 'user' and v.user_id <> auth.uid() then
    return json_build_object('error', 'sem_permissao');
  end if;
  if v.escopo = 'group' and not exists (
    select 1 from groups g where g.id = v.group_id and g.dono_id = auth.uid()
  ) then
    return json_build_object('error', 'sem_permissao');
  end if;

  update habits set ativo = false where id = p_habito;
  -- Ocorrencia futura ainda pendente some junto. O historico ja concluido fica.
  delete from occurrences
   where habit_id = p_habito and status = 'pendente' and data_sp >= public.hoje_sp();

  return json_build_object('ok', true);
end $$;

revoke execute on function
  public.criar_habito(text, jsonb, text, time, int, uuid),
  public.arquivar_habito(uuid),
  public.regra_valida(jsonb)
  from public, anon;

grant execute on function
  public.criar_habito(text, jsonb, text, time, int, uuid),
  public.arquivar_habito(uuid)
  to authenticated;
