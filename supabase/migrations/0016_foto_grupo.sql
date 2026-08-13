-- 0016_foto_grupo
--
-- Foto de capa do grupo, no mesmo padrao ja pago em 0009: bucket privado e o
-- primeiro segmento do caminho amarrado a quem tem direito sobre ele. Aqui o
-- dono do caminho nao e o usuario, e o grupo: `<group_id>/capa.webp`.
-- Le quem e membro, escreve so o dono. Sem amarrar o segmento, qualquer dono de
-- qualquer grupo escreveria na pasta de qualquer outro grupo.

alter table public.groups add column if not exists foto_path text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('grupos', 'grupos', false, 3145728, array['image/webp', 'image/jpeg', 'image/png'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Comparacao por texto, sem cast para uuid: caminho vem do cliente e um
-- primeiro segmento que nao seja uuid derrubaria a policy com erro de cast
-- em vez de simplesmente negar.
drop policy if exists p_grupos_select on storage.objects;
create policy p_grupos_select on storage.objects for select to authenticated
using (
  bucket_id = 'grupos'
  and exists (
    select 1 from public.groups g
     where g.id::text = (storage.foldername(storage.objects.name))[1]
       and public.e_membro(g.id)
  )
);

drop policy if exists p_grupos_insert on storage.objects;
create policy p_grupos_insert on storage.objects for insert to authenticated
with check (
  bucket_id = 'grupos'
  and exists (
    select 1 from public.groups g
     where g.id::text = (storage.foldername(storage.objects.name))[1]
       and g.dono_id = auth.uid()
  )
);

-- O `with check` nao e redundante: sem ele o dono trocaria o `name` da linha e
-- moveria o arquivo para a pasta de um grupo que nao e dele.
drop policy if exists p_grupos_update on storage.objects;
create policy p_grupos_update on storage.objects for update to authenticated
using (
  bucket_id = 'grupos'
  and exists (
    select 1 from public.groups g
     where g.id::text = (storage.foldername(storage.objects.name))[1]
       and g.dono_id = auth.uid()
  )
)
with check (
  bucket_id = 'grupos'
  and exists (
    select 1 from public.groups g
     where g.id::text = (storage.foldername(storage.objects.name))[1]
       and g.dono_id = auth.uid()
  )
);

drop policy if exists p_grupos_delete on storage.objects;
create policy p_grupos_delete on storage.objects for delete to authenticated
using (
  bucket_id = 'grupos'
  and exists (
    select 1 from public.groups g
     where g.id::text = (storage.foldername(storage.objects.name))[1]
       and g.dono_id = auth.uid()
  )
);

-- Gravar a coluna e RPC, nunca PATCH: o mesmo furo do item_equipado. Com
-- `grant update` na tabela, um membro qualquer apontaria o foto_path do grupo
-- para um arquivo que ele controla e driblaria a checagem de dono.
create or replace function public.definir_foto_grupo(p_grupo uuid, p_caminho text)
returns json language plpgsql security definer set search_path = public as $$
begin
  if p_caminho is null or p_caminho not like p_grupo::text || '/%' then
    return json_build_object('error', 'caminho_invalido');
  end if;

  -- Resposta unica para grupo inexistente e para quem nao e dono: mensagem
  -- diferente deixa descobrir quais grupos existem.
  if not exists (select 1 from groups where id = p_grupo and dono_id = auth.uid()) then
    return json_build_object('error', 'sem_permissao');
  end if;

  update groups set foto_path = p_caminho where id = p_grupo;

  return json_build_object('ok', true);
end $$;

-- `revoke ... from public, anon` nao tira o EXECUTE de authenticated.
revoke execute on function public.definir_foto_grupo(uuid, text)
  from public, anon, authenticated;
grant execute on function public.definir_foto_grupo(uuid, text) to authenticated;

-- Nao existe policy de update em groups, mas o privilegio de tabela vem aberto
-- por padrao. Revogar fecha a porta antes de alguem criar a policy sem pensar.
revoke update on public.groups from authenticated, anon;
